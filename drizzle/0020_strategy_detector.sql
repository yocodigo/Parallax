CREATE TYPE "public"."setup_detector" AS ENUM('band_cross', 'four_touch', 'reversal', 'three_gate');--> statement-breakpoint
ALTER TABLE "strategies" ADD COLUMN "detector" "setup_detector";