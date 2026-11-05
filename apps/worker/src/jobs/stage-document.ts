import { db } from "@egx/api/db";
import { instruments, stockSnapshots, sourceDocuments } from "@egx/api/schema";
import { and, eq, sql, type SQL } from "drizzle-orm";
import { pgTable, bigint, numeric, date, text, integer, timestamp } from "drizzle-orm/pg-core";

import { logDocument } from "../lib/doc-log";
import { AR_TO_TICKER_MAP } from "../lib/ar-ticker-map";
import { readFile } from "node:fs/promises";
import { extractionPath } from "@egx/api/documents";
import { type ExtractionArtifact, type ExtractedRow } from "./extract-document";

/**
 * Phase 4 — validate the JSON artifact, match to instruments, stage snapshots.
 *
 * Matching strategy:
 *   1. Exact ticker match (instrument.ticker === extracted name if it looks like a ticker)
 *   2. Exact ticker via Arabic name mapping (e.g., "البنك التجاري الدولي" → "COMI")
 *   3. Exact Arabic name match (normalized)
 *   4. Exact English name match (normalized)
 *   5. Fuzzy Arabic name match (token Jaccard, threshold 0.75)
 *   6. Fuzzy Arabic containment (DB tokens ⊆ PDF tokens)
 *   7. Fuzzy English containment (DB English tokens ⊆ PDF Arabic tokens)
 *
 * Each staged row gets:
 *   - instrumentId (or null if unmatched)
 *   - matchConfidence (0..1)
 *   - matchMethod ("exact_ticker" | "exact_ar" | "exact_en" | "fuzzy_ar" | "fuzzy_en" | "unmatched")
 *   - validation checks (arithmetic, ranges)
 *   - reviewNote with any warnings
 */

const ARABIC_NORMALIZE_RE = /[\u064b-\u065f\u0670\u06d6-\u06ed\u0640]/g; // diacritics + tatweel
const LATIN_NORMALIZE_RE = /[^a-z0-9]/gi;

