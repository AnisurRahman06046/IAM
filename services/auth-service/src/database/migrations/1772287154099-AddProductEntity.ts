import { MigrationInterface, QueryRunner } from "typeorm";

export class AddProductEntity1772287154099 implements MigrationInterface {
    name = 'AddProductEntity1772287154099'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."products_status_enum" AS ENUM('active', 'inactive')`);
        await queryRunner.query(`CREATE TABLE "products" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "slug" character varying NOT NULL, "description" character varying, "frontend_url" character varying, "backend_url" character varying, "backend_port" integer, "kc_public_client_id" character varying, "kc_public_client_uuid" character varying, "kc_backend_client_id" character varying, "kc_backend_client_uuid" character varying, "kc_backend_client_secret" character varying, "apisix_route_id" character varying, "status" "public"."products_status_enum" NOT NULL DEFAULT 'active', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_464f927ae360106b783ed0b4106" UNIQUE ("slug"), CONSTRAINT "PK_0806c755e0aca124e67c0cf6d7d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_464f927ae360106b783ed0b410" ON "products" ("slug") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_464f927ae360106b783ed0b410"`);
        await queryRunner.query(`DROP TABLE "products"`);
        await queryRunner.query(`DROP TYPE "public"."products_status_enum"`);
    }

}
