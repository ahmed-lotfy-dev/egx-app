import { and, eq, notInArray, sql } from "drizzle-orm";

import { db } from "@egx/api/db";
import { instruments } from "@egx/api/schema";
import { normalizeArabic, normalizeEnglish } from "@egx/api/text";

import { withIngestRun } from "../lib/runs";
import { TradingViewProvider } from "../providers/tradingview";

export async function syncUniverse() {
  return withIngestRun("universe", "tradingview", async () => {
    const provider = new TradingViewProvider();
    const seeds = await provider.fetchUniverse();

    if (seeds.length < 200) {
      throw new Error(`Universe too small: ${seeds.length} instruments`);
    }

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
          nameAr: sql`excluded.name_ar`,
          searchNameEn: sql`excluded.search_name_en`,
          searchNameAr: sql`excluded.search_name_ar`,
          sector: sql`excluded.sector`,
          industry: sql`excluded.industry`,
          logoid: sql`excluded.logoid`,
          kind: sql`excluded.kind`,
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
