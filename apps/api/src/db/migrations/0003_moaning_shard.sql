CREATE TABLE "news_processing_queue" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"news_id" bigint NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"priority" integer DEFAULT 0,
	"attempts" integer DEFAULT 0,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "news_items" ADD COLUMN "original_lang" text;--> statement-breakpoint
ALTER TABLE "news_items" ADD COLUMN "translated_title" text;--> statement-breakpoint
ALTER TABLE "news_items" ADD COLUMN "translated_summary" text;--> statement-breakpoint
ALTER TABLE "news_items" ADD COLUMN "ai_summary" text;--> statement-breakpoint
ALTER TABLE "news_items" ADD COLUMN "ai_key_points" jsonb;--> statement-breakpoint
ALTER TABLE "news_items" ADD COLUMN "sentiment" text;--> statement-breakpoint
ALTER TABLE "news_items" ADD COLUMN "impact_score" integer;--> statement-breakpoint
ALTER TABLE "news_items" ADD COLUMN "impact_level" text;--> statement-breakpoint
ALTER TABLE "news_items" ADD COLUMN "entities" jsonb;--> statement-breakpoint
ALTER TABLE "news_items" ADD COLUMN "source_region" text;--> statement-breakpoint
ALTER TABLE "news_items" ADD COLUMN "source_category" text;--> statement-breakpoint
ALTER TABLE "news_items" ADD COLUMN "processed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "news_items" ADD COLUMN "processing_version" text;--> statement-breakpoint
ALTER TABLE "news_processing_queue" ADD CONSTRAINT "news_processing_queue_news_id_news_items_id_fk" FOREIGN KEY ("news_id") REFERENCES "public"."news_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "news_processing_queue_status_priority_idx" ON "news_processing_queue" USING btree ("status","priority" DESC NULLS LAST,"created_at");--> statement-breakpoint
CREATE INDEX "news_items_impact_idx" ON "news_items" USING btree ("impact_score" DESC NULLS LAST,"published_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "news_items_region_idx" ON "news_items" USING btree ("source_region");--> statement-breakpoint
CREATE INDEX "news_items_sentiment_idx" ON "news_items" USING btree ("sentiment");--> statement-breakpoint
CREATE INDEX "news_items_entities_gin" ON "news_items" USING gin ("entities");