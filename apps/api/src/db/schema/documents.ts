import { relations, sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { instruments } from "./market";

const tz = { withTimezone: true } as const;

/**
 * One row per uploaded EGX quarterly report.
 *
 * `sha256` is unique so an accidental re-upload is rejected before any
 * extraction work happens. Files live on disk (`storage_path`), never in the DB.
 */
export const sourceDocuments = pgTable(
  "source_documents",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    sha256: text("sha256").notNull().unique(),
    filename: text("filename").notNull(),
    periodStart: date("period_start", { mode: "string" }).notNull(),
    periodEnd: date("period_end", { mode: "string" }).notNull(),
    pages: integer("pages").notNull().default(0),
    storagePath: text("storage_path").notNull(),
    extractionPath: text("extraction_path"),
    extractionHash: text("extraction_hash"),
    extractionModel: text("extraction_model"),
    extractionVersion: integer("extraction_version").notNull().default(1),
    status: text("status").notNull().default("uploaded"),
    error: text("error"),
    uploadedBy: text("uploaded_by").notNull(),
    uploadedAt: timestamp("uploaded_at", tz).defaultNow().notNull(),
    publishedAt: timestamp("published_at", tz),
  },
  (table) => [
    index("source_documents_status_idx").on(table.status),
    index("source_documents_period_idx").on(table.periodEnd),
  ],
);

/**
 * Verified per-stock values for one quarter-end.
 *
 * Exactly one live row per (instrument, period_end): revisions insert a new row
 * and stamp `superseded_at` on the previous one. Nothing is deleted.
 *
 * `net_profit` is the trailing figure used for P/E and is usually annual
 * (e.g. 31/12/2025), not the quarter — `net_profit_period_end` records which
 * period it belongs to.
 */
export const stockSnapshots = pgTable(
  "stock_snapshots",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    instrumentId: bigint("instrument_id", { mode: "number" })
      .references(() => instruments.id, { onDelete: "cascade" }),
    periodEnd: date("period_end", { mode: "string" }).notNull(),
    close: numeric("close", { precision: 18, scale: 4 }),
    listedShares: numeric("listed_shares", { precision: 24, scale: 2 }),
    marketCap: numeric("market_cap", { precision: 24, scale: 2 }),
    paidCapital: numeric("paid_capital", { precision: 24, scale: 2 }),
    peTrailing: numeric("pe_trailing", { precision: 18, scale: 4 }),
    dividendYield: numeric("dividend_yield", { precision: 12, scale: 4 }),
    netProfit: numeric("net_profit", { precision: 24, scale: 2 }),
    netProfitPeriodEnd: date("net_profit_period_end", { mode: "string" }),
    lastCoupon: numeric("last_coupon", { precision: 18, scale: 4 }),
    exDate: date("ex_date", { mode: "string" }),
    documentId: bigint("document_id", { mode: "number" })
      .notNull()
      .references(() => sourceDocuments.id, { onDelete: "cascade" }),
    page: integer("page").notNull(),
    rowIndex: integer("row_index").notNull(),
    status: text("status").notNull().default("staged"),
    reviewNote: text("review_note"),
    supersededAt: timestamp("superseded_at", tz),
    createdAt: timestamp("created_at", tz).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("stock_snapshots_live_unique")
      .on(table.instrumentId, table.periodEnd)
      .where(sql`${table.supersededAt} is null`),
    index("stock_snapshots_period_idx").on(table.periodEnd),
    index("stock_snapshots_document_idx").on(table.documentId),
  ],
);

/**
 * RAG index: page-level text from approved documents.
 *
 * The embedding column is added in the RAG phase, when pgvector is enabled.
 */
export const documentPages = pgTable(
  "document_pages",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    documentId: bigint("document_id", { mode: "number" })
      .notNull()
      .references(() => sourceDocuments.id, { onDelete: "cascade" }),
    pageNo: integer("page_no").notNull(),
    text: text("text").notNull(),
    createdAt: timestamp("created_at", tz).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("document_pages_document_page_unique").on(
      table.documentId,
      table.pageNo,
    ),
  ],
);

export const sourceDocumentRelations = relations(
  sourceDocuments,
  ({ many }) => ({
    snapshots: many(stockSnapshots),
    pages: many(documentPages),
  }),
);

export const stockSnapshotRelations = relations(stockSnapshots, ({ one }) => ({
  instrument: one(instruments, {
    fields: [stockSnapshots.instrumentId],
    references: [instruments.id],
  }),
  document: one(sourceDocuments, {
    fields: [stockSnapshots.documentId],
    references: [sourceDocuments.id],
  }),
}));

export const documentPageRelations = relations(documentPages, ({ one }) => ({
  document: one(sourceDocuments, {
    fields: [documentPages.documentId],
    references: [sourceDocuments.id],
  }),
}));
