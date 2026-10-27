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

export const instrumentRelations = relations(instruments, ({ one, many }) => ({
  latestQuote: one(latestQuotes, {
    fields: [instruments.id],
    references: [latestQuotes.instrumentId],
  }),
  quoteSnapshots: many(quoteSnapshots),
  dailyBars: many(dailyBars),
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
