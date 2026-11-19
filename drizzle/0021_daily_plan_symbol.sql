DROP INDEX "daily_plans_trade_date_key";--> statement-breakpoint
ALTER TABLE "daily_plans" ADD COLUMN "symbol" text NOT NULL DEFAULT 'SPY';--> statement-breakpoint
ALTER TABLE "daily_plans" ALTER COLUMN "symbol" DROP DEFAULT;--> statement-breakpoint
CREATE UNIQUE INDEX "daily_plans_trade_date_symbol_key" ON "daily_plans" USING btree ("trade_date","symbol");
