-- Migration 0013: Convert all bigserial primary keys to UUID
-- This is a complex migration that must be run in a transaction

-- Enable uuid-ossp extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- STEP 1: Add UUID columns to all tables with bigserial PKs
-- ============================================================

-- instruments
ALTER TABLE "instruments" ADD COLUMN "id_uuid" uuid NOT NULL DEFAULT uuid_generate_v4();
CREATE UNIQUE INDEX "instruments_id_uuid_idx" ON "instruments" ("id_uuid");

-- source_documents
ALTER TABLE "source_documents" ADD COLUMN "id_uuid" uuid NOT NULL DEFAULT uuid_generate_v4();
CREATE UNIQUE INDEX "source_documents_id_uuid_idx" ON "source_documents" ("id_uuid");

-- stock_snapshots
ALTER TABLE "stock_snapshots" ADD COLUMN "id_uuid" uuid NOT NULL DEFAULT uuid_generate_v4();
CREATE UNIQUE INDEX "stock_snapshots_id_uuid_idx" ON "stock_snapshots" ("id_uuid");
ALTER TABLE "stock_snapshots" ADD COLUMN "instrument_id_uuid" uuid;
ALTER TABLE "stock_snapshots" ADD COLUMN "document_id_uuid" uuid;

-- document_pages
ALTER TABLE "document_pages" ADD COLUMN "id_uuid" uuid NOT NULL DEFAULT uuid_generate_v4();
CREATE UNIQUE INDEX "document_pages_id_uuid_idx" ON "document_pages" ("id_uuid");
ALTER TABLE "document_pages" ADD COLUMN "document_id_uuid" uuid;

-- quote_snapshots
ALTER TABLE "quote_snapshots" ADD COLUMN "id_uuid" uuid NOT NULL DEFAULT uuid_generate_v4();
CREATE UNIQUE INDEX "quote_snapshots_id_uuid_idx" ON "quote_snapshots" ("id_uuid");
ALTER TABLE "quote_snapshots" ADD COLUMN "instrument_id_uuid" uuid;

-- latest_quotes
ALTER TABLE "latest_quotes" ADD COLUMN "instrument_id_uuid" uuid;

-- fundamentals
ALTER TABLE "fundamentals" ADD COLUMN "instrument_id_uuid" uuid;

-- daily_bars
ALTER TABLE "daily_bars" ADD COLUMN "instrument_id_uuid" uuid;

-- macro_quotes - uses "key" as PK, no UUID needed for PK

-- news_items
ALTER TABLE "news_items" ADD COLUMN "id_uuid" uuid NOT NULL DEFAULT uuid_generate_v4();
CREATE UNIQUE INDEX "news_items_id_uuid_idx" ON "news_items" ("id_uuid");

-- news_processing_queue
ALTER TABLE "news_processing_queue" ADD COLUMN "id_uuid" uuid NOT NULL DEFAULT uuid_generate_v4();
CREATE UNIQUE INDEX "news_processing_queue_id_uuid_idx" ON "news_processing_queue" ("id_uuid");
ALTER TABLE "news_processing_queue" ADD COLUMN "news_id_uuid" uuid;

-- news_instrument_links
ALTER TABLE "news_instrument_links" ADD COLUMN "id_uuid" uuid NOT NULL DEFAULT uuid_generate_v4();
CREATE UNIQUE INDEX "news_instrument_links_id_uuid_idx" ON "news_instrument_links" ("id_uuid");
ALTER TABLE "news_instrument_links" ADD COLUMN "news_id_uuid" uuid;
ALTER TABLE "news_instrument_links" ADD COLUMN "instrument_id_uuid" uuid;

-- watchlists
ALTER TABLE "watchlists" ADD COLUMN "id_uuid" uuid NOT NULL DEFAULT uuid_generate_v4();
CREATE UNIQUE INDEX "watchlists_id_uuid_idx" ON "watchlists" ("id_uuid");

