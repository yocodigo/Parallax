ALTER TABLE "journal_entries" ADD COLUMN "mode" "trade_mode" DEFAULT 'live' NOT NULL;--> statement-breakpoint
-- Entries already linked to a trade take its mode.
UPDATE "journal_entries" SET "mode" = "trades"."mode" FROM "trades" WHERE "journal_entries"."trade_id" = "trades"."id";
