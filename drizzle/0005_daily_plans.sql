CREATE TYPE "public"."fib_direction" AS ENUM('bullish', 'bearish');--> statement-breakpoint
CREATE TABLE "daily_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trade_date" date NOT NULL,
	"ltf_direction" "fib_direction" NOT NULL,
	"ltf_fib_50" numeric(18, 6) NOT NULL,
	"ltf_fib_100" numeric(18, 6) NOT NULL,
	"htf_direction" "fib_direction",
	"htf_fib_50" numeric(18, 6),
	"htf_fib_100" numeric(18, 6),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_plans_htf_fib_complete" CHECK (num_nulls("daily_plans"."htf_direction", "daily_plans"."htf_fib_50", "daily_plans"."htf_fib_100") IN (0, 3))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "daily_plans_trade_date_key" ON "daily_plans" USING btree ("trade_date");