DELETE FROM "instruments" WHERE "market" = 'SAUDI';--> statement-breakpoint
DROP INDEX "instruments_market_idx";--> statement-breakpoint
ALTER TABLE "instruments" DROP COLUMN "market";