import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type UserRole = 'admin';

/**
 * A dashboard operator. Authentication is local (email + argon2id hash).
 * Role is an enum to leave room for future scopes; only "admin" exists today.
 *
 * Email is stored lowercased + trimmed by the validator before reaching here,
 * so the unique index is enough to enforce uniqueness without citext.
 */
@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // Unique-by-lowercase email is enforced by a functional index
  // (`idx_users_email_unique` on `LOWER(email)`) created in the migration.
  // We don't declare it via `@Index` here because the decorator can't
  // express the LOWER() expression, and declaring a plain unique index
  // would conflict with the migration when synchronize is on.
  @Column({ type: 'varchar', length: 254 })
  email!: string;

  // Always serialise carefully — must never leak in API responses or logs.
  @Column({ type: 'text', name: 'password_hash' })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 32, default: 'admin' })
  role!: UserRole;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;

  @Column({ type: 'timestamptz', name: 'last_login_at', nullable: true })
  lastLoginAt!: Date | null;
}
