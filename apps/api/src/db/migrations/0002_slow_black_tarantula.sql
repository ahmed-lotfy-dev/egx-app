CREATE TABLE "fundamentals" (
	"instrument_id" bigint NOT NULL,
	"source" text NOT NULL,
	"as_of" date,
	"observed_at" timestamp with time zone NOT NULL,
	"currency" text,
	"market_cap" numeric(24, 2),
	"pe" numeric(18, 4),
	"pb" numeric(18, 4),
	"eps" numeric(18, 4),
	"roe" numeric(12, 4),
	"roa" numeric(12, 4),
	"debt_to_equity" numeric(18, 4),
	"dividend_yield" numeric(12, 4),
	"revenue_ttm" numeric(24, 2),
	"net_income_ttm" numeric(24, 2),
	"fcf_ttm" numeric(24, 2),
	"current_ratio" numeric(12, 4),
	"beta" numeric(12, 4),
	"gross_margin" numeric(12, 4),
	"net_margin" numeric(12, 4),
	"total_debt" numeric(24, 2),
	"total_assets" numeric(24, 2),
	"book_value_per_share" numeric(18, 4),
	"ev_ebitda" numeric(18, 4),
	"raw" jsonb,
	CONSTRAINT "fundamentals_instrument_id_source_pk" PRIMARY KEY("instrument_id","source")
);
--> statement-breakpoint
CREATE TABLE "news_instrument_links" (
	"news_id" bigint NOT NULL,
	"instrument_id" bigint NOT NULL,
	"match_type" text NOT NULL,
	"match_score" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "news_instrument_links_news_id_instrument_id_pk" PRIMARY KEY("news_id","instrument_id")
);
--> statement-breakpoint
CREATE TABLE "news_items" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"lang" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"url" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"category" text,
	"content_hash" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "news_items_url_unique" UNIQUE("url")
);
--> statement-breakpoint
ALTER TABLE "fundamentals" ADD CONSTRAINT "fundamentals_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_instrument_links" ADD CONSTRAINT "news_instrument_links_news_id_news_items_id_fk" FOREIGN KEY ("news_id") REFERENCES "public"."news_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_instrument_links" ADD CONSTRAINT "news_instrument_links_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "news_instrument_links_instrument_idx" ON "news_instrument_links" USING btree ("instrument_id","news_id");--> statement-breakpoint
CREATE INDEX "news_items_published_idx" ON "news_items" USING btree ("published_at" DESC NULLS LAST);