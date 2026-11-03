import { and, eq, notInArray, sql } from "drizzle-orm";

import { db } from "@egx/api/db";
import { instruments } from "@egx/api/schema";
import { normalizeArabic, normalizeEnglish } from "@egx/api/text";

import { withIngestRun } from "../lib/runs";
import { TradingViewProvider } from "../providers/tradingview";
import type { MarketCode } from "../providers/types";

const UNIVERSE_MARKETS: MarketCode[] = ["EGX", "SAUDI"];
const MIN_UNIVERSE_SIZE: Record<MarketCode, number> = { EGX: 200, SAUDI: 300 };

export async function syncUniverse() {
  return withIngestRun("universe", "tradingview", async () => {
    const provider = new TradingViewProvider();

    const perMarket = await Promise.all(
      UNIVERSE_MARKETS.map(async (market) => {
        const seeds = await provider.fetchUniverse(market);
        if (seeds.length < MIN_UNIVERSE_SIZE[market]) {
          throw new Error(
            `Universe too small for ${market}: ${seeds.length} instruments`,
          );
        }
        return seeds;
      }),
    );
    const seeds = perMarket.flat();

    const now = new Date();
    const rows = seeds.map((seed) => ({
      ticker: seed.ticker,
      tvSymbol: seed.tvSymbol,
      yahooSymbol: seed.yahooSymbol,
      nameEn: seed.nameEn,
      nameAr: seed.nameAr,
      searchNameEn: normalizeEnglish(seed.nameEn),
      searchNameAr: seed.nameAr ? normalizeArabic(seed.nameAr) : null,
      sector: seed.sector,
      industry: seed.industry,
      logoid: seed.logoid,
      kind: seed.kind,
      market: seed.market,
      currency: seed.currency,
      isActive: true,
      updatedAt: now,
    }));

    await db
      .insert(instruments)
      .values(rows)
      .onConflictDoUpdate({
        target: instruments.ticker,
        set: {
          tvSymbol: sql`excluded.tv_symbol`,
          yahooSymbol: sql`excluded.yahoo_symbol`,
          nameEn: sql`excluded.name_en`,
          // TradingView has no Arabic name for some listings (backfilled from
          // the exchange's own site) — keep the stored name when the feed
          // returns null instead of wiping it on every sync.
          nameAr: sql`coalesce(excluded.name_ar, ${instruments.nameAr})`,
          searchNameEn: sql`excluded.search_name_en`,
          searchNameAr: sql`coalesce(excluded.search_name_ar, ${instruments.searchNameAr})`,
          sector: sql`excluded.sector`,
          industry: sql`excluded.industry`,
          logoid: sql`excluded.logoid`,
          kind: sql`excluded.kind`,
          market: sql`excluded.market`,
          currency: sql`excluded.currency`,
          isActive: sql`excluded.is_active`,
          updatedAt: sql`excluded.updated_at`,
        },
      });

    const stockSymbols = seeds
      .filter((seed) => seed.kind === "stock")
      .map((seed) => seed.tvSymbol);

    await db
      .update(instruments)
      .set({ isActive: false, updatedAt: now })
      .where(
        and(
          eq(instruments.kind, "stock"),
          notInArray(instruments.tvSymbol, stockSymbols),
        ),
      );

    return {
      itemsOk: seeds.length,
      metadata: {
        stocks: stockSymbols.length,
        indices: seeds.length - stockSymbols.length,
      },
    };
  });
}