-- watchlist_items
ALTER TABLE "watchlist_items" ADD COLUMN "id_uuid" uuid NOT NULL DEFAULT uuid_generate_v4();
CREATE UNIQUE INDEX "watchlist_items_id_uuid_idx" ON "watchlist_items" ("id_uuid");
ALTER TABLE "watchlist_items" ADD COLUMN "watchlist_id_uuid" uuid;
ALTER TABLE "watchlist_items" ADD COLUMN "instrument_id_uuid" uuid;

-- ingest_runs
ALTER TABLE "ingest_runs" ADD COLUMN "id_uuid" uuid NOT NULL DEFAULT uuid_generate_v4();
CREATE UNIQUE INDEX "ingest_runs_id_uuid_idx" ON "ingest_runs" ("id_uuid");

-- ============================================================
-- STEP 2: Populate foreign key UUID columns using joins
-- ============================================================

-- stock_snapshots: instrument_id_uuid
UPDATE "stock_snapshots" ss
SET "instrument_id_uuid" = i."id_uuid"
FROM "instruments" i
WHERE ss."instrument_id" = i."id";

-- stock_snapshots: document_id_uuid
UPDATE "stock_snapshots" ss
SET "document_id_uuid" = d."id_uuid"
FROM "source_documents" d
WHERE ss."document_id" = d."id";

-- document_pages: document_id_uuid
UPDATE "document_pages" dp
SET "document_id_uuid" = d."id_uuid"
FROM "source_documents" d
WHERE dp."document_id" = d."id";

-- quote_snapshots: instrument_id_uuid
UPDATE "quote_snapshots" qs
SET "instrument_id_uuid" = i."id_uuid"
FROM "instruments" i
WHERE qs."instrument_id" = i."id";

-- latest_quotes: instrument_id_uuid
UPDATE "latest_quotes" lq
SET "instrument_id_uuid" = i."id_uuid"
FROM "instruments" i
WHERE lq."instrument_id" = i."id";

-- fundamentals: instrument_id_uuid
UPDATE "fundamentals" f
SET "instrument_id_uuid" = i."id_uuid"
FROM "instruments" i
WHERE f."instrument_id" = i."id";

-- daily_bars: instrument_id_uuid
UPDATE "daily_bars" db
SET "instrument_id_uuid" = i."id_uuid"
FROM "instruments" i
WHERE db."instrument_id" = i."id";

-- news_processing_queue: news_id_uuid
UPDATE "news_processing_queue" npq
SET "news_id_uuid" = ni."id_uuid"
FROM "news_items" ni
WHERE npq."news_id" = ni."id";

-- news_instrument_links: news_id_uuid
UPDATE "news_instrument_links" nil
SET "news_id_uuid" = ni."id_uuid"
FROM "news_items" ni
WHERE nil."news_id" = ni."id";

-- news_instrument_links: instrument_id_uuid
UPDATE "news_instrument_links" nil
SET "instrument_id_uuid" = i."id_uuid"
FROM "instruments" i
WHERE nil."instrument_id" = i."id";

-- watchlist_items: watchlist_id_uuid
UPDATE "watchlist_items" wi
SET "watchlist_id_uuid" = w."id_uuid"
FROM "watchlists" w
WHERE wi."watchlist_id" = w."id";

-- watchlist_items: instrument_id_uuid
UPDATE "watchlist_items" wi
SET "instrument_id_uuid" = i."id_uuid"
FROM "instruments" i
WHERE wi."instrument_id" = i."id";

-- ============================================================
-- STEP 3: Drop foreign keys (with CASCADE where needed)
-- ============================================================

-- Drop foreign keys on stock_snapshots
ALTER TABLE "stock_snapshots" DROP CONSTRAINT IF EXISTS "stock_snapshots_instrument_id_instruments_id_fk" CASCADE;
ALTER TABLE "stock_snapshots" DROP CONSTRAINT IF EXISTS "stock_snapshots_document_id_source_documents_id_fk" CASCADE;

-- Drop foreign keys on document_pages
ALTER TABLE "document_pages" DROP CONSTRAINT IF EXISTS "document_pages_document_id_source_documents_id_fk" CASCADE;

-- Drop foreign keys on quote_snapshots
ALTER TABLE "quote_snapshots" DROP CONSTRAINT IF EXISTS "quote_snapshots_instrument_id_instruments_id_fk" CASCADE;

