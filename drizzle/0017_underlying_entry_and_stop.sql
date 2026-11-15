CREATE TYPE "public"."underlying_stop_rule" AS ENUM('band_cross_s2');--> statement-breakpoint
CREATE TYPE "public"."underlying_stop_source" AS ENUM('plan', 'derived');--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "underlying_entry" numeric(18, 6);--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "underlying_stop" numeric(18, 6);--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "underlying_stop_source" "underlying_stop_source";--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "underlying_stop_rule" "underlying_stop_rule";--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_underlying_only_on_options" CHECK ("trades"."asset_class" = 'option' OR ("trades"."underlying_entry" IS NULL AND "trades"."underlying_stop" IS NULL));--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_underlying_stop_has_source" CHECK (("trades"."underlying_stop" IS NULL) = ("trades"."underlying_stop_source" IS NULL));--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_underlying_stop_rule_when_derived" CHECK (("trades"."underlying_stop_rule" IS NOT NULL) = ("trades"."underlying_stop_source" IS NOT DISTINCT FROM 'derived'));