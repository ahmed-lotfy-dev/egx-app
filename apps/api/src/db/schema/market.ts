import { relations } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

const tz = { withTimezone: true } as const;

export const instruments = pgTable(
  "instruments",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    ticker: text("ticker").notNull().unique(),
    tvSymbol: text("tv_symbol").notNull().unique(),
    yahooSymbol: text("yahoo_symbol"),
    isin: text("isin"),
    nameEn: text("name_en").notNull(),
    nameAr: text("name_ar"),
    searchNameEn: text("search_name_en").notNull(),
    searchNameAr: text("search_name_ar"),
    sector: text("sector"),
    industry: text("industry"),
    logoid: text("logoid"),
    kind: text("kind").notNull().default("stock"),
    currency: text("currency").notNull().default("EGP"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", tz).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", tz)
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("instruments_sector_idx").on(table.sector),
    index("instruments_kind_idx").on(table.kind),
  ],
);

export const latestQuotes = pgTable("latest_quotes", {
  instrumentId: bigint("instrument_id", { mode: "number" })
    .primaryKey()
    .references(() => instruments.id, { onDelete: "cascade" }),
  price: numeric("price", { precision: 18, scale: 4 }),
  change: numeric("change", { precision: 18, scale: 4 }),
  changePct: numeric("change_pct", { precision: 10, scale: 4 }),
  volume: bigint("volume", { mode: "number" }),
  marketCap: numeric("market_cap", { precision: 24, scale: 2 }),
  currency: text("currency"),
  source: text("source").notNull(),
  asOf: timestamp("as_of", tz).notNull(),
  fetchedAt: timestamp("fetched_at", tz).defaultNow().notNull(),
});

export const quoteSnapshots = pgTable(
  "quote_snapshots",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    instrumentId: bigint("instrument_id", { mode: "number" })
      .notNull()
      .references(() => instruments.id, { onDelete: "cascade" }),
    price: numeric("price", { precision: 18, scale: 4 }),
    change: numeric("change", { precision: 18, scale: 4 }),
    changePct: numeric("change_pct", { precision: 10, scale: 4 }),
    volume: bigint("volume", { mode: "number" }),
    marketCap: numeric("market_cap", { precision: 24, scale: 2 }),
    currency: text("currency"),
    source: text("source").notNull(),
    asOf: timestamp("as_of", tz).notNull(),
    fetchedAt: timestamp("fetched_at", tz).defaultNow().notNull(),
  },
  (table) => [
    index("quote_snapshots_instrument_asof_idx").on(
      table.instrumentId,
      table.asOf.desc(),
    ),
  ],
);

export const dailyBars = pgTable(
  "daily_bars",
  {
    instrumentId: bigint("instrument_id", { mode: "number" })
      .notNull()
      .references(() => instruments.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    open: numeric("open", { precision: 18, scale: 4 }),
    high: numeric("high", { precision: 18, scale: 4 }),
    low: numeric("low", { precision: 18, scale: 4 }),
    close: numeric("close", { precision: 18, scale: 4 }),
    adjClose: numeric("adj_close", { precision: 18, scale: 4 }),
    volume: bigint("volume", { mode: "number" }),
    priceBasis: text("price_basis").notNull().default("raw"),
    source: text("source").notNull(),
    raw: jsonb("raw"),
    createdAt: timestamp("created_at", tz).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.instrumentId, table.date] }),
    index("daily_bars_date_idx").on(table.date),
  ],
);

export const fundamentals = pgTable(
  "fundamentals",
  {
    instrumentId: bigint("instrument_id", { mode: "number" })
      .notNull()
      .references(() => instruments.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    asOf: date("as_of", { mode: "string" }),
    observedAt: timestamp("observed_at", tz).notNull(),
    currency: text("currency"),
    marketCap: numeric("market_cap", { precision: 24, scale: 2 }),
    pe: numeric("pe", { precision: 18, scale: 4 }),
    pb: numeric("pb", { precision: 18, scale: 4 }),
    eps: numeric("eps", { precision: 18, scale: 4 }),
    roe: numeric("roe", { precision: 12, scale: 4 }),
    roa: numeric("roa", { precision: 12, scale: 4 }),
    debtToEquity: numeric("debt_to_equity", { precision: 18, scale: 4 }),
    dividendYield: numeric("dividend_yield", { precision: 12, scale: 4 }),
    revenueTtm: numeric("revenue_ttm", { precision: 24, scale: 2 }),
    netIncomeTtm: numeric("net_income_ttm", { precision: 24, scale: 2 }),
    fcfTtm: numeric("fcf_ttm", { precision: 24, scale: 2 }),
    currentRatio: numeric("current_ratio", { precision: 12, scale: 4 }),
    beta: numeric("beta", { precision: 12, scale: 4 }),
    grossMargin: numeric("gross_margin", { precision: 12, scale: 4 }),
    netMargin: numeric("net_margin", { precision: 12, scale: 4 }),
    totalDebt: numeric("total_debt", { precision: 24, scale: 2 }),
    totalAssets: numeric("total_assets", { precision: 24, scale: 2 }),
    bookValuePerShare: numeric("book_value_per_share", {
      precision: 18,
      scale: 4,
    }),
    evEbitda: numeric("ev_ebitda", { precision: 18, scale: 4 }),
    raw: jsonb("raw"),
  },
  (table) => [primaryKey({ columns: [table.instrumentId, table.source] })],
);

export const newsItems = pgTable(
  "news_items",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    source: text("source").notNull(),
    lang: text("lang").notNull(),
    originalLang: text("original_lang"),
    title: text("title").notNull(),
    summary: text("summary"),
    translatedTitle: text("translated_title"),
    translatedSummary: text("translated_summary"),
    url: text("url").notNull().unique(),
    publishedAt: timestamp("published_at", tz).notNull(),
    category: text("category"),
    contentHash: text("content_hash").notNull(),
    fetchedAt: timestamp("fetched_at", tz).defaultNow().notNull(),
    // AI fields
    aiSummary: text("ai_summary"),
    aiKeyPoints: jsonb("ai_key_points"),
    sentiment: text("sentiment"),
    impactScore: integer("impact_score"),
    impactLevel: text("impact_level"),
    entities: jsonb("entities"),
    sourceRegion: text("source_region"),
    sourceCategory: text("source_category"),
    tradingSignals: jsonb("trading_signals"),
    processedAt: timestamp("processed_at", tz),
    processingVersion: text("processing_version"),
  },
  (table) => [
    index("news_items_published_idx").on(table.publishedAt.desc()),
    index("news_items_impact_idx").on(table.impactScore.desc(), table.publishedAt.desc()),
    index("news_items_region_idx").on(table.sourceRegion),
    index("news_items_sentiment_idx").on(table.sentiment),
    index("news_items_entities_gin").using("gin", table.entities),
  ],
);

