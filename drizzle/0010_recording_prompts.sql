CREATE TABLE "recording_prompts" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"pre_trade_prompt" text NOT NULL,
	"end_of_day_prompt" text NOT NULL,
	"mic_tips" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recording_prompts_single_row" CHECK ("recording_prompts"."id" = 1)
);
