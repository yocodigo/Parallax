CREATE TABLE "circuit_breaker_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"max_daily_loss_r" numeric(6, 2),
	"max_trades_per_day" integer,
	"cooldown_after_losses" integer,
	"cooldown_minutes" integer,
	"modes" "trade_mode"[] DEFAULT '{live}'::trade_mode[] NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "circuit_breaker_settings_single_row" CHECK ("circuit_breaker_settings"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "overridden_breakers" text[] DEFAULT '{}'::text[] NOT NULL;