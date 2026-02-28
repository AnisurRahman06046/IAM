import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1772216636319 implements MigrationInterface {
    name = 'InitialSchema1772216636319'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."tenants_plan_enum" AS ENUM('basic', 'pro', 'enterprise')`);
        await queryRunner.query(`CREATE TYPE "public"."tenants_status_enum" AS ENUM('active', 'inactive', 'suspended')`);
        await queryRunner.query(`CREATE TABLE "tenants" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "keycloak_org_id" character varying, "name" character varying NOT NULL, "alias" character varying NOT NULL, "product" character varying NOT NULL, "plan" "public"."tenants_plan_enum" NOT NULL DEFAULT 'basic', "max_users" integer NOT NULL DEFAULT '50', "status" "public"."tenants_status_enum" NOT NULL DEFAULT 'active', "billing_email" character varying, "domain" character varying, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_09479fb3287897324448cea91a6" UNIQUE ("alias"), CONSTRAINT "PK_53be67a04681c66b87ee27c9321" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_09479fb3287897324448cea91a" ON "tenants" ("alias") `);
        await queryRunner.query(`CREATE TABLE "registration_configs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "product" character varying NOT NULL, "required_fields" jsonb NOT NULL DEFAULT '[]', "validation_rules" jsonb NOT NULL DEFAULT '{}', "default_realm_role" character varying NOT NULL DEFAULT 'end_user', "default_client_roles" jsonb NOT NULL DEFAULT '[]', "self_registration_enabled" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_59c57004dcf61141f03d1f8722e" UNIQUE ("product"), CONSTRAINT "PK_860b8630db0558506ef4d5301f1" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_59c57004dcf61141f03d1f8722" ON "registration_configs" ("product") `);
        await queryRunner.query(`CREATE TYPE "public"."otp_records_purpose_enum" AS ENUM('login_mfa', 'password_reset', 'phone_verify')`);
        await queryRunner.query(`CREATE TABLE "otp_records" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_identifier" character varying NOT NULL, "otp_hash" character varying NOT NULL, "purpose" "public"."otp_records_purpose_enum" NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "verified" boolean NOT NULL DEFAULT false, "attempts" integer NOT NULL DEFAULT '0', "max_attempts" integer NOT NULL DEFAULT '5', "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_3def88b3f662809c2c75f04e016" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."invitations_status_enum" AS ENUM('pending', 'accepted', 'expired', 'revoked')`);
        await queryRunner.query(`CREATE TABLE "invitations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" uuid NOT NULL, "email" character varying NOT NULL, "role" character varying NOT NULL, "token" character varying NOT NULL, "status" "public"."invitations_status_enum" NOT NULL DEFAULT 'pending', "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "accepted_at" TIMESTAMP WITH TIME ZONE, "invited_by" character varying NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_e577dcf9bb6d084373ed3998509" UNIQUE ("token"), CONSTRAINT "PK_5dec98cfdfd562e4ad3648bbb07" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_e577dcf9bb6d084373ed399850" ON "invitations" ("token") `);
        await queryRunner.query(`CREATE TYPE "public"."audit_logs_actor_type_enum" AS ENUM('user', 'system', 'service')`);
        await queryRunner.query(`CREATE TABLE "audit_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "actor_id" character varying NOT NULL, "actor_type" "public"."audit_logs_actor_type_enum" NOT NULL, "action" character varying NOT NULL, "resource_type" character varying NOT NULL, "resource_id" character varying, "tenant_id" character varying, "metadata" jsonb, "ip_address" character varying, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_177183f29f438c488b5e8510cd" ON "audit_logs" ("actor_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_cee5459245f652b75eb2759b4c" ON "audit_logs" ("action") `);
        await queryRunner.query(`CREATE INDEX "IDX_6f18d459490bb48923b1f40bdb" ON "audit_logs" ("tenant_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_2cd10fda8276bb995288acfbfb" ON "audit_logs" ("created_at") `);
        await queryRunner.query(`ALTER TABLE "invitations" ADD CONSTRAINT "FK_290e75d606ba89eb421b8b5ec49" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "invitations" DROP CONSTRAINT "FK_290e75d606ba89eb421b8b5ec49"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_2cd10fda8276bb995288acfbfb"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_6f18d459490bb48923b1f40bdb"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_cee5459245f652b75eb2759b4c"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_177183f29f438c488b5e8510cd"`);
        await queryRunner.query(`DROP TABLE "audit_logs"`);
        await queryRunner.query(`DROP TYPE "public"."audit_logs_actor_type_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e577dcf9bb6d084373ed399850"`);
        await queryRunner.query(`DROP TABLE "invitations"`);
        await queryRunner.query(`DROP TYPE "public"."invitations_status_enum"`);
        await queryRunner.query(`DROP TABLE "otp_records"`);
        await queryRunner.query(`DROP TYPE "public"."otp_records_purpose_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_59c57004dcf61141f03d1f8722"`);
        await queryRunner.query(`DROP TABLE "registration_configs"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_09479fb3287897324448cea91a"`);
        await queryRunner.query(`DROP TABLE "tenants"`);
        await queryRunner.query(`DROP TYPE "public"."tenants_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."tenants_plan_enum"`);
    }

}