-- Drop foreign keys on latest_quotes
ALTER TABLE "latest_quotes" DROP CONSTRAINT IF EXISTS "latest_quotes_instrument_id_instruments_id_fk" CASCADE;

-- Drop foreign keys on fundamentals
ALTER TABLE "fundamentals" DROP CONSTRAINT IF EXISTS "fundamentals_instrument_id_instruments_id_fk" CASCADE;

-- Drop foreign keys on daily_bars
ALTER TABLE "daily_bars" DROP CONSTRAINT IF EXISTS "daily_bars_instrument_id_instruments_id_fk" CASCADE;

-- Drop foreign keys on news_instrument_links
ALTER TABLE "news_instrument_links" DROP CONSTRAINT IF EXISTS "news_instrument_links_news_id_news_items_id_fk" CASCADE;
ALTER TABLE "news_instrument_links" DROP CONSTRAINT IF EXISTS "news_instrument_links_instrument_id_instruments_id_fk" CASCADE;

-- Drop foreign keys on news_processing_queue
ALTER TABLE "news_processing_queue" DROP CONSTRAINT IF EXISTS "news_processing_queue_news_id_news_items_id_fk" CASCADE;

-- Drop foreign keys on watchlist_items
ALTER TABLE "watchlist_items" DROP CONSTRAINT IF EXISTS "watchlist_items_watchlist_id_watchlists_id_fk" CASCADE;
ALTER TABLE "watchlist_items" DROP CONSTRAINT IF EXISTS "watchlist_items_instrument_id_instruments_id_fk" CASCADE;

-- Drop primary keys (must drop dependent FKs first)
ALTER TABLE "instruments" DROP CONSTRAINT IF EXISTS "instruments_pkey" CASCADE;
ALTER TABLE "source_documents" DROP CONSTRAINT IF EXISTS "source_documents_pkey" CASCADE;
ALTER TABLE "stock_snapshots" DROP CONSTRAINT IF EXISTS "stock_snapshots_pkey" CASCADE;
ALTER TABLE "document_pages" DROP CONSTRAINT IF EXISTS "document_pages_pkey" CASCADE;
ALTER TABLE "quote_snapshots" DROP CONSTRAINT IF EXISTS "quote_snapshots_pkey" CASCADE;
ALTER TABLE "news_items" DROP CONSTRAINT IF EXISTS "news_items_pkey" CASCADE;
ALTER TABLE "news_processing_queue" DROP CONSTRAINT IF EXISTS "news_processing_queue_pkey" CASCADE;
ALTER TABLE "news_instrument_links" DROP CONSTRAINT IF EXISTS "news_instrument_links_pkey" CASCADE;
ALTER TABLE "watchlists" DROP CONSTRAINT IF EXISTS "watchlists_pkey" CASCADE;
ALTER TABLE "watchlist_items" DROP CONSTRAINT IF EXISTS "watchlist_items_pkey" CASCADE;
ALTER TABLE "ingest_runs" DROP CONSTRAINT IF EXISTS "ingest_runs_pkey" CASCADE;
ALTER TABLE "latest_quotes" DROP CONSTRAINT IF EXISTS "latest_quotes_pkey" CASCADE;

-- ============================================================
-- STEP 4: Drop old bigserial columns and rename UUID columns
-- ============================================================

-- instruments
ALTER TABLE "instruments" DROP COLUMN "id";
ALTER TABLE "instruments" RENAME COLUMN "id_uuid" TO "id";
ALTER TABLE "instruments" ADD PRIMARY KEY ("id");

-- source_documents
ALTER TABLE "source_documents" DROP COLUMN "id";
ALTER TABLE "source_documents" RENAME COLUMN "id_uuid" TO "id";
ALTER TABLE "source_documents" ADD PRIMARY KEY ("id");

