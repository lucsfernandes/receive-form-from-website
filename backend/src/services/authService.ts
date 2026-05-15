import { createHash, randomBytes, randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { IsNull, LessThan, Not, Repository } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { env } from '../config/env';
import { User, type UserRole } from '../entities/User';
import { RefreshToken } from '../entities/RefreshToken';
import { PasswordResetToken } from '../entities/PasswordResetToken';
import { HttpError } from '../errors/HttpError';

export interface SafeUser {
  id: string;
  email: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
  // True only for synthetic users produced by the static-bearer code path.
  // Use this to skip user-row lookups, audit attribution, etc.
  isServiceAccount?: boolean;
}

interface AccessClaims {
  sub: string;
  role: UserRole;
}

interface IssuedSession {
  user: SafeUser;
  accessToken: string;
  accessExpiresAt: Date;
  refreshToken: string; // raw — only ever sent to the client once
  refreshExpiresAt: Date;
  csrfToken: string;
}

/**
 * Argon2id parameters. Tuned from env so prod can dial these up without a
 * code change. Defaults match OWASP's "low-end server" preset.
 */
const argonOpts = {
  type: argon2.argon2id,
  memoryCost: env.auth.argonMemoryKiB,
  timeCost: env.auth.argonTimeCost,
  parallelism: env.auth.argonParallelism,
} as const;

function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

function toSafeUser(u: User): SafeUser {
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
    lastLoginAt: u.lastLoginAt,
  };
}

class AuthService {
  private get users(): Repository<User> {
    return AppDataSource.getRepository(User);
  }

  private get refreshTokens(): Repository<RefreshToken> {
    return AppDataSource.getRepository(RefreshToken);
  }

  private get passwordResetTokens(): Repository<PasswordResetToken> {
    return AppDataSource.getRepository(PasswordResetToken);
  }

  /** Hashes a plaintext password with argon2id using the configured params. */
  async hashPassword(plain: string): Promise<string> {
    return argon2.hash(plain, argonOpts);
  }