function normalizeArabic(text: string): string {
  return text
    .replace(ARABIC_NORMALIZE_RE, "")
    // fold hamza/carried-alef variants so PDF spellings match DB spellings
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLatin(text: string): string {
  return text
    .toLowerCase()
    .replace(LATIN_NORMALIZE_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(text: string): Set<string> {
  return new Set(text.split(" ").filter(Boolean));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / (a.size + b.size - inter);
}

function containment(a: Set<string>, b: Set<string>): number {
  if (a.size === 0) return 1;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / a.size;
}

// Pre-normalized map entries so lookups don't re-normalize keys per row.
const AR_TICKER_ENTRIES: ReadonlyArray<readonly [string, string]> = Object.entries(
  AR_TO_TICKER_MAP,
).map(([key, ticker]) => [normalizeArabic(key), ticker] as const);

// Substring fallback only applies when the contained side is at least this
// many characters, so generic short names can't produce false matches.
const MIN_SUBSTRING_LEN = 8;

/**
 * Maps an extracted Arabic company name to its EGX ticker.
 * Exact normalized match first; then substring fallback where the longest
 * (most specific) key wins.
 */
function translateArabicToTicker(nameAr: string): string | null {
  const norm = normalizeArabic(nameAr);
  if (!norm) return null;

  for (const [key, ticker] of AR_TICKER_ENTRIES) {
    if (key === norm) return ticker;
  }

  let best: { ticker: string; keyLen: number } | null = null;
  for (const [key, ticker] of AR_TICKER_ENTRIES) {
    if (key.includes(norm) && norm.length >= MIN_SUBSTRING_LEN) {
      if (!best || key.length > best.keyLen) best = { ticker, keyLen: key.length };
      continue;
    }
    if (norm.includes(key) && key.length >= MIN_SUBSTRING_LEN) {
      if (!best || key.length > best.keyLen) best = { ticker, keyLen: key.length };
    }
  }
  return best?.ticker ?? null;
}

type InstrumentRow = {
  id: number;
  ticker: string;
  nameAr: string | null;
  nameEn: string;
  nameArNorm: string;
  nameEnNorm: string;
  nameArTokens: Set<string>;
  nameEnTokens: Set<string>;
};

type MatchResult = {
  instrumentId: number | null;
  confidence: number;
  method:
    | "exact_ticker"
    | "exact_ar"
    | "exact_en"
    | "fuzzy_ar"
    | "fuzzy_en"
    | "fuzzy_ar_contain"
    | "fuzzy_en_contain"
    | "unmatched";
  matchedTicker: string;
  matchedNameAr: string | null;
  matchedNameEn: string;
};

const FUZZY_THRESHOLD = 0.75; // Jaccard threshold
const CONTAINMENT_THRESHOLD = 0.9; // DB tokens must be mostly in PDF tokens

async function loadInstruments(): Promise<InstrumentRow[]> {
  const rows = await db
    .select({
      id: instruments.id,
      ticker: instruments.ticker,
      nameAr: instruments.nameAr,
      nameEn: instruments.nameEn,
    })
    .from(instruments);

  return rows.map((r) => ({
    ...r,
    nameArNorm: r.nameAr ? normalizeArabic(r.nameAr) : "",
    nameEnNorm: normalizeLatin(r.nameEn),
    nameArTokens: r.nameAr ? tokenSet(normalizeArabic(r.nameAr)) : new Set(),
    nameEnTokens: tokenSet(normalizeLatin(r.nameEn)),
  }));
}

function matchRow(row: ExtractedRow, instruments: InstrumentRow[]): MatchResult {
  const nameArNorm = normalizeArabic(row.nameAr);
  const nameArTokens = tokenSet(nameArNorm);
  const nameEnNorm = normalizeLatin(row.nameAr); // fallback to Arabic name for English search
  // Note: extracted rows only have Arabic name. We match against both ar/en columns.

  // 1. Exact ticker — if the Arabic name looks like a ticker (all latin, short)
  if (/^[A-Z]{2,6}$/i.test(row.nameAr.trim())) {
    const ticker = row.nameAr.trim().toUpperCase();
    const hit = instruments.find((i) => i.ticker === ticker);
    if (hit) {
      return {
        instrumentId: hit.id,
        confidence: 1.0,
        method: "exact_ticker",
        matchedTicker: hit.ticker,
        matchedNameAr: hit.nameAr,
        matchedNameEn: hit.nameEn,
      };
    }
  }

  // 1b. Exact ticker via Arabic name mapping (e.g. "البنك التجاري الدولي" → "COMI")
  const mappedTicker = translateArabicToTicker(row.nameAr);
  if (mappedTicker) {
    const hit = instruments.find((i) => i.ticker === mappedTicker);
    if (hit) {
      return {
        instrumentId: hit.id,
        confidence: 1.0,
        method: "exact_ticker",
        matchedTicker: hit.ticker,
        matchedNameAr: hit.nameAr,
        matchedNameEn: hit.nameEn,
      };
    }
  }

  // 2. Exact Arabic name
  for (const inst of instruments) {
    if (inst.nameArNorm && inst.nameArNorm === nameArNorm) {
      return {
        instrumentId: inst.id,
        confidence: 1.0,
        method: "exact_ar",
        matchedTicker: inst.ticker,
        matchedNameAr: inst.nameAr,
        matchedNameEn: inst.nameEn,
      };
    }
  }

  // 3. Exact English name (using the Arabic name as query against English column)
  // This is a long shot but kept for completeness.
  for (const inst of instruments) {
    if (inst.nameEnNorm === nameEnNorm) {
      return {
        instrumentId: inst.id,
        confidence: 0.99,
        method: "exact_en",
        matchedTicker: inst.ticker,
        matchedNameAr: inst.nameAr,
        matchedNameEn: inst.nameEn,
      };
    }
  }

  // 4. Fuzzy Arabic (Jaccard)
  let bestAr: { inst: InstrumentRow; score: number } | null = null;
  for (const inst of instruments) {
    if (!inst.nameArNorm) continue;
    const score = jaccard(nameArTokens, inst.nameArTokens);
    if (score >= FUZZY_THRESHOLD && (!bestAr || score > bestAr.score)) {
      bestAr = { inst, score };
    }
  }
  if (bestAr) {
    return {
      instrumentId: bestAr.inst.id,
      confidence: bestAr.score,
      method: "fuzzy_ar",
      matchedTicker: bestAr.inst.ticker,
      matchedNameAr: bestAr.inst.nameAr,
      matchedNameEn: bestAr.inst.nameEn,
    };
  }

  // 5. Fuzzy Arabic containment (DB tokens ⊆ PDF tokens)
  // The PDF often has longer names that fully contain the DB name.
  let bestArContain: { inst: InstrumentRow; score: number } | null = null;
  for (const inst of instruments) {
    if (!inst.nameArNorm) continue;
    const score = containment(inst.nameArTokens, nameArTokens);
    if (score >= CONTAINMENT_THRESHOLD && (!bestArContain || score > bestArContain.score)) {
      bestArContain = { inst, score };
    }
  }
  if (bestArContain) {
    return {
      instrumentId: bestArContain.inst.id,
      confidence: bestArContain.score * 0.95, // slightly lower than exact
      method: "fuzzy_ar_contain",
      matchedTicker: bestArContain.inst.ticker,
      matchedNameAr: bestArContain.inst.nameAr,
      matchedNameEn: bestArContain.inst.nameEn,
    };
  }

  // 6. Fuzzy English containment (DB English tokens ⊆ PDF Arabic tokens)
  // Rare but possible for bilingual names.
  let bestEnContain: { inst: InstrumentRow; score: number } | null = null;
  for (const inst of instruments) {
    const score = containment(inst.nameEnTokens, nameArTokens);
    if (score >= CONTAINMENT_THRESHOLD && (!bestEnContain || score > bestEnContain.score)) {
      bestEnContain = { inst, score };
    }
  }
  if (bestEnContain) {
    return {
      instrumentId: bestEnContain.inst.id,
      confidence: bestEnContain.score * 0.9,
      method: "fuzzy_en_contain",
      matchedTicker: bestEnContain.inst.ticker,
      matchedNameAr: bestEnContain.inst.nameAr,
      matchedNameEn: bestEnContain.inst.nameEn,
    };
  }

  return {
    instrumentId: null,
    confidence: 0,
    method: "unmatched",
    matchedTicker: "",
    matchedNameAr: null,
    matchedNameEn: "",
  };
}

type ValidationCheck = {
  ok: boolean;
  message: string;
  details?: Record<string, unknown>;
};

function validateRow(row: ExtractedRow, match: MatchResult): ValidationCheck[] {
  const checks: ValidationCheck[] = [];

  // close × listed_shares ≈ market_cap (≤ 0.5% for EGP; skip for USD)
  if (
    row.close !== null &&
    row.listedShares !== null &&
    row.marketCap !== null &&
    row.currency === "EGP"
  ) {
    const calc = row.close * row.listedShares;
    const diff = Math.abs(calc - row.marketCap) / row.marketCap;
    checks.push({
      ok: diff <= 0.005,
      message: diff <= 0.005 ? "market_cap_ok" : "market_cap_mismatch",
      details: { calc, reported: row.marketCap, diffPct: diff * 100 },
    });
  }

  // market_cap / net_profit ≈ pe_trailing (≤ 2%)
  if (
    row.marketCap !== null &&
    row.netProfit !== null &&
    row.netProfit > 0 &&
    row.peTrailing !== null
  ) {
    const calc = row.marketCap / row.netProfit;
    const diff = Math.abs(calc - row.peTrailing) / row.peTrailing;
    checks.push({
      ok: diff <= 0.02,
      message: diff <= 0.02 ? "pe_ok" : "pe_mismatch",
      details: { calc, reported: row.peTrailing, diffPct: diff * 100 },
    });
  }

  // dividend yield range
  if (row.dividendYield !== null) {
    checks.push({
      ok: row.dividendYield >= 0 && row.dividendYield <= 30,
      message: row.dividendYield >= 0 && row.dividendYield <= 30 ? "dy_ok" : "dy_out_of_range",
      details: { value: row.dividendYield },
    });
  }

  // net_profit_period_end is a date
  if (row.netProfitPeriodEnd !== null) {
    const ok = /^\d{4}-\d{2}-\d{2}$/.test(row.netProfitPeriodEnd);
    checks.push({
      ok,
      message: ok ? "net_profit_date_ok" : "net_profit_date_invalid",
      details: { value: row.netProfitPeriodEnd },
    });
  }

  // Instrument matched
  checks.push({
    ok: match.instrumentId !== null,
    message: match.instrumentId !== null ? "instrument_matched" : "instrument_unmatched",
    details: {
      method: match.method,
      confidence: match.confidence,
      matchedTicker: match.matchedTicker,
      matchedNameAr: match.matchedNameAr,
      matchedNameEn: match.matchedNameEn,
    },
  });

  return checks;
}

function buildReviewNote(checks: ValidationCheck[]): string | null {
  const issues = checks.filter((c) => !c.ok);
  if (issues.length === 0) return null;
  return issues
    .map((c) => `${c.message}: ${JSON.stringify(c.details)}`)
    .join("; ");
}

async function stageOne(
  sha: string,
  documentId: number,
  periodEnd: string,
  row: ExtractedRow,
  instruments: InstrumentRow[],
): Promise<void> {
  const match = matchRow(row, instruments);
  const checks = validateRow(row, match);
  const reviewNote = buildReviewNote(checks);

  const toNull = (v: number | string | null | undefined) => (v === null || v === undefined ? null : v);
  
  // Use raw SQL to avoid TypeScript inference issues with nullable instrumentId
  await db.execute(sql`
    INSERT INTO stock_snapshots (
      instrument_id, period_end, close, listed_shares, market_cap,
      paid_capital, pe_trailing, dividend_yield, net_profit,
      net_profit_period_end, last_coupon, ex_date, document_id,
      page, row_index, status, review_note
    ) VALUES (
      ${toNull(match.instrumentId)}, ${periodEnd}, ${toNull(row.close)},
      ${toNull(row.listedShares)}, ${toNull(row.marketCap)},
      ${toNull(row.paidCapital)}, ${toNull(row.peTrailing)},
      ${toNull(row.dividendYield)}, ${toNull(row.netProfit)},
      ${toNull(row.netProfitPeriodEnd)}, ${toNull(row.lastCoupon)},
      ${toNull(row.exDate)}, ${documentId}, ${row.page},
      ${row.rowIndex}, 'staged', ${reviewNote}
    )
  `);

  await logDocument(sha, "info", "صف تم تجهيزه للمراجعة", {
    documentId,
    page: row.page,
    rowIndex: row.rowIndex,
    nameAr: row.nameAr,
    matchedTicker: match.matchedTicker || "—",
    confidence: match.confidence,
    method: match.method,
    checks: checks.map((c) => ({ ok: c.ok, msg: c.message })),
    reviewNote,
  });
}

/**
 * Stages all rows from an extracted document.
 * Returns a summary for the CLI/scheduler.
 */
export async function stageDocument(documentId: number): Promise<{
  staged: number;
  matched: number;
  unmatched: number;
  issues: number;
}> {
  const [document] = await db
    .select()
    .from(sourceDocuments)
    .where(eq(sourceDocuments.id, documentId))
    .limit(1);

  if (!document) {
    throw new Error(`Document ${documentId} not found`);
  }

  if (document.status !== "extracted") {
    throw new Error(`Document ${documentId} is not extracted (status: ${document.status})`);
  }

  const sha = document.sha256;
  const artifactPath = extractionPath(sha);
  const raw = await readFile(artifactPath, "utf8");
  const artifact = JSON.parse(raw) as ExtractionArtifact;

  if (!artifact.rows || artifact.rows.length === 0) {
    await db
      .update(sourceDocuments)
      .set({ status: "failed", error: "No rows in artifact" })
      .where(eq(sourceDocuments.id, documentId));
    await logDocument(sha, "error", "No rows in artifact", { documentId });
    return { staged: 0, matched: 0, unmatched: 0, issues: 0 };
  }

  await db
    .update(sourceDocuments)
    .set({ status: "validating" })
    .where(eq(sourceDocuments.id, documentId));

  await logDocument(sha, "step", "بدء التحقق والمطابقة", {
    documentId,
    rows: artifact.rows.length,
    periodEnd: document.periodEnd,
  });

  const instruments = await loadInstruments();
  let staged = 0;
  let matched = 0;
  let unmatched = 0;
  let issues = 0;

  // Track which instruments we've already staged in this batch to avoid
  // unique constraint violations from duplicate rows in the PDF.
  const stagedInstruments = new Set<number>();

  for (const row of artifact.rows) {
    const match = matchRow(row, instruments);
    
    // Skip if we already staged this instrument for this period
    if (match.instrumentId && stagedInstruments.has(match.instrumentId)) {
      await logDocument(sha, "warn", "Duplicate instrument in PDF, skipping", {
        documentId,
        page: row.page,
        rowIndex: row.rowIndex,
        nameAr: row.nameAr,
        instrumentId: match.instrumentId,
      });
      continue;
    }

    const checks = validateRow(row, match);

    await stageOne(sha, documentId, document.periodEnd, row, instruments);

    staged += 1;
    if (match.instrumentId) {
      matched += 1;
      stagedInstruments.add(match.instrumentId);
    } else {
      unmatched += 1;
    }
    if (checks.some((c) => !c.ok)) issues += 1;
  }  const finalStatus = staged > 0 ? "validated" : "failed";
  await db
    .update(sourceDocuments)
    .set({ status: finalStatus })
    .where(eq(sourceDocuments.id, documentId));

  await logDocument(sha, "step", "اكتمل التحقق والتجهيز", {
    documentId,
    staged,
    matched,
    unmatched,
    issues,
    status: finalStatus,
  });

  return { staged, matched, unmatched, issues };
}