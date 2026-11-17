ALTER TABLE "daily_plans" ALTER COLUMN "ltf_direction" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_plans" ALTER COLUMN "ltf_fib_50" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_plans" ALTER COLUMN "ltf_fib_100" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_plans" ADD CONSTRAINT "daily_plans_ltf_fib_complete" CHECK (num_nulls("daily_plans"."ltf_direction", "daily_plans"."ltf_fib_50", "daily_plans"."ltf_fib_100") IN (0, 3));