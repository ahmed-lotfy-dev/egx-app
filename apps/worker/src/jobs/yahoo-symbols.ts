import { and, eq, sql } from "drizzle-orm";

import { db } from "@egx/api/db";
import { dailyBars, instruments } from "@egx/api/schema";

import { sleep } from "../lib/http";
import { withIngestRun } from "../lib/runs";
import { YahooProvider } from "../providers/yahoo";

/**
 * Resolves Yahoo's EGX symbols for instruments that have no daily bars yet.
 * Yahoo sometimes uses an ISIN-style symbol (EGS656M1C010.CA) instead of the
 * exchange ticker, so the exchange ticker alone is not enough.
 */
export async function resolveYahooSymbols() {
  return withIngestRun("yahoo-symbols", "yahoo", async () => {
    const rows = await db
      .select({
        id: instruments.id,
        ticker: instruments.ticker,
        nameEn: instruments.nameEn,
        yahooSymbol: instruments.yahooSymbol,
      })
      .from(instruments)
      .where(
        and(
          eq(instruments.kind, "stock"),
          eq(instruments.isActive, true),
          sql`not exists (
            select 1 from ${dailyBars}
            where ${dailyBars.instrumentId} = ${instruments.id}
          )`,
        ),
      )
      .orderBy(instruments.ticker);

    if (rows.length === 0) {
      return {
        itemsOk: 0,
        metadata: { resolved: 0, unresolved: 0, message: "No missing bars" },
      };
    }

    const provider = new YahooProvider();
    const resolved: Array<{ ticker: string; yahooSymbol: string }> = [];
    const unresolved: string[] = [];

    for (const row of rows) {
      const symbol = await provider.resolveSymbol(row.nameEn, row.ticker);

      if (symbol) {
        if (symbol !== row.yahooSymbol) {
          await db
            .update(instruments)
            .set({ yahooSymbol: symbol, updatedAt: new Date() })
            .where(eq(instruments.id, row.id));
        }

        resolved.push({ ticker: row.ticker, yahooSymbol: symbol });
      } else {
        if (row.yahooSymbol !== null) {
          await db
            .update(instruments)
            .set({ yahooSymbol: null, updatedAt: new Date() })
            .where(eq(instruments.id, row.id));
        }

        unresolved.push(row.ticker);
      }

      await sleep(300);
    }

    return {
      itemsOk: resolved.length,
      itemsFailed: unresolved.length,
      status: unresolved.length > 0 ? "partial" : "success",
      metadata: {
        candidates: rows.length,
        resolved: resolved.slice(0, 50),
        unresolved: unresolved.slice(0, 50),
      },
    };
  });
}
