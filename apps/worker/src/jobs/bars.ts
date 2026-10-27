import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";

import { db } from "@egx/api/db";
import { dailyBars, instruments } from "@egx/api/schema";

import { sleep } from "../lib/http";
import { withIngestRun } from "../lib/runs";
import { YahooProvider } from "../providers/yahoo";

export type BarsOptions = {
  tickers?: string[];
  limit?: number;
  days?: number;
  missing?: boolean;
};

type Failure = { ticker: string; error: string };

export async function syncBars(options: BarsOptions = {}) {
  const days = options.days ?? 365;

  return withIngestRun("bars", "yahoo", async () => {
    const conditions = [
      inArray(instruments.kind, ["stock", "index"]),
      eq(instruments.isActive, true),
      isNotNull(instruments.yahooSymbol),
    ];

    if (options.tickers?.length) {
      conditions.push(inArray(instruments.ticker, options.tickers));
    }

    if (options.missing) {
      conditions.push(
        sql`not exists (
          select 1 from ${dailyBars}
          where ${dailyBars.instrumentId} = ${instruments.id}
        )`,
      );
    }

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
      .where(and(...conditions))
      .orderBy(asc(instruments.ticker))
      .limit(options.limit ?? 1000);

    if (universeRows.length === 0) {
      throw new Error(
        options.tickers?.length
          ? `No active instruments match ${options.tickers.join(", ")}`
          : "No active instruments; run the universe sync first",
      );
    }

    const universe = universeRows.map((row) => ({
      ...row,
      kind: row.kind === "index" ? ("index" as const) : ("stock" as const),
    }));

    const provider = new YahooProvider();
    await provider.init();

    const queue = [...universe];
    const failures: Failure[] = [];
    let ok = 0;
    let barsWritten = 0;

    const worker = async () => {
      for (;;) {
        const instrument = queue.shift();

        if (!instrument) {
          return;
        }

        try {
          const bars = await provider.fetchDailyBars(instrument, days);

          if (bars.length === 0) {
            throw new Error("No bars returned");
          }

          await db
            .delete(dailyBars)
            .where(
              and(
                eq(dailyBars.instrumentId, instrument.id),
                eq(dailyBars.close, "0"),
              ),
            );

          await db
            .insert(dailyBars)
            .values(
              bars.map((bar) => ({
                instrumentId: instrument.id,
                date: bar.date,
                open: bar.open?.toString() ?? null,
                high: bar.high?.toString() ?? null,
                low: bar.low?.toString() ?? null,
                close: bar.close?.toString() ?? null,
                adjClose: bar.adjClose?.toString() ?? null,
                volume: bar.volume,
                priceBasis: bar.priceBasis,
                source: bar.source,
                raw: bar.raw,
              })),
            )
            .onConflictDoUpdate({
              target: [dailyBars.instrumentId, dailyBars.date],
              set: {
                open: sql`excluded.open`,
                high: sql`excluded.high`,
                low: sql`excluded.low`,
                close: sql`excluded.close`,
                adjClose: sql`excluded.adj_close`,
                volume: sql`excluded.volume`,
                priceBasis: sql`excluded.price_basis`,
                source: sql`excluded.source`,
                raw: sql`excluded.raw`,
              },
            });

          ok += 1;
          barsWritten += bars.length;

          if (ok % 25 === 0) {
            console.log(`  bars: ${ok}/${universe.length} instruments`);
          }
        } catch (error) {
          failures.push({
            ticker: instrument.ticker,
            error: error instanceof Error ? error.message : String(error),
          });
        }

        await sleep(200);
      }
    };

    await Promise.all([worker(), worker()]);

    if (ok === 0) {
      throw new Error(
        `All bar requests failed: ${failures
          .slice(0, 5)
          .map((failure) => `${failure.ticker}: ${failure.error}`)
          .join("; ")}`,
      );
    }

    return {
      itemsOk: ok,
      itemsFailed: failures.length,
      status: failures.length > 0 ? "partial" : "success",
      metadata: {
        days,
        instruments: universe.length,
        barsWritten,
        failures: failures.slice(0, 50),
      },
    };
  });
}
