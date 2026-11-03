import { eq, sql } from "drizzle-orm";

import { db } from "@egx/api/db";
import { instruments, latestQuotes, quoteSnapshots } from "@egx/api/schema";

import { withIngestRun } from "../lib/runs";
import { TradingViewProvider } from "../providers/tradingview";

export async function syncQuotes() {
  return withIngestRun("quotes", "tradingview", async () => {
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
      .where(eq(instruments.isActive, true));

    if (universeRows.length === 0) {
      throw new Error("No active instruments; run the universe sync first");
    }

    const universe = universeRows.map((row) => ({
      ...row,
      kind: row.kind === "index" ? ("index" as const) : ("stock" as const),
    }));

    const provider = new TradingViewProvider();
    const quotes = await provider.fetchQuotes(universe);

    if (quotes.length !== universe.length) {
      throw new Error(
        `Partial quote payload: ${quotes.length} of ${universe.length} instruments`,
      );
    }

    const byTicker = new Map(
      universe.map((instrument) => [instrument.ticker, instrument] as const),
    );
    const fetchedAt = new Date();
    const records = quotes.map((quote) => {
      const instrument = byTicker.get(quote.ticker);

      if (!instrument) {
        throw new Error(`Quote for unknown ticker ${quote.ticker}`);
      }

      return {
        instrumentId: instrument.id,
        price: quote.price?.toString() ?? null,
        change: quote.change?.toString() ?? null,
        changePct: quote.changePct?.toString() ?? null,
        volume: quote.volume,
        marketCap: quote.marketCap?.toString() ?? null,
        currency: quote.currency,
        source: quote.source,
        asOf: quote.asOf,
        fetchedAt,
      };
    });

    await db.transaction(async (tx) => {
      await tx
        .insert(latestQuotes)
        .values(records)
        .onConflictDoUpdate({
          target: latestQuotes.instrumentId,
          set: {
            price: sql`excluded.price`,
            change: sql`excluded.change`,
            changePct: sql`excluded.change_pct`,
            volume: sql`excluded.volume`,
            marketCap: sql`excluded.market_cap`,
            currency: sql`excluded.currency`,
            source: sql`excluded.source`,
            asOf: sql`excluded.as_of`,
            fetchedAt: sql`excluded.fetched_at`,
          },
        });

      await tx.insert(quoteSnapshots).values(records);
    });

    return {
      itemsOk: records.length,
      metadata: {
        asOf: quotes[0]?.asOf.toISOString() ?? fetchedAt.toISOString(),
        instruments: records.length,
      },
    };
  });
}
