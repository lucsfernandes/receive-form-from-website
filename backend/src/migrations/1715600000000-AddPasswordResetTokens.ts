import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the password_reset_tokens table for the /api/auth/password/forgot +
 * /api/auth/password/reset flow. Mirrors the refresh-tokens pattern: only
 * SHA-256 hashes are persisted so a DB leak doesn't hand out usable reset
 * links.
 */
export class AddPasswordResetTokens1715600000000 implements MigrationInterface {
  name = 'AddPasswordResetTokens1715600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "token_hash" varchar(64) NOT NULL,
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "expires_at" timestamptz NOT NULL,
        "used_at" timestamptz NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "idx_password_reset_tokens_hash_unique" ON "password_reset_tokens" ("token_hash")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "idx_password_reset_tokens_user" ON "password_reset_tokens" ("user_id")',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "idx_password_reset_tokens_user"');
    await queryRunner.query(
      'DROP INDEX IF EXISTS "idx_password_reset_tokens_hash_unique"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "password_reset_tokens"');
  }
}
