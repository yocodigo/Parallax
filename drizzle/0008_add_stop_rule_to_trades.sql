CREATE TYPE "public"."stop_rule" AS ENUM('S1', 'S2', 'S3');--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "stop_rule" "stop_rule";