-- stock_snapshots
ALTER TABLE "stock_snapshots" DROP COLUMN "id";
ALTER TABLE "stock_snapshots" DROP COLUMN "instrument_id";
ALTER TABLE "stock_snapshots" DROP COLUMN "document_id";
ALTER TABLE "stock_snapshots" RENAME COLUMN "id_uuid" TO "id";
ALTER TABLE "stock_snapshots" RENAME COLUMN "instrument_id_uuid" TO "instrument_id";
ALTER TABLE "stock_snapshots" RENAME COLUMN "document_id_uuid" TO "document_id";
ALTER TABLE "stock_snapshots" ADD PRIMARY KEY ("id");

-- document_pages
ALTER TABLE "document_pages" DROP COLUMN "id";
ALTER TABLE "document_pages" DROP COLUMN "document_id";
ALTER TABLE "document_pages" RENAME COLUMN "id_uuid" TO "id";
ALTER TABLE "document_pages" RENAME COLUMN "document_id_uuid" TO "document_id";
ALTER TABLE "document_pages" ADD PRIMARY KEY ("id");

-- quote_snapshots
ALTER TABLE "quote_snapshots" DROP COLUMN "id";
ALTER TABLE "quote_snapshots" DROP COLUMN "instrument_id";
ALTER TABLE "quote_snapshots" RENAME COLUMN "id_uuid" TO "id";
ALTER TABLE "quote_snapshots" RENAME COLUMN "instrument_id_uuid" TO "instrument_id";
ALTER TABLE "quote_snapshots" ADD PRIMARY KEY ("id");

-- latest_quotes
ALTER TABLE "latest_quotes" DROP COLUMN "instrument_id";
ALTER TABLE "latest_quotes" RENAME COLUMN "instrument_id_uuid" TO "instrument_id";
ALTER TABLE "latest_quotes" ADD PRIMARY KEY ("instrument_id");

-- fundamentals
ALTER TABLE "fundamentals" DROP COLUMN "instrument_id";
ALTER TABLE "fundamentals" RENAME COLUMN "instrument_id_uuid" TO "instrument_id";
ALTER TABLE "fundamentals" ADD PRIMARY KEY ("instrument_id", "source");

-- daily_bars
ALTER TABLE "daily_bars" DROP COLUMN "instrument_id";
ALTER TABLE "daily_bars" RENAME COLUMN "instrument_id_uuid" TO "instrument_id";

-- news_items
ALTER TABLE "news_items" DROP COLUMN "id";
ALTER TABLE "news_items" RENAME COLUMN "id_uuid" TO "id";
ALTER TABLE "news_items" ADD PRIMARY KEY ("id");

-- news_processing_queue
ALTER TABLE "news_processing_queue" DROP COLUMN "id";
ALTER TABLE "news_processing_queue" DROP COLUMN "news_id";
ALTER TABLE "news_processing_queue" RENAME COLUMN "id_uuid" TO "id";
ALTER TABLE "news_processing_queue" RENAME COLUMN "news_id_uuid" TO "news_id";
ALTER TABLE "news_processing_queue" ADD PRIMARY KEY ("id");

-- news_instrument_links
ALTER TABLE "news_instrument_links" DROP COLUMN "id";
ALTER TABLE "news_instrument_links" DROP COLUMN "news_id";
ALTER TABLE "news_instrument_links" DROP COLUMN "instrument_id";
ALTER TABLE "news_instrument_links" RENAME COLUMN "id_uuid" TO "id";
ALTER TABLE "news_instrument_links" RENAME COLUMN "news_id_uuid" TO "news_id";
ALTER TABLE "news_instrument_links" RENAME COLUMN "instrument_id_uuid" TO "instrument_id";
ALTER TABLE "news_instrument_links" ADD PRIMARY KEY ("id");

-- watchlists
ALTER TABLE "watchlists" DROP COLUMN "id";
ALTER TABLE "watchlists" RENAME COLUMN "id_uuid" TO "id";
ALTER TABLE "watchlists" ADD PRIMARY KEY ("id");

-- watchlist_items
ALTER TABLE "watchlist_items" DROP COLUMN "id";
ALTER TABLE "watchlist_items" DROP COLUMN "watchlist_id";
ALTER TABLE "watchlist_items" DROP COLUMN "instrument_id";
ALTER TABLE "watchlist_items" RENAME COLUMN "id_uuid" TO "id";
ALTER TABLE "watchlist_items" RENAME COLUMN "watchlist_id_uuid" TO "watchlist_id";
ALTER TABLE "watchlist_items" RENAME COLUMN "instrument_id_uuid" TO "instrument_id";
ALTER TABLE "watchlist_items" ADD PRIMARY KEY ("id");

