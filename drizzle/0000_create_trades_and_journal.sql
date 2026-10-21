CREATE TYPE "public"."asset_class" AS ENUM('stock', 'option', 'crypto');--> statement-breakpoint
CREATE TYPE "public"."direction" AS ENUM('long', 'short');--> statement-breakpoint
CREATE TYPE "public"."exit_reason" AS ENUM('target', 'stop', 'time', 'discretionary');--> statement-breakpoint
CREATE TYPE "public"."journal_kind" AS ENUM('plan', 'review', 'thesis');--> statement-breakpoint
CREATE TYPE "public"."trade_mode" AS ENUM('live', 'paper', 'backtest');--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trade_id" uuid,
	"kind" "journal_kind" NOT NULL,
	"symbol" text,
	"notes" text NOT NULL,
	"emotion" text,
	"mistakes" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mode" "trade_mode" NOT NULL,
	"symbol" text NOT NULL,
	"asset_class" "asset_class" NOT NULL,
	"direction" "direction" NOT NULL,
	"quantity" numeric(18, 8) NOT NULL,
	"multiplier" integer DEFAULT 1 NOT NULL,
	"planned_entry" numeric(18, 6),
	"entry_price" numeric(18, 6),
	"initial_stop" numeric(18, 6),
	"target" numeric(18, 6),
	"exit_price" numeric(18, 6),
	"fees" numeric(12, 2) DEFAULT 0 NOT NULL,
	"opened_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"exit_reason" "exit_reason",
	"exited_per_plan" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trades_quantity_positive" CHECK ("trades"."quantity" > 0),
	CONSTRAINT "trades_multiplier_positive" CHECK ("trades"."multiplier" > 0),
	CONSTRAINT "trades_closed_after_opened" CHECK ("trades"."closed_at" IS NULL OR ("trades"."opened_at" IS NOT NULL AND "trades"."closed_at" >= "trades"."opened_at"))
);
--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "journal_entries_trade_id_idx" ON "journal_entries" USING btree ("trade_id");