import { and, eq, sql } from "drizzle-orm";

import { db } from "@egx/api/db";
import { fundamentals, instruments } from "@egx/api/schema";

import { withIngestRun } from "../lib/runs";
import { TradingViewProvider } from "../providers/tradingview";

export async function syncFundamentals() {
  return withIngestRun("fundamentals", "tradingview", async () => {
    const universeRows = await db
      .select({
        id: instruments.id,
        ticker: instruments.ticker,
        tvSymbol: instruments.tvSymbol,
        yahooSymbol: instruments.yahooSymbol,
        kind: instruments.kind,
        currency: instruments.currency,
      })
      .from(instruments)
      .where(and(eq(instruments.isActive, true), eq(instruments.kind, "stock")));

    if (universeRows.length === 0) {
      throw new Error("No active stocks; run the universe sync first");
    }

    const universe = universeRows.map((row) => ({
      ...row,
      kind: "stock" as const,
    }));

    const provider = new TradingViewProvider();
    const records = await provider.fetchFundamentals(universe);

    if (records.length === 0) {
      throw new Error("TradingView returned no fundamentals");
    }

    const byTicker = new Map(
      universe.map((instrument) => [instrument.ticker, instrument] as const),
    );

    const values = records.map((record) => {
      const instrument = byTicker.get(record.ticker);

      if (!instrument) {
        throw new Error(`Fundamentals for unknown ticker ${record.ticker}`);
      }

      return {
        instrumentId: instrument.id,
        source: "tradingview",
        asOf: record.asOf,
        observedAt: record.observedAt,
        currency: record.currency,
        marketCap: record.marketCap?.toString() ?? null,
        pe: record.pe?.toString() ?? null,
        pb: record.pb?.toString() ?? null,
        eps: record.eps?.toString() ?? null,
        roe: record.roe?.toString() ?? null,
        roa: record.roa?.toString() ?? null,
        debtToEquity: record.debtToEquity?.toString() ?? null,
        dividendYield: record.dividendYield?.toString() ?? null,
        revenueTtm: record.revenueTtm?.toString() ?? null,
        netIncomeTtm: record.netIncomeTtm?.toString() ?? null,
        fcfTtm: record.fcfTtm?.toString() ?? null,
        currentRatio: record.currentRatio?.toString() ?? null,
        beta: record.beta?.toString() ?? null,
        grossMargin: record.grossMargin?.toString() ?? null,
        netMargin: record.netMargin?.toString() ?? null,
        totalDebt: record.totalDebt?.toString() ?? null,
        totalAssets: record.totalAssets?.toString() ?? null,
        bookValuePerShare: record.bookValuePerShare?.toString() ?? null,
        evEbitda: record.evEbitda?.toString() ?? null,
        raw: record.raw,
      };
    });

    await db
      .insert(fundamentals)
      .values(values)
      .onConflictDoUpdate({
        target: [fundamentals.instrumentId, fundamentals.source],
        set: {
          asOf: sql`excluded.as_of`,
          observedAt: sql`excluded.observed_at`,
          currency: sql`excluded.currency`,
          marketCap: sql`excluded.market_cap`,
          pe: sql`excluded.pe`,
          pb: sql`excluded.pb`,
          eps: sql`excluded.eps`,
          roe: sql`excluded.roe`,
          roa: sql`excluded.roa`,
          debtToEquity: sql`excluded.debt_to_equity`,
          dividendYield: sql`excluded.dividend_yield`,
          revenueTtm: sql`excluded.revenue_ttm`,
          netIncomeTtm: sql`excluded.net_income_ttm`,
          fcfTtm: sql`excluded.fcf_ttm`,
          currentRatio: sql`excluded.current_ratio`,
          beta: sql`excluded.beta`,
          grossMargin: sql`excluded.gross_margin`,
          netMargin: sql`excluded.net_margin`,
          totalDebt: sql`excluded.total_debt`,
          totalAssets: sql`excluded.total_assets`,
          bookValuePerShare: sql`excluded.book_value_per_share`,
          evEbitda: sql`excluded.ev_ebitda`,
          raw: sql`excluded.raw`,
        },
      });

    return {
      itemsOk: values.length,
      itemsFailed: universe.length - values.length,
      metadata: {
        asOf: records[0]?.asOf ?? null,
        withPe: records.filter((record) => record.pe !== null).length,
        withDividendYield: records.filter(
          (record) => record.dividendYield !== null,
        ).length,
      },
    };
  });
}
