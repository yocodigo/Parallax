CREATE TABLE "rule_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"windows_on" boolean NOT NULL,
	"windows" jsonb NOT NULL,
	"size_on" boolean NOT NULL,
	"size_min" integer NOT NULL,
	"size_max" integer NOT NULL,
	"premium_band_on" boolean NOT NULL,
	"premium_min" numeric(8, 2) NOT NULL,
	"premium_max" numeric(8, 2),
	"risk_per_trade" numeric(8, 2),
	"backstop_on" boolean NOT NULL,
	"backstop_pct" numeric(5, 4) NOT NULL,
	"time_stop_on" boolean NOT NULL,
	"time_stop_minutes" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rule_settings_single_row" CHECK ("rule_settings"."id" = 1)
);
