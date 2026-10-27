import { cairoDate } from "@egx/api/market";
import { hasArabic } from "@egx/api/text";

import { fetchWithRetry } from "../lib/http";
import type {
  DailyBarRecord,
  FundamentalRecord,
  InstrumentRef,
  InstrumentSeed,
  MarketDataProvider,
  QuoteRecord,
} from "./types";

const SCAN_URL = "https://scanner.tradingview.com/egypt/scan";
const SYMBOL_URL = "https://scanner.tradingview.com/symbol";

const IDENTITY_COLUMNS = [
  "name",
  "description",
  "sector",
  "industry",
  "logoid",
  "currency",
  "type",
] as const;

const QUOTE_COLUMNS = [
  "name",
  "close",
  "change",
  "change_abs",
  "volume",
  "market_cap_basic",
  "currency",
  "update_mode",
  "type",
] as const;

const FUNDAMENTAL_COLUMNS = [
  "name",
  "description",
  "currency",
  "market_cap_basic",
  "price_earnings_ttm",
  "earnings_per_share_basic_ttm",
  "price_book_ratio",
  "return_on_equity",
  "return_on_assets",
  "debt_to_equity",
  "dividends_yield",
  "total_revenue_ttm",
  "net_income_ttm",
  "free_cash_flow_ttm",
  "current_ratio",
  "beta_1_year",
  "gross_margin",
  "net_margin",
  "total_debt",
  "total_assets",
  "book_value_per_share_fq",
  "enterprise_value_ebitda_ttm",
] as const;

type ScanRow = { s: string; d: unknown[] };
type ScanResponse = { totalCount?: number; data?: ScanRow[] };

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function num(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * TradingView's scan endpoint reports unavailable metrics as 0. Treat those as
 * missing so the app shows "not available" instead of a fabricated zero.
 */
function metric(value: unknown): number | null {
  const parsed = num(value);

  return parsed === 0 ? null : parsed;
}

function intOrNull(value: unknown): number | null {
  const parsed = num(value);

  return parsed === null ? null : Math.trunc(parsed);
}

async function scan(
  columns: readonly string[],
  lang: "en" | "ar",
): Promise<ScanRow[]> {
  const response = await fetchWithRetry(SCAN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://www.tradingview.com",
      Referer: "https://www.tradingview.com/",
    },
    body: JSON.stringify({
      filter: [
        {
          left: "type",
          operation: "in_range",
          right: ["stock", "dr", "fund"],
        },
      ],
      options: { lang },
      markets: ["egypt"],
      columns,
      sort: { sortBy: "name", sortOrder: "asc" },
      range: [0, 600],
    }),
  });

  if (!response.ok) {
    throw new Error(`TradingView scan failed with ${response.status}`);
  }

  const payload = (await response.json()) as ScanResponse;

  if (!Array.isArray(payload.data) || payload.data.length === 0) {
    throw new Error("TradingView scan returned no instruments");
  }

  return payload.data;
}

function indexSeed(): InstrumentSeed {
  return {
    ticker: "EGX30",
    tvSymbol: "EGX:EGX30",
    yahooSymbol: "^CASE30",
    nameEn: "EGX 30 Index",
    nameAr: "مؤشر EGX 30",
    sector: "Index",
    industry: null,
    logoid: null,
    kind: "index",
    currency: "EGP",
  };
}

export class TradingViewProvider implements MarketDataProvider {
  readonly name = "tradingview";

  async fetchUniverse(): Promise<InstrumentSeed[]> {
    const [englishRows, arabicRows] = await Promise.all([
      scan(IDENTITY_COLUMNS, "en"),
      scan(IDENTITY_COLUMNS, "ar"),
    ]);
    const arabicBySymbol = new Map(
      arabicRows.map((row) => [row.s, row] as const),
    );
    const seeds: InstrumentSeed[] = [];

    for (const row of englishRows) {
      const ticker = text(row.d[0]);
      const tvSymbol = row.s;

      if (!ticker || !tvSymbol) {
        continue;
      }

      const arabicDescription = text(arabicBySymbol.get(tvSymbol)?.d[1]);
      const nameAr =
        arabicDescription && hasArabic(arabicDescription)
          ? arabicDescription
          : null;
      const kind = row.d[6] === "index" ? "index" : "stock";

      seeds.push({
        ticker,
        tvSymbol,
        yahooSymbol: kind === "stock" ? `${ticker}.CA` : null,
        nameEn: text(row.d[1]) ?? ticker,
        nameAr,
        sector: text(row.d[2]),
        industry: text(row.d[3]),
        logoid: text(row.d[4]),
        kind,
        currency: text(row.d[5]) ?? "EGP",
      });
    }

    const index = indexSeed();
    const existingIndex = seeds.find((seed) => seed.ticker === index.ticker);

    if (existingIndex) {
      existingIndex.kind = "index";
      existingIndex.yahooSymbol = index.yahooSymbol;
      existingIndex.nameAr = existingIndex.nameAr ?? index.nameAr;
    } else {
      seeds.push(index);
    }

    return seeds;
  }