  /** Constant-time-ish verify (argon2 verify is constant-time on the hash). */
  async verifyPassword(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      // Malformed hash, unsupported algo, etc. — treat as a failed compare.
      return false;
    }
  }

  /**
   * Create a new admin. Caller MUST verify the requester is an admin already
   * (or that this is a bootstrap call). Throws 409 if the email is taken.
   */
  async createUser(
    email: string,
    plainPassword: string,
    role: UserRole = 'admin',
  ): Promise<SafeUser> {
    const passwordHash = await this.hashPassword(plainPassword);
    const entity = this.users.create({ email, passwordHash, role, lastLoginAt: null });
    try {
      const saved = await this.users.save(entity);
      return toSafeUser(saved);
    } catch (err) {
      // The error mapper in errorHandler.ts also catches 23505, but throwing
      // a typed HttpError keeps the controller's flow easier to read.
      const pgCode = (err as { code?: string }).code;
      if (pgCode === '23505') {
        throw new HttpError(409, 'EmailTaken', 'E-mail já cadastrado');
      }
      throw err;
    }
  }

  /**
   * Look up a user by email. Returns null instead of throwing so the caller
   * can craft a generic "invalid credentials" response without leaking
   * existence info.
   */
  async findByEmail(email: string): Promise<User | null> {
    // ILIKE-equality keeps us symmetric with the LOWER(email) unique index.
    return this.users
      .createQueryBuilder('u')
      .where('LOWER(u.email) = LOWER(:email)', { email })
      .getOne();
  }

  async findById(id: string): Promise<SafeUser | null> {
    const u = await this.users.findOne({ where: { id } });
    return u ? toSafeUser(u) : null;
  }

  async hasAnyUser(): Promise<boolean> {
    return (await this.users.count()) > 0;
  }

  /**
   * Mints an access JWT + a fresh refresh token row. Returns the raw refresh
   * token alongside its DB id so we can hand it to the client (cookie) and
   * keep its hash in storage.
   */
  async issueSession(user: User, opts?: { familyId?: string }): Promise<IssuedSession> {
    const now = new Date();
    const accessExpiresAt = new Date(now.getTime() + env.auth.accessTtlSeconds * 1000);
    const refreshExpiresAt = new Date(now.getTime() + env.auth.refreshTtlSeconds * 1000);

    const claims: AccessClaims = { sub: user.id, role: user.role };
    // Sign with the currently-active key. We embed its kid in the JWT header
    // so verify can look up the matching secret in O(1) — necessary while a
    // rotation has multiple acceptable keys in play.
    const activeKey = env.auth.activeJwtKey;
    const accessToken = jwt.sign(claims, activeKey.secret, {
      expiresIn: env.auth.accessTtlSeconds,
      algorithm: 'HS256',
      keyid: activeKey.kid,
    } satisfies SignOptions);

    // 32 random bytes is way more than enough entropy; hex for cookie safety.
    const rawRefresh = randomBytes(32).toString('hex');
    const familyId = opts?.familyId ?? randomUUID();
    await this.refreshTokens.save(
      this.refreshTokens.create({
        tokenHash: sha256Hex(rawRefresh),
        familyId,
        userId: user.id,
        expiresAt: refreshExpiresAt,
        revokedAt: null,
      }),
    );

    // Bump last-login on every issuance — refresh counts as activity.
    user.lastLoginAt = now;
    await this.users.save(user);

    // CSRF token: short-lived, random, not signed. The client mirrors it in
    // a header on state-changing requests; the middleware compares.
    const csrfToken = randomBytes(24).toString('hex');

    return {
      user: toSafeUser(user),
      accessToken,
      accessExpiresAt,
      refreshToken: rawRefresh,
      refreshExpiresAt,
      csrfToken,
    };
  }

  /** Verifies an access JWT and returns the user, or null on any failure. */
  verifyAccessToken(token: string): AccessClaims | null {
    try {
      // Peek the header without verifying to pick the right key. jwt.verify's
      // synchronous form needs a concrete secret, so we read the kid first,
      // resolve it against our allow-list, then verify cryptographically.
      const undecoded = jwt.decode(token, { complete: true });
      if (!undecoded || typeof undecoded !== 'object') return null;
      const kid =
        typeof undecoded.header.kid === 'string' && undecoded.header.kid.length > 0
          ? undecoded.header.kid
          : 'default';
      const keyEntry = env.auth.jwtKeysByKid.get(kid);
      if (!keyEntry) return null;
      const decoded = jwt.verify(token, keyEntry.secret, {
        algorithms: ['HS256'],
      }) as AccessClaims & { iat?: number; exp?: number };
      if (typeof decoded.sub !== 'string' || typeof decoded.role !== 'string') return null;
      return { sub: decoded.sub, role: decoded.role as UserRole };
    } catch {
      return null;
    }
  }

  /**
   * Consume a refresh token and rotate. Throws on any anomaly.
   *
   *   - unknown token  -> 401
   *   - expired token  -> 401
   *   - reused token   -> revoke the whole family, 401  (theft signal)
   */
  async rotateRefresh(rawToken: string): Promise<IssuedSession> {
    const hash = sha256Hex(rawToken);
    const row = await this.refreshTokens.findOne({ where: { tokenHash: hash } });

    if (!row) {
      throw new HttpError(401, 'Unauthorized', 'Sessão inválida');
    }

    if (row.expiresAt.getTime() < Date.now()) {
      throw new HttpError(401, 'Unauthorized', 'Sessão expirada');
    }

    if (row.revokedAt) {
      // Reuse of an already-rotated token is a theft signal. Revoke the
      // entire family so the attacker can't keep the parallel chain alive.
      await this.refreshTokens.update(
        { familyId: row.familyId, revokedAt: undefined },
        { revokedAt: new Date() },
      );
      throw new HttpError(401, 'Unauthorized', 'Sessão inválida');
    }

    const user = await this.users.findOne({ where: { id: row.userId } });
    if (!user) {
      // User was deleted; clean up its tokens to keep the table tidy.
      await this.refreshTokens.update({ userId: row.userId }, { revokedAt: new Date() });
      throw new HttpError(401, 'Unauthorized', 'Sessão inválida');
    }

    // Revoke the consumed token, then issue a new one tied to the same family.
    row.revokedAt = new Date();
    await this.refreshTokens.save(row);

    return this.issueSession(user, { familyId: row.familyId });
  }

  /** Revoke a single refresh token (logout). Idempotent. */
  async revokeRefresh(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    const hash = sha256Hex(rawToken);
    await this.refreshTokens.update(
      { tokenHash: hash, revokedAt: undefined },
      { revokedAt: new Date() },
    );
  }

  /** Revoke every refresh token of a user. Used by global-logout flows. */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.refreshTokens.update(
      { userId, revokedAt: undefined },
      { revokedAt: new Date() },
    );
  }

  /**
   * Best-effort cleanup of expired rows. Called from the bootstrap hook on
   * startup AND from a periodic interval so the table doesn't grow forever
   * in long-lived deployments.
   */
  async purgeExpired(): Promise<number> {
    const now = new Date();
    const res = await this.refreshTokens.delete({ expiresAt: LessThan(now) });
    // Also sweep used/expired reset tokens — same reasoning, separate table.
    await this.passwordResetTokens.delete({ expiresAt: LessThan(now) });
    return res.affected ?? 0;
  }

  // ===========================================================================
  // Password change (self-service) ============================================
  // ===========================================================================

  /**
   * Change the password for the user that owns `userId`.
   *
   * Verifies `currentPassword` against the stored argon2id hash, then writes
   * the new hash. The caller's current refresh token is preserved (we don't
   * want to log the user out of the tab they're using) — every other refresh
   * token of theirs is revoked so other devices are forced to re-login.
   *
   * Returns the updated SafeUser on success. Throws 401 on bad current pwd.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    options?: { preserveRefreshToken?: string },
  ): Promise<SafeUser> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) {
      throw new HttpError(401, 'Unauthorized', 'Sessão inválida');
    }

    const ok = await this.verifyPassword(user.passwordHash, currentPassword);
    if (!ok) {
      throw new HttpError(401, 'InvalidCurrentPassword', 'Senha atual incorreta');
    }

    user.passwordHash = await this.hashPassword(newPassword);
    const saved = await this.users.save(user);

    // Force re-login on every other device but keep this tab alive.
    await this.revokeAllForUserExcept(userId, options?.preserveRefreshToken);
    return toSafeUser(saved);
  }

  /**
   * Revoke every active refresh token for a user EXCEPT the one whose raw
   * value matches `keepRawToken` (passed as the cookie value). Used by the
   * self-service password change so we don't kick the user out of their
   * own session.
   */
  async revokeAllForUserExcept(
    userId: string,
    keepRawToken: string | undefined,
  ): Promise<void> {
    if (!keepRawToken) {
      await this.revokeAllForUser(userId);
      return;
    }
    const keepHash = sha256Hex(keepRawToken);
    await this.refreshTokens.update(
      {
        userId,
        revokedAt: IsNull(),
        tokenHash: Not(keepHash),
      },
      { revokedAt: new Date() },
    );
  }

  // ===========================================================================
  // Password reset (forgot-password flow) =====================================
  // ===========================================================================

  /**
   * Create a password-reset token for the user that owns `email`. Returns
   * the RAW token (caller sends/logs it once) AND the userId — or null if
   * the email doesn't map to any user. The controller MUST NOT propagate the
   * null/non-null distinction to the client (anti-enumeration).
   */
  async createPasswordResetToken(
    email: string,
  ): Promise<{ rawToken: string; expiresAt: Date; userId: string } | null> {
    const user = await this.findByEmail(email);
    if (!user) return null;

    // 32 bytes of entropy is plenty; hex keeps the URL printable.
    const rawToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + env.auth.passwordResetTtlSeconds * 1000);

    await this.passwordResetTokens.save(
      this.passwordResetTokens.create({
        tokenHash: sha256Hex(rawToken),
        userId: user.id,
        expiresAt,
        usedAt: null,
      }),
    );

    return { rawToken, expiresAt, userId: user.id };
  }

  /**
   * Consume a password-reset token. On success:
   *   - replaces the password,
   *   - marks the reset token as used,
   *   - revokes every refresh token the user holds (no exceptions — if you
   *     forgot your password, every previous session is suspect).
   *
   * Throws 400 for bad/expired/used tokens.
   */
  async resetPasswordWithToken(rawToken: string, newPassword: string): Promise<void> {
    const hash = sha256Hex(rawToken);
    const row = await this.passwordResetTokens.findOne({ where: { tokenHash: hash } });

    if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) {
      throw new HttpError(
        400,
        'InvalidResetToken',
        'Link de redefinição inválido ou expirado',
      );
    }

    const user = await this.users.findOne({ where: { id: row.userId } });
    if (!user) {
      // User went away between token issue and use. Mark used to be safe.
      row.usedAt = new Date();
      await this.passwordResetTokens.save(row);
      throw new HttpError(
        400,
        'InvalidResetToken',
        'Link de redefinição inválido ou expirado',
      );
    }

    user.passwordHash = await this.hashPassword(newPassword);
    await this.users.save(user);

    row.usedAt = new Date();
    await this.passwordResetTokens.save(row);

    // Bulk-revoke every refresh token — including any open sessions the
    // attacker may have stitched together with the same compromised pwd.
    await this.revokeAllForUser(user.id);
  }
}

export const authService = new AuthService();
export { toSafeUser };
