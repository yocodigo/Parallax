ALTER TABLE "circuit_breaker_settings" ADD COLUMN "max_daily_loss_options_dollars" numeric(8, 2);--> statement-breakpoint
-- Turns the options dollar breaker on at $30/day for live trades, Joel's own
-- setting (2026-10-24), whether or not a settings row already exists.
INSERT INTO "circuit_breaker_settings" ("id", "max_daily_loss_options_dollars") VALUES (1, 30)
ON CONFLICT ("id") DO UPDATE SET "max_daily_loss_options_dollars" = 30;