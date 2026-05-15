import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial schema for receive-forms.
 *
 * Creates:
 *   - pg_trgm extension (trigram search indexes)
 *   - contact_messages table
 *   - btree index on created_at for newest-first listings
 *   - GIN trigram indexes on name/email/message for ILIKE %q% searches
 */
export class InitContactMessages1715000000000 implements MigrationInterface {
  name = 'InitContactMessages1715000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "contact_messages" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "name" varchar(120) NOT NULL,
        "email" varchar(254) NOT NULL,
        "message" text NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "idx_contact_messages_created_at" ON "contact_messages" ("created_at")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "idx_contact_messages_name_trgm" ON "contact_messages" USING gin ("name" gin_trgm_ops)',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "idx_contact_messages_email_trgm" ON "contact_messages" USING gin ("email" gin_trgm_ops)',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "idx_contact_messages_message_trgm" ON "contact_messages" USING gin ("message" gin_trgm_ops)',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "idx_contact_messages_message_trgm"');
    await queryRunner.query('DROP INDEX IF EXISTS "idx_contact_messages_email_trgm"');
    await queryRunner.query('DROP INDEX IF EXISTS "idx_contact_messages_name_trgm"');
    await queryRunner.query('DROP INDEX IF EXISTS "idx_contact_messages_created_at"');
    await queryRunner.query('DROP TABLE IF EXISTS "contact_messages"');
  }
}
