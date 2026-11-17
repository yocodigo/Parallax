ALTER TABLE "daily_plans" ADD COLUMN "asia_high" numeric(18, 6);--> statement-breakpoint
ALTER TABLE "daily_plans" ADD COLUMN "asia_low" numeric(18, 6);--> statement-breakpoint
ALTER TABLE "daily_plans" ADD COLUMN "london_high" numeric(18, 6);--> statement-breakpoint
ALTER TABLE "daily_plans" ADD COLUMN "london_low" numeric(18, 6);--> statement-breakpoint
ALTER TABLE "daily_plans" ADD COLUMN "premarket_high" numeric(18, 6);--> statement-breakpoint
ALTER TABLE "daily_plans" ADD COLUMN "premarket_low" numeric(18, 6);--> statement-breakpoint
ALTER TABLE "daily_plans" ADD CONSTRAINT "daily_plans_asia_order" CHECK ("daily_plans"."asia_high" >= "daily_plans"."asia_low");--> statement-breakpoint
ALTER TABLE "daily_plans" ADD CONSTRAINT "daily_plans_london_order" CHECK ("daily_plans"."london_high" >= "daily_plans"."london_low");--> statement-breakpoint
ALTER TABLE "daily_plans" ADD CONSTRAINT "daily_plans_premarket_order" CHECK ("daily_plans"."premarket_high" >= "daily_plans"."premarket_low");