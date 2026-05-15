import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Server-side store for refresh tokens. We persist a SHA-256 of the token
 * (not the token itself) so a DB leak doesn't hand attackers usable sessions.
 *
 * Rotation: every successful /auth/refresh consumes the previous row
 * (sets revoked_at) and emits a new row. Reuse of a revoked token is a
 * theft signal — we revoke the whole family in that case.
 */
@Entity({ name: 'refresh_tokens' })
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // Hash of the random token bytes. Indexed for lookup.
  @Index('idx_refresh_tokens_hash_unique', { unique: true })
  @Column({ type: 'varchar', length: 64, name: 'token_hash' })
  tokenHash!: string;

  // Family root — propagates across rotations so we can revoke a stolen chain.
  @Index('idx_refresh_tokens_family')
  @Column({ type: 'uuid', name: 'family_id' })
  familyId!: string;

  @Index('idx_refresh_tokens_user')
  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt!: Date;

  @Column({ type: 'timestamptz', name: 'revoked_at', nullable: true })
  revokedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