export const newsInstrumentLinks = pgTable(
  "news_instrument_links",
  {
    newsId: bigint("news_id", { mode: "number" })
      .notNull()
      .references(() => newsItems.id, { onDelete: "cascade" }),
    instrumentId: bigint("instrument_id", { mode: "number" })
      .notNull()
      .references(() => instruments.id, { onDelete: "cascade" }),
    matchType: text("match_type").notNull(),
    matchScore: integer("match_score").notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.newsId, table.instrumentId] }),
    index("news_instrument_links_instrument_idx").on(
      table.instrumentId,
      table.newsId,
    ),
  ],
);

export const ingestRuns = pgTable(
  "ingest_runs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    job: text("job").notNull(),
    status: text("status").notNull().default("running"),
    provider: text("provider"),
    startedAt: timestamp("started_at", tz).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", tz),
    itemsOk: integer("items_ok").notNull().default(0),
    itemsFailed: integer("items_failed").notNull().default(0),
    error: text("error"),
    metadata: jsonb("metadata"),
  },
  (table) => [index("ingest_runs_job_started_idx").on(table.job, table.startedAt.desc())],
);

export const newsProcessingQueue = pgTable(
  "news_processing_queue",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    newsId: bigint("news_id", { mode: "number" })
      .notNull()
      .references(() => newsItems.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    priority: integer("priority").default(0),
    attempts: integer("attempts").default(0),
    error: text("error"),
    createdAt: timestamp("created_at", tz).defaultNow().notNull(),
    startedAt: timestamp("started_at", tz),
    completedAt: timestamp("completed_at", tz),
  },
  (table) => [
    index("news_processing_queue_status_priority_idx").on(table.status, table.priority.desc(), table.createdAt),
  ],
);

export const instrumentRelations = relations(instruments, ({ one, many }) => ({
  latestQuote: one(latestQuotes, {
    fields: [instruments.id],
    references: [latestQuotes.instrumentId],
  }),
  quoteSnapshots: many(quoteSnapshots),
  dailyBars: many(dailyBars),
  fundamentals: many(fundamentals),
  newsLinks: many(newsInstrumentLinks),
}));

export const latestQuoteRelations = relations(latestQuotes, ({ one }) => ({
  instrument: one(instruments, {
    fields: [latestQuotes.instrumentId],
    references: [instruments.id],
  }),
}));

export const dailyBarRelations = relations(dailyBars, ({ one }) => ({
  instrument: one(instruments, {
    fields: [dailyBars.instrumentId],
    references: [instruments.id],
  }),
}));

export const fundamentalsRelations = relations(fundamentals, ({ one }) => ({
  instrument: one(instruments, {
    fields: [fundamentals.instrumentId],
    references: [instruments.id],
  }),
}));

export const newsItemRelations = relations(newsItems, ({ many }) => ({
  instrumentLinks: many(newsInstrumentLinks),
  processingQueue: many(newsProcessingQueue),
}));

export const newsProcessingQueueRelations = relations(
  newsProcessingQueue,
  ({ one }) => ({
    newsItem: one(newsItems, {
      fields: [newsProcessingQueue.newsId],
      references: [newsItems.id],
    }),
  }),
);

export const newsInstrumentLinkRelations = relations(
  newsInstrumentLinks,
  ({ one }) => ({
    newsItem: one(newsItems, {
      fields: [newsInstrumentLinks.newsId],
      references: [newsItems.id],
    }),
    instrument: one(instruments, {
      fields: [newsInstrumentLinks.instrumentId],
      references: [instruments.id],
    }),
  }),
);
