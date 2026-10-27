import { instruments, latestQuotes } from "./schema";

/**
 * The shared instrument + latest quote projection. Kept in one place so list,
 * detail, and overview responses cannot drift apart.
 */
export const marketColumns = {
  id: instruments.id,
  ticker: instruments.ticker,
  nameEn: instruments.nameEn,
  nameAr: instruments.nameAr,
  sector: instruments.sector,
  industry: instruments.industry,
  kind: instruments.kind,
  currency: instruments.currency,
  updatedAt: instruments.updatedAt,
  price: latestQuotes.price,
  change: latestQuotes.change,
  changePct: latestQuotes.changePct,
  volume: latestQuotes.volume,
  marketCap: latestQuotes.marketCap,
  quoteCurrency: latestQuotes.currency,
  quoteSource: latestQuotes.source,
  quoteAsOf: latestQuotes.asOf,
};
