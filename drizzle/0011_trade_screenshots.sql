CREATE TYPE "public"."screenshot_label" AS ENUM('setup', 'entry', 'exit');--> statement-breakpoint
CREATE TABLE "trade_screenshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trade_id" uuid NOT NULL,
	"label" "screenshot_label",
	"content_type" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trade_screenshots" ADD CONSTRAINT "trade_screenshots_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trade_screenshots_trade_idx" ON "trade_screenshots" USING btree ("trade_id");