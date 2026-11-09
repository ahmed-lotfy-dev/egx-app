-- Migration 0015: Add listing date to instruments
-- Allows filtering out stocks that weren't listed yet at document period

-- Add listed_at column to instruments
ALTER TABLE "instruments" ADD COLUMN "listed_at" date;

-- Create index for efficient filtering
CREATE INDEX "instruments_listed_at_idx" ON "instruments" ("listed_at");

-- Update existing instruments with a default listing date (assume they were listed before 2020)
-- This is a safe default - any stock in the DB as of now was listed at some point
UPDATE "instruments" SET "listed_at" = '2020-01-01' WHERE "listed_at" IS NULL;

-- Make it not null going forward
ALTER TABLE "instruments" ALTER COLUMN "listed_at" SET NOT NULL;

COMMENT ON COLUMN "instruments"."listed_at" IS 'Date when the instrument was first listed on EGX';