  async fetchQuotes(instruments: InstrumentRef[]): Promise<QuoteRecord[]> {
    const rows = await scan(QUOTE_COLUMNS, "en");
    const byTicker = new Map(rows.map((row) => [text(row.d[0]), row] as const));
    const asOf = new Date();
    const quotes: QuoteRecord[] = [];

    for (const instrument of instruments) {
      if (instrument.kind === "index") {
        quotes.push(await this.fetchIndexQuote(instrument, asOf));
        continue;
      }

      const row = byTicker.get(instrument.ticker);

      if (!row) {
        continue;
      }

      quotes.push({
        ticker: instrument.ticker,
        price: num(row.d[1]),
        change: num(row.d[3]),
        changePct: num(row.d[2]),
        volume: intOrNull(row.d[4]),
        marketCap: num(row.d[5]),
        currency: text(row.d[6]) ?? instrument.currency,
        source: this.name,
        asOf,
      });
    }

    return quotes;
  }

  async fetchFundamentals(
    instruments: InstrumentRef[],
  ): Promise<FundamentalRecord[]> {
    const rows = await scan(FUNDAMENTAL_COLUMNS, "en");
    const byTicker = new Map(rows.map((row) => [text(row.d[0]), row] as const));
    const observedAt = new Date();
    const asOf = cairoDate(observedAt);
    const records: FundamentalRecord[] = [];

    for (const instrument of instruments) {
      if (instrument.kind !== "stock") {
        continue;
      }

      const row = byTicker.get(instrument.ticker);

      if (!row) {
        continue;
      }

      records.push({
        ticker: instrument.ticker,
        asOf,
        observedAt,
        currency: text(row.d[2]),
        marketCap: metric(row.d[3]),
        pe: metric(row.d[4]),
        eps: metric(row.d[5]),
        pb: metric(row.d[6]),
        roe: metric(row.d[7]),
        roa: metric(row.d[8]),
        debtToEquity: metric(row.d[9]),
        dividendYield: metric(row.d[10]),
        revenueTtm: metric(row.d[11]),
        netIncomeTtm: metric(row.d[12]),
        fcfTtm: metric(row.d[13]),
        currentRatio: metric(row.d[14]),
        beta: metric(row.d[15]),
        grossMargin: metric(row.d[16]),
        netMargin: metric(row.d[17]),
        totalDebt: metric(row.d[18]),
        totalAssets: metric(row.d[19]),
        bookValuePerShare: metric(row.d[20]),
        evEbitda: metric(row.d[21]),
        raw: Object.fromEntries(
          FUNDAMENTAL_COLUMNS.map((column, index) => [column, row.d[index]]),
        ),
      });
    }

    return records;
  }

  private async fetchIndexQuote(
    instrument: InstrumentRef,
    asOf: Date,
  ): Promise<QuoteRecord> {
    const url = new URL(SYMBOL_URL);
    url.searchParams.set("symbol", instrument.tvSymbol);
    url.searchParams.set(
      "fields",
      "name,description,close,change,change_abs,volume,currency,type,update_mode",
    );

    const response = await fetchWithRetry(url, {
      headers: { Referer: "https://www.tradingview.com/" },
    });

    if (!response.ok) {
      throw new Error(
        `TradingView symbol quote failed for ${instrument.ticker} with ${response.status}`,
      );
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const close = num(payload.close);
    const changePct = num(payload.change);
    const absolute = num(payload.change_abs);

    return {
      ticker: instrument.ticker,
      price: close,
      change:
        absolute ??
        (close !== null && changePct !== null
          ? close - close / (1 + changePct / 100)
          : null),
      changePct,
      volume: intOrNull(payload.volume),
      marketCap: null,
      currency: text(payload.currency) ?? instrument.currency,
      source: this.name,
      asOf,
    };
  }

  fetchDailyBars(
    _instrument: InstrumentRef,
    _days: number,
  ): Promise<DailyBarRecord[]> {
    throw new Error("TradingView does not provide daily bars in this app");
  }
}
