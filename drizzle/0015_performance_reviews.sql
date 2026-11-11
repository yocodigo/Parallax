CREATE TABLE "performance_reviews" (
	"range_key" text PRIMARY KEY NOT NULL,
	"review" jsonb NOT NULL,
	"trade_count" integer NOT NULL,
	"range_from" date,
	"range_to" date,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL
);
