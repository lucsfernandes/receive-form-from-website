import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFakeDataSource } from './helpers/fakeDataSource';
import { authService } from '../src/services/authService';
import { HttpError } from '../src/errors/HttpError';

/**
 * Coverage focus on the security-critical seams: password hashing, refresh
 * rotation behaviour, family revocation on reuse, and the new
 * change/reset flows that revoke other sessions.
 *
 * The DB is in-memory (see fakeDataSource.ts) so the suite runs in a few
 * seconds even with real argon2 calls (which we tuned down via env vars in
 * tests/setup.ts).
 */
describe('authService', () => {
  let teardown: () => void;

  beforeEach(async () => {
    const installed = await installFakeDataSource();
    teardown = installed.uninstall;
  });

  afterEach(() => {
    teardown();
  });

  describe('password hashing', () => {
    it('produces an argon2id hash and verifies the original input', async () => {
      const hash = await authService.hashPassword('correct-horse-battery-1');
      expect(hash.startsWith('$argon2id$')).toBe(true);
      await expect(authService.verifyPassword(hash, 'correct-horse-battery-1')).resolves.toBe(true);
      await expect(authService.verifyPassword(hash, 'wrong-password-9999')).resolves.toBe(false);
    });

    it('returns false on a malformed hash instead of throwing', async () => {
      await expect(authService.verifyPassword('not-a-hash', 'anything')).resolves.toBe(false);
    });
  });

  describe('issueSession + verifyAccessToken', () => {
    it('mints a token that verifies back to the user id and role', async () => {
      const user = await authService.createUser('issue@test.com', 'TestPassword123!');
      const persisted = await authService.findByEmail('issue@test.com');
      expect(persisted).toBeTruthy();
      const session = await authService.issueSession(persisted!);

      const claims = authService.verifyAccessToken(session.accessToken);
      expect(claims?.sub).toBe(user.id);
      expect(claims?.role).toBe('admin');
    });

    it('returns null when verifying a token signed with a different secret', async () => {
      // A token shaped like a valid HS256 but with a wrong-key signature.
      const bogus =
        // header: {"alg":"HS256","typ":"JWT","kid":"default"} payload: {"sub":"x","role":"admin"} - sig: garbage
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImRlZmF1bHQifQ.eyJzdWIiOiJ4Iiwicm9sZSI6ImFkbWluIn0.bogus-signature';
      expect(authService.verifyAccessToken(bogus)).toBeNull();
    });

    it('rejects a token whose kid is not in the keyring', async () => {
      const user = await authService.createUser('kid@test.com', 'TestPassword123!');
      const persisted = await authService.findByEmail('kid@test.com');
      const session = await authService.issueSession(persisted!);
      // Mutate the kid in the header — verify should reject because the lookup misses.
      const [headerB64, payload, sig] = session.accessToken.split('.');
      const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
      header.kid = 'nope-not-a-real-kid';
      const tampered =
        Buffer.from(JSON.stringify(header), 'utf8').toString('base64url') +
        '.' +
        payload +
        '.' +
        sig;
      expect(authService.verifyAccessToken(tampered)).toBeNull();
      expect(user.id).toBeTruthy();
    });
  });

  describe('rotateRefresh', () => {
    it('rotates the token on first use and invalidates the old one', async () => {
      const user = await authService.createUser('rot@test.com', 'TestPassword123!');
      const persisted = await authService.findByEmail('rot@test.com');
      const first = await authService.issueSession(persisted!);

      const second = await authService.rotateRefresh(first.refreshToken);
      expect(second.refreshToken).not.toBe(first.refreshToken);
      expect(second.user.id).toBe(user.id);

      // The original token is now revoked — attempting to use it again triggers
      // family revocation (theft signal).
      await expect(authService.rotateRefresh(first.refreshToken)).rejects.toBeInstanceOf(HttpError);
    });

    it('revokes the entire family when a consumed token is replayed', async () => {
      const user = await authService.createUser('family@test.com', 'TestPassword123!');
      const persisted = await authService.findByEmail('family@test.com');
      const s1 = await authService.issueSession(persisted!);
      const s2 = await authService.rotateRefresh(s1.refreshToken);

      // Replaying s1 should: throw AND retroactively revoke s2 (same family).
      await expect(authService.rotateRefresh(s1.refreshToken)).rejects.toBeInstanceOf(HttpError);
      // s2 is in the family that just got revoked, so trying to use it now
      // also throws — confirming the family-wide kill.
      await expect(authService.rotateRefresh(s2.refreshToken)).rejects.toBeInstanceOf(HttpError);
      expect(user.id).toBeTruthy();
    });

    it('throws 401 for an unknown token', async () => {
      await expect(authService.rotateRefresh('totally-fabricated-token')).rejects.toBeInstanceOf(
        HttpError,
      );
    });
  });

  describe('login flow (verifyPassword + findByEmail)', () => {
    it('treats the wrong password as a plain false (no enumeration via exceptions)', async () => {
      await authService.createUser('login@test.com', 'TestPassword123!');
      const found = await authService.findByEmail('LOGIN@test.com'); // case-insensitive
      expect(found).toBeTruthy();
      await expect(authService.verifyPassword(found!.passwordHash, 'NotTheRightOne')).resolves.toBe(
        false,
      );
    });

    it('returns null for an unknown email', async () => {
      expect(await authService.findByEmail('nobody@nowhere.test')).toBeNull();
    });
  });

  describe('changePassword (self-service)', () => {
    it('replaces the hash and revokes every refresh token EXCEPT the kept one', async () => {
      const user = await authService.createUser('change@test.com', 'OldPassword123!');
      const persisted = await authService.findByEmail('change@test.com');

      const tabA = await authService.issueSession(persisted!);
      const tabB = await authService.issueSession(persisted!);
      const tabC = await authService.issueSession(persisted!);

      await authService.changePassword(user.id, 'OldPassword123!', 'NewPassword456!', {
        preserveRefreshToken: tabA.refreshToken,
      });

      // The kept token still rotates.
      await expect(authService.rotateRefresh(tabA.refreshToken)).resolves.toBeTruthy();
      // The others are dead.
      await expect(authService.rotateRefresh(tabB.refreshToken)).rejects.toBeInstanceOf(HttpError);
      await expect(authService.rotateRefresh(tabC.refreshToken)).rejects.toBeInstanceOf(HttpError);

      // And the new password actually works.
      const after = await authService.findByEmail('change@test.com');
      await expect(authService.verifyPassword(after!.passwordHash, 'NewPassword456!')).resolves.toBe(
        true,
      );
      await expect(authService.verifyPassword(after!.passwordHash, 'OldPassword123!')).resolves.toBe(
        false,
      );
    });

    it('rejects when the current password is wrong', async () => {
      const user = await authService.createUser('badpw@test.com', 'OldPassword123!');
      await expect(
        authService.changePassword(user.id, 'WrongPasswordZZZ', 'NewPassword456!'),
      ).rejects.toMatchObject({ status: 401 });
    });
  });

  describe('password reset', () => {
    it('issues a token, lets the holder reset, and revokes every session', async () => {
      const user = await authService.createUser('reset@test.com', 'OldPassword123!');
      const persisted = await authService.findByEmail('reset@test.com');
      const live = await authService.issueSession(persisted!);

      const issued = await authService.createPasswordResetToken('reset@test.com');
      expect(issued).not.toBeNull();
      expect(issued!.userId).toBe(user.id);

      await authService.resetPasswordWithToken(issued!.rawToken, 'BrandNewPassword789!');

      // Reusing the same token must fail.
      await expect(
        authService.resetPasswordWithToken(issued!.rawToken, 'TryAgain123!'),
      ).rejects.toMatchObject({ status: 400 });

      // The live session that existed pre-reset is dead.
      await expect(authService.rotateRefresh(live.refreshToken)).rejects.toBeInstanceOf(HttpError);

      // The new password works.
      const updated = await authService.findByEmail('reset@test.com');
      await expect(
        authService.verifyPassword(updated!.passwordHash, 'BrandNewPassword789!'),
      ).resolves.toBe(true);
    });

    it('returns null for unknown emails (caller is anti-enumeration)', async () => {
      expect(await authService.createPasswordResetToken('ghost@nowhere.test')).toBeNull();
    });

    it('rejects an expired reset token', async () => {
      await authService.createUser('expire@test.com', 'OldPassword123!');
      const issued = await authService.createPasswordResetToken('expire@test.com');
      expect(issued).not.toBeNull();

      // Walk the stored row's expiresAt into the past.
      const { AppDataSource } = await import('../src/config/data-source');
      const { PasswordResetToken } = await import('../src/entities/PasswordResetToken');
      const repo = AppDataSource.getRepository(PasswordResetToken);
      // The fake repo doesn't expose .find(); reach in through the saved entity.
      const all = (
        (await repo.findOne({ where: {} as never })) as unknown as
          | { expiresAt: Date }
          | null
      );
      // Easier: nuke through the same store we kept in this test's mock.
      // The cleanest way is to reset via the reset flow with a stale token.
      void all;

      // Force expiry by waiting on a tiny TTL: rebuild the token with a past expiry
      // through a direct repository.save.
      const reset = (await repo.findOne({ where: {} as never })) as unknown as
        | { expiresAt: Date }
        | null;
      if (reset) {
        reset.expiresAt = new Date(Date.now() - 1000);
        await repo.save(reset as never);
      }

      await expect(
        authService.resetPasswordWithToken(issued!.rawToken, 'NewPwd9999!'),
      ).rejects.toMatchObject({ status: 400 });
    });
  });

  describe('purgeExpired', () => {
    it('deletes refresh tokens whose expiresAt is in the past', async () => {
      const user = await authService.createUser('purge@test.com', 'TestPassword123!');
      const persisted = await authService.findByEmail('purge@test.com');
      const session = await authService.issueSession(persisted!);

      // Force the row into the past via the fake repo.
      const { AppDataSource } = await import('../src/config/data-source');
      const { RefreshToken } = await import('../src/entities/RefreshToken');
      const repo = AppDataSource.getRepository(RefreshToken);
      const row = await repo.findOne({ where: {} as never });
      if (row) {
        row.expiresAt = new Date(Date.now() - 10_000);
        await repo.save(row);
      }

      const purged = await authService.purgeExpired();
      expect(purged).toBeGreaterThanOrEqual(1);

      // The token is gone; using it now yields a generic 401.
      await expect(authService.rotateRefresh(session.refreshToken)).rejects.toBeInstanceOf(HttpError);
      expect(user.id).toBeTruthy();
    });
  });
});
