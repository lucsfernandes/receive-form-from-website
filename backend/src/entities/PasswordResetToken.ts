import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Single-use token issued by /api/auth/password/forgot. Mirrors the refresh-
 * token storage strategy: we keep only a SHA-256 hash so a DB leak doesn't
 * hand attackers usable reset links.
 *
 * Lifetime: 1h by default (env.auth.passwordResetTtlSeconds).
 *
 * Lifecycle:
 *   - created  -> usedAt = null, expiresAt = now + TTL
 *   - consumed -> usedAt = now (idempotent rejection on reuse)
 *   - expired  -> swept by the housekeeping job, or rejected on lookup
 */
@Entity({ name: 'password_reset_tokens' })
export class PasswordResetToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // SHA-256 hex digest of the raw token. Unique so a brute-force collision
  // gets a clean conflict instead of silently corrupting state.
  @Index('idx_password_reset_tokens_hash_unique', { unique: true })
  @Column({ type: 'varchar', length: 64, name: 'token_hash' })
  tokenHash!: string;

  @Index('idx_password_reset_tokens_user')
  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt!: Date;

  // Stamped on successful /password/reset. After that the token is dead even
  // if someone replays it before the expiresAt window closes.
  @Column({ type: 'timestamptz', name: 'used_at', nullable: true })
  usedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
