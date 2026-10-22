CREATE TYPE "public"."rule_kind" AS ENUM('edge', 'discipline');--> statement-breakpoint
CREATE TABLE "strategies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategy_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"strategy_id" uuid NOT NULL,
	"text" text NOT NULL,
	"kind" "rule_kind" NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trade_rule_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trade_id" uuid NOT NULL,
	"rule_id" uuid,
	"rule_text" text NOT NULL,
	"met" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "strategy_id" uuid;--> statement-breakpoint
ALTER TABLE "strategy_rules" ADD CONSTRAINT "strategy_rules_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_rule_checks" ADD CONSTRAINT "trade_rule_checks_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_rule_checks" ADD CONSTRAINT "trade_rule_checks_rule_id_strategy_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."strategy_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "strategy_rules_strategy_id_idx" ON "strategy_rules" USING btree ("strategy_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trade_rule_checks_trade_rule_idx" ON "trade_rule_checks" USING btree ("trade_id","rule_id");--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE set null ON UPDATE no action;