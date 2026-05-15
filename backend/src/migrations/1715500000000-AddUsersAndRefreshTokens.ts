import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds authentication tables:
 *   - users           (one row per dashboard operator)
 *   - refresh_tokens  (rotation-enabled refresh-token store; hash-only)
 *
 * Indices:
 *   - unique on lower(email) so case differences can't dupe accounts
 *   - btree on user_id and family_id for revocation sweeps
 *   - partial index on (token_hash) WHERE revoked_at IS NULL for fast hit lookups
 */
export class AddUsersAndRefreshTokens1715500000000 implements MigrationInterface {
  name = 'AddUsersAndRefreshTokens1715500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // users table -------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "email" varchar(254) NOT NULL,
        "password_hash" text NOT NULL,
        "role" varchar(32) NOT NULL DEFAULT 'admin',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "last_login_at" timestamptz NULL
      )
    `);

    // Unique-by-lowercase email. Validator already lowercases, but this is the
    // authoritative defense — even raw inserts can't sneak a dupe past it.
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "idx_users_email_unique" ON "users" (LOWER("email"))',
    );

    // refresh_tokens table ----------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "refresh_tokens" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "token_hash" varchar(64) NOT NULL,
        "family_id" uuid NOT NULL,
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "expires_at" timestamptz NOT NULL,
        "revoked_at" timestamptz NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "idx_refresh_tokens_hash_unique" ON "refresh_tokens" ("token_hash")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "idx_refresh_tokens_user" ON "refresh_tokens" ("user_id")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "idx_refresh_tokens_family" ON "refresh_tokens" ("family_id")',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "idx_refresh_tokens_family"');
    await queryRunner.query('DROP INDEX IF EXISTS "idx_refresh_tokens_user"');
    await queryRunner.query('DROP INDEX IF EXISTS "idx_refresh_tokens_hash_unique"');
    await queryRunner.query('DROP TABLE IF EXISTS "refresh_tokens"');
    await queryRunner.query('DROP INDEX IF EXISTS "idx_users_email_unique"');
    await queryRunner.query('DROP TABLE IF EXISTS "users"');
  }
}
