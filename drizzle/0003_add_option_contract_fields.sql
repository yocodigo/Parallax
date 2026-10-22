CREATE TYPE "public"."option_type" AS ENUM('call', 'put');--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "option_type" "option_type";--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "strike" numeric(18, 6);--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "expiration" date;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_option_fields_only_on_options" CHECK ("trades"."asset_class" = 'option' OR ("trades"."option_type" IS NULL AND "trades"."strike" IS NULL AND "trades"."expiration" IS NULL));