-- ingest_runs
ALTER TABLE "ingest_runs" DROP COLUMN "id";
ALTER TABLE "ingest_runs" RENAME COLUMN "id_uuid" TO "id";
ALTER TABLE "ingest_runs" ADD PRIMARY KEY ("id");

-- ============================================================
-- STEP 5: Recreate foreign keys with UUID columns
-- ============================================================

ALTER TABLE "stock_snapshots"
  ADD CONSTRAINT "stock_snapshots_instrument_id_instruments_id_fk"
  FOREIGN KEY ("instrument_id") REFERENCES "instruments" ("id") ON DELETE CASCADE;

ALTER TABLE "stock_snapshots"
  ADD CONSTRAINT "stock_snapshots_document_id_source_documents_id_fk"
  FOREIGN KEY ("document_id") REFERENCES "source_documents" ("id") ON DELETE CASCADE;

ALTER TABLE "document_pages"
  ADD CONSTRAINT "document_pages_document_id_source_documents_id_fk"
  FOREIGN KEY ("document_id") REFERENCES "source_documents" ("id") ON DELETE CASCADE;

ALTER TABLE "quote_snapshots"
  ADD CONSTRAINT "quote_snapshots_instrument_id_instruments_id_fk"
  FOREIGN KEY ("instrument_id") REFERENCES "instruments" ("id") ON DELETE CASCADE;

ALTER TABLE "latest_quotes"
  ADD CONSTRAINT "latest_quotes_instrument_id_instruments_id_fk"
  FOREIGN KEY ("instrument_id") REFERENCES "instruments" ("id") ON DELETE CASCADE;

ALTER TABLE "fundamentals"
  ADD CONSTRAINT "fundamentals_instrument_id_instruments_id_fk"
  FOREIGN KEY ("instrument_id") REFERENCES "instruments" ("id") ON DELETE CASCADE;

ALTER TABLE "daily_bars"
  ADD CONSTRAINT "daily_bars_instrument_id_instruments_id_fk"
  FOREIGN KEY ("instrument_id") REFERENCES "instruments" ("id") ON DELETE CASCADE;

ALTER TABLE "news_instrument_links"
  ADD CONSTRAINT "news_instrument_links_news_id_news_items_id_fk"
  FOREIGN KEY ("news_id") REFERENCES "news_items" ("id") ON DELETE CASCADE;

ALTER TABLE "news_instrument_links"
  ADD CONSTRAINT "news_instrument_links_instrument_id_instruments_id_fk"
  FOREIGN KEY ("instrument_id") REFERENCES "instruments" ("id") ON DELETE CASCADE;

ALTER TABLE "news_processing_queue"
  ADD CONSTRAINT "news_processing_queue_news_id_news_items_id_fk"
  FOREIGN KEY ("news_id") REFERENCES "news_items" ("id") ON DELETE CASCADE;

ALTER TABLE "watchlist_items"
  ADD CONSTRAINT "watchlist_items_watchlist_id_watchlists_id_fk"
  FOREIGN KEY ("watchlist_id") REFERENCES "watchlists" ("id") ON DELETE CASCADE;

ALTER TABLE "watchlist_items"
  ADD CONSTRAINT "watchlist_items_instrument_id_instruments_id_fk"
  FOREIGN KEY ("instrument_id") REFERENCES "instruments" ("id") ON DELETE CASCADE;

-- ============================================================
-- STEP 6: Recreate unique indexes
-- ============================================================

CREATE UNIQUE INDEX "stock_snapshots_live_unique"
  ON "stock_snapshots" ("instrument_id", "period_end")
  WHERE "superseded_at" IS NULL;

CREATE UNIQUE INDEX "document_pages_document_page_unique"
  ON "document_pages" ("document_id", "page_no");

CREATE UNIQUE INDEX "watchlist_items_unique"
  ON "watchlist_items" ("watchlist_id", "instrument_id");