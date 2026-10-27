CREATE TABLE "daily_bars" (
	"instrument_id" bigint NOT NULL,
	"date" date NOT NULL,
	"open" numeric(18, 4),
	"high" numeric(18, 4),
	"low" numeric(18, 4),
	"close" numeric(18, 4),
	"adj_close" numeric(18, 4),
	"volume" bigint,
	"price_basis" text DEFAULT 'raw' NOT NULL,
	"source" text NOT NULL,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_bars_instrument_id_date_pk" PRIMARY KEY("instrument_id","date")
);
--> statement-breakpoint
CREATE TABLE "ingest_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"job" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"provider" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"items_ok" integer DEFAULT 0 NOT NULL,
	"items_failed" integer DEFAULT 0 NOT NULL,
	"error" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "instruments" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ticker" text NOT NULL,
	"tv_symbol" text NOT NULL,
	"yahoo_symbol" text,
	"isin" text,
	"name_en" text NOT NULL,
	"name_ar" text,
	"search_name_en" text NOT NULL,
	"search_name_ar" text,
	"sector" text,
	"industry" text,
	"logoid" text,
	"kind" text DEFAULT 'stock' NOT NULL,
	"currency" text DEFAULT 'EGP' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instruments_ticker_unique" UNIQUE("ticker"),
	CONSTRAINT "instruments_tv_symbol_unique" UNIQUE("tv_symbol")
);
--> statement-breakpoint
CREATE TABLE "latest_quotes" (
	"instrument_id" bigint PRIMARY KEY NOT NULL,
	"price" numeric(18, 4),
	"change" numeric(18, 4),
	"change_pct" numeric(10, 4),
	"volume" bigint,
	"market_cap" numeric(24, 2),
	"currency" text,
	"source" text NOT NULL,
	"as_of" timestamp with time zone NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"instrument_id" bigint NOT NULL,
	"price" numeric(18, 4),
	"change" numeric(18, 4),
	"change_pct" numeric(10, 4),
	"volume" bigint,
	"market_cap" numeric(24, 2),
	"currency" text,
	"source" text NOT NULL,
	"as_of" timestamp with time zone NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "daily_bars" ADD CONSTRAINT "daily_bars_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "latest_quotes" ADD CONSTRAINT "latest_quotes_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_snapshots" ADD CONSTRAINT "quote_snapshots_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "daily_bars_date_idx" ON "daily_bars" USING btree ("date");--> statement-breakpoint
CREATE INDEX "ingest_runs_job_started_idx" ON "ingest_runs" USING btree ("job","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "instruments_sector_idx" ON "instruments" USING btree ("sector");--> statement-breakpoint
CREATE INDEX "instruments_kind_idx" ON "instruments" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "quote_snapshots_instrument_asof_idx" ON "quote_snapshots" USING btree ("instrument_id","as_of" DESC NULLS LAST);