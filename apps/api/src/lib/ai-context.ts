import { and, desc, eq, ilike, inArray, or } from "drizzle-orm";

import { db } from "../db/client";
import {
  dailyBars,
  fundamentals,
  instruments,
  latestQuotes,
  macroQuotes,
  newsInstrumentLinks,
  newsItems,
} from "../db/schema";
import { marketColumns } from "../db/selects";
import { cached } from "./cache";
import { computeHistoryStats, computeSupportResistance } from "./levels";
import { normalizeSearch } from "./text";
import { MACRO_KEYS } from "@egx/contracts";

/**
 * Grounding context for the market assistant. The model must never invent
 * numbers, so every price/percentage it may quote is injected here from the
 * same tables the rest of the app reads. Kept compact — this whole block
 * goes into the system prompt on every request.
 */

function num(value: string | number | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function fmt(value: number | null, digits = 2): string {
  return value === null ? "—" : value.toFixed(digits).replace(/\.00$/, "");
}

export interface Grounding {
  text: string;
  ticker: string | null;
}

/** Context for a specific instrument: quote, levels, fundamentals, news. */
export async function buildTickerContext(ticker: string): Promise<Grounding | null> {
  const [row] = await db
    .select(marketColumns)
    .from(instruments)
    .leftJoin(latestQuotes, eq(latestQuotes.instrumentId, instruments.id))
    .where(eq(instruments.ticker, ticker.toUpperCase()))
    .limit(1);

  if (!row) {
    return null;
  }

  const lines: string[] = [
    `INSTRUMENT: ${row.ticker} — ${row.nameEn}${row.nameAr ? ` (${row.nameAr})` : ""}`,
    `SECTOR: ${row.sector ?? "—"}`,
  ];

  if (row.price !== null) {
    lines.push(
      `QUOTE: price=${fmt(num(row.price))} ${row.quoteCurrency ?? row.currency}, change=${fmt(num(row.change))}, changePct=${fmt(num(row.changePct))}%, asOf=${row.quoteAsOf ? new Date(row.quoteAsOf).toISOString() : "—"}, source=${row.quoteSource ?? "—"}`,
    );
  } else {
    lines.push("QUOTE: no quote available");
  }

  const bars = await db
    .select({
      date: dailyBars.date,
      high: dailyBars.high,
      low: dailyBars.low,
      close: dailyBars.close,
      volume: dailyBars.volume,
    })
    .from(dailyBars)
    .where(eq(dailyBars.instrumentId, row.id))
    .orderBy(desc(dailyBars.date))
    .limit(120);

  if (bars.length > 0) {
    const ordered = [...bars].reverse();
    const closes = ordered.map((bar) => num(bar.close)).filter((c): c is number => c !== null);
    const stats = computeHistoryStats(
      ordered.map((bar) => ({
        date: bar.date,
        high: num(bar.high),
        low: num(bar.low),
        close: num(bar.close),
        volume: bar.volume,
      })),
      Math.min(20, ordered.length),
    );
    const levels = computeSupportResistance(
      ordered.map((bar) => ({
        date: bar.date,
        high: num(bar.high),
        low: num(bar.low),
        close: num(bar.close),
        volume: bar.volume,
      })),
    );

    lines.push(
      `PRICE HISTORY: last closes (oldest→newest) = ${closes.slice(-10).map((c) => fmt(c)).join(", ")}`,
      `STATS: high52w=${fmt(stats.high52w)}, low52w=${fmt(stats.low52w)}, high20d=${fmt(stats.high20)}, low20d=${fmt(stats.low20)}, avgVolume20d=${stats.avgVolume20 ?? "—"}`,
    );
    if (levels) {
      lines.push(
        `PIVOT LEVELS: S3/S2/S1 = ${fmt(levels.s3)}/${fmt(levels.s2)}/${fmt(levels.s1)}, pivot=${fmt(levels.pivot)}, R1/R2/R3 = ${fmt(levels.r1)}/${fmt(levels.r2)}/${fmt(levels.r3)} (asOf ${levels.asOf})`,
      );
    }
  }

  const [fundamentalRow] = await db
    .select()
    .from(fundamentals)
    .where(eq(fundamentals.instrumentId, row.id))
    .limit(1);

  if (fundamentalRow) {
    lines.push(
      `FUNDAMENTALS (asOf=${fundamentalRow.asOf ?? "—"}): marketCap=${fmt(num(fundamentalRow.marketCap), 0)}, PE=${fmt(num(fundamentalRow.pe))}, PB=${fmt(num(fundamentalRow.pb))}, EPS=${fmt(num(fundamentalRow.eps))}, ROE=${fmt(num(fundamentalRow.roe))}%, dividendYield=${fmt(num(fundamentalRow.dividendYield))}%, netMargin=${fmt(num(fundamentalRow.netMargin))}%, debtToEquity=${fmt(num(fundamentalRow.debtToEquity))}`,
    );
  }

  const newsRows = await db
    .select({
      title: newsItems.title,
      summary: newsItems.summary,
      aiSummary: newsItems.aiSummary,
      sentiment: newsItems.sentiment,
      impactLevel: newsItems.impactLevel,
      publishedAt: newsItems.publishedAt,
      lang: newsItems.lang,
    })
    .from(newsInstrumentLinks)
    .innerJoin(newsItems, eq(newsInstrumentLinks.newsId, newsItems.id))
    .where(eq(newsInstrumentLinks.instrumentId, row.id))
    .orderBy(desc(newsItems.publishedAt))
    .limit(5);

  if (newsRows.length > 0) {
    lines.push("RECENT NEWS (newest first):");
    for (const item of newsRows) {
      const text = item.aiSummary ?? item.summary ?? item.title;
      lines.push(
        `- [${item.publishedAt.toISOString().slice(0, 10)}] (${item.sentiment ?? "?"}/${item.impactLevel ?? "?"}) ${text.slice(0, 220)}`,
      );
    }
  } else {
    lines.push("RECENT NEWS: none linked in the last syncs");
  }

  return { text: lines.join("\n"), ticker: row.ticker };
}

/** Market-wide context: index, breadth, movers, macro strip. */
export async function buildMarketContext(): Promise<Grounding> {
  const lines: string[] = [];

  const rows = await db
    .select(marketColumns)
    .from(instruments)
    .leftJoin(latestQuotes, eq(latestQuotes.instrumentId, instruments.id))
    .where(eq(instruments.isActive, true));

  const stocks = rows.filter((r) => r.kind !== "index");
  const indexRow = rows.find((r) => r.ticker === "EGX30") ?? rows.find((r) => r.kind === "index");

  if (indexRow) {
    lines.push(
      `INDEX EGX30: price=${fmt(num(indexRow.price))}, changePct=${fmt(num(indexRow.changePct))}%, asOf=${indexRow.quoteAsOf ? new Date(indexRow.quoteAsOf).toISOString() : "—"}`,
    );
  }

  let advancers = 0;
  let decliners = 0;
  for (const stock of stocks) {
    const changePct = num(stock.changePct);
    if (changePct === null) continue;
    if (changePct > 0) advancers += 1;
    else if (changePct < 0) decliners += 1;
  }
  lines.push(`BREADTH: ${advancers} advancers / ${decliners} decliners (of ${stocks.length} listed)`);

  const ranked = stocks
    .map((r) => ({ ...r, pct: num(r.changePct) }))
    .filter((r): r is typeof r & { pct: number } => r.pct !== null);

  const top = (list: typeof ranked) =>
    list
      .slice(0, 5)
      .map((r) => `${r.ticker} ${fmt(num(r.price))} (${fmt(r.pct)}%)`)
      .join(", ");

  lines.push(
    `TOP GAINERS: ${top([...ranked].sort((a, b) => b.pct - a.pct)) || "—"}`,
    `TOP LOSERS: ${top([...ranked].sort((a, b) => a.pct - b.pct)) || "—"}`,
  );

  const macroRows = await db
    .select()
    .from(macroQuotes)
    .orderBy(desc(macroQuotes.asOf))
    .limit(MACRO_KEYS.length);

  const seen = new Set<string>();
  const macroParts: string[] = [];
  for (const item of macroRows) {
    if (seen.has(item.key)) continue;
    seen.add(item.key);
    macroParts.push(`${item.key}=${fmt(num(item.value))} ${item.unit ?? ""}`.trim());
  }
  lines.push(`MACRO: ${macroParts.join(", ") || "—"}`);

  return { text: lines.join("\n"), ticker: null };
}

/**
 * Compact list of every active listing (ticker = English name, Arabic name
 * when present). Injected into market-wide chats so the model can map a
 * user's phrasing — including Arabic names we have no `nameAr` for — onto a
 * ticker, which the route then re-grounds on. Cached: the universe changes
 * rarely and this runs on every market-wide request.
 */
export async function buildCatalog(): Promise<string> {
  return cached("ai:catalog", 10 * 60_000, async () => {
    const rows = await db
      .select({
        ticker: instruments.ticker,
        en: instruments.nameEn,
        ar: instruments.nameAr,
        market: instruments.market,
      })
      .from(instruments)
      .where(eq(instruments.isActive, true))
      .orderBy(instruments.ticker);

    return rows
      .map(
        (row) =>
          `${row.ticker}=${row.en}${row.ar ? ` | ${row.ar}` : ""} [${row.market}]`,
      )
      .join("\n");
  });
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** True when `token` appears as a whole word inside a normalized name. */
function wholeWord(token: string, haystack: string | null): boolean {
  if (!haystack) return false;
  return new RegExp(`(^|\\s)${escapeRegex(token)}(\\s|$)`).test(haystack);
}

/**
 * Finds the instrument a free-text message is asking about, so a market-wide
 * chat can still be grounded on the right stock. Matches an explicit ticker
 * first (COMI), then Arabic/English names ("ابوقير", "Abou Kir"). Returns null
 * when nothing matches or when the match is too ambiguous to trust — the
 * caller then falls back to the provided ticker or the market overview.
 */
export async function resolveMentionedTicker(text: string): Promise<string | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // 1) Explicit ticker symbol (Latin, 2–8 chars, standalone word).
  const tickerTokens = Array.from(
    new Set((trimmed.match(/(?<![A-Za-z0-9])[A-Za-z]{2,8}(?![A-Za-z0-9])/g) ?? []).map((t) => t.toUpperCase())),
  );
  if (tickerTokens.length > 0) {
    const rows = await db
      .select({ ticker: instruments.ticker })
      .from(instruments)
      .where(and(eq(instruments.isActive, true), inArray(instruments.ticker, tickerTokens)));
    if (rows.length === 1) return rows[0]!.ticker;
    if (rows.length > 1) {
      const order = new Map(tickerTokens.map((t, index) => [t, index]));
      rows.sort((a, b) => (order.get(a.ticker) ?? 99) - (order.get(b.ticker) ?? 99));
      return rows[0]!.ticker;
    }
  }

  // 2) Name search on the normalized message, longest (most specific) token
  // first. A generic word like "مصر" matches many companies, so only accept a
  // token when exactly one instrument matches, or the best match is a
  // whole-word hit that is strictly better than the runner-up.
  const normalized = normalizeSearch(trimmed);
  const tokens = Array.from(new Set(normalized.split(" ").filter((word) => word.length >= 3))).sort(
    (a, b) => b.length - a.length,
  );

  for (const token of tokens) {
    const rows = await db
      .select({
        ticker: instruments.ticker,
        en: instruments.searchNameEn,
        ar: instruments.searchNameAr,
      })
      .from(instruments)
      .where(
        and(
          eq(instruments.isActive, true),
          eq(instruments.kind, "stock"),
          or(
            ilike(instruments.searchNameEn, `%${token}%`),
            ilike(instruments.searchNameAr, `%${token}%`),
          ),
        ),
      )
      .limit(8);

    if (rows.length === 0) continue;
    if (rows.length === 1) return rows[0]!.ticker;

    const scored = rows
      .map((row) => {
        const word = wholeWord(token, row.en) || wholeWord(token, row.ar);
        return { ticker: row.ticker, score: (word ? 100 : 0) + token.length };
      })
      .sort((a, b) => b.score - a.score);

    if (scored[0]!.score >= 100 && scored[0]!.score > scored[1]!.score) {
      return scored[0]!.ticker;
    }
  }

  return null;
}
