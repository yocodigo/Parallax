ALTER TABLE "trades" ALTER COLUMN "exit_reason" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."exit_reason";--> statement-breakpoint
CREATE TYPE "public"."exit_reason" AS ENUM('invalidation', 'target', 'fib_rejection', 'planned_partial', 'structural_trail', 'planned_time_exit', 'sweep_scare', 'adverse_candle', 'pnl_moved', 'time_in_trade', 'felt_heavy');--> statement-breakpoint
ALTER TABLE "trades" ALTER COLUMN "exit_reason" SET DATA TYPE "public"."exit_reason" USING "exit_reason"::"public"."exit_reason";