CREATE TABLE "document_pages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"document_id" bigint NOT NULL,
	"page_no" integer NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_documents" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"sha256" text NOT NULL,
	"filename" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"pages" integer DEFAULT 0 NOT NULL,
	"storage_path" text NOT NULL,
	"extraction_path" text,
	"extraction_hash" text,
	"extraction_model" text,
	"extraction_version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'uploaded' NOT NULL,
	"error" text,
	"uploaded_by" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "source_documents_sha256_unique" UNIQUE("sha256")
);
--> statement-breakpoint
CREATE TABLE "stock_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"instrument_id" bigint NOT NULL,
	"period_end" date NOT NULL,
	"close" numeric(18, 4),
	"listed_shares" numeric(24, 2),
	"market_cap" numeric(24, 2),
	"paid_capital" numeric(24, 2),
	"pe_trailing" numeric(18, 4),
	"dividend_yield" numeric(12, 4),
	"net_profit" numeric(24, 2),
	"net_profit_period_end" date,
	"last_coupon" numeric(18, 4),
	"ex_date" date,
	"document_id" bigint NOT NULL,
	"page" integer NOT NULL,
	"row_index" integer NOT NULL,
	"status" text DEFAULT 'staged' NOT NULL,
	"review_note" text,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "is_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "document_pages" ADD CONSTRAINT "document_pages_document_id_source_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."source_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_snapshots" ADD CONSTRAINT "stock_snapshots_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_snapshots" ADD CONSTRAINT "stock_snapshots_document_id_source_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."source_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_pages_document_page_unique" ON "document_pages" USING btree ("document_id","page_no");--> statement-breakpoint
CREATE INDEX "source_documents_status_idx" ON "source_documents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "source_documents_period_idx" ON "source_documents" USING btree ("period_end");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_snapshots_live_unique" ON "stock_snapshots" USING btree ("instrument_id","period_end") WHERE "stock_snapshots"."superseded_at" is null;--> statement-breakpoint
CREATE INDEX "stock_snapshots_period_idx" ON "stock_snapshots" USING btree ("period_end");--> statement-breakpoint
CREATE INDEX "stock_snapshots_document_idx" ON "stock_snapshots" USING btree ("document_id");