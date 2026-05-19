import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSubjectInContact1779217645681 implements MigrationInterface {
    name = 'AddSubjectInContact1779217645681'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "contact_messages" ADD "subject" text NOT NULL`);
        await queryRunner.query(`CREATE INDEX "IDX_11eb2c3d2d9e07f264907f40ef" ON "contact_messages" ("created_at") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_11eb2c3d2d9e07f264907f40ef"`);
        await queryRunner.query(`ALTER TABLE "contact_messages" DROP COLUMN "subject"`);
    }
}
