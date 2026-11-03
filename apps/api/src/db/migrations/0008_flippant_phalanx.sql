ALTER TABLE "instruments" ADD COLUMN "market" text DEFAULT 'EGX' NOT NULL;--> statement-breakpoint
CREATE INDEX "instruments_market_idx" ON "instruments" USING btree ("market");