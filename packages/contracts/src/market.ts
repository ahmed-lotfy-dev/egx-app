import { z } from "zod";

export const MarketMetaSchema = z.object({
  asOf: z.iso.datetime().nullable(),
  source: z.string(),
  stale: z.boolean(),
  universeAsOf: z.iso.datetime().nullable().optional(),
  nextCursor: z.string().nullable().optional(),
});

export type MarketMeta = z.infer<typeof MarketMetaSchema>;

export const QuoteSchema = z.object({
  price: z.number().nullable(),
  change: z.number().nullable(),
  changePct: z.number().nullable(),
  volume: z.number().int().nullable(),
  marketCap: z.number().nullable(),
  currency: z.string().nullable(),
  asOf: z.iso.datetime().nullable(),
  source: z.string().nullable(),
  stale: z.boolean(),
});

export type Quote = z.infer<typeof QuoteSchema>;

export const InstrumentSummarySchema = z.object({
  ticker: z.string(),
  nameEn: z.string(),
  nameAr: z.string().nullable(),
  sector: z.string().nullable(),
  industry: z.string().nullable(),
  kind: z.enum(["stock", "index"]),
  market: z.enum(["EGX", "SAUDI"]).default("EGX"),
  currency: z.string(),
  quote: QuoteSchema.nullable(),
});

export type InstrumentSummary = z.infer<typeof InstrumentSummarySchema>;

export const InstrumentListResponseSchema = z.object({
  data: z.array(InstrumentSummarySchema),
  meta: MarketMetaSchema,
});

export type InstrumentListResponse = z.infer<
  typeof InstrumentListResponseSchema
>;

export const FundamentalsSchema = z.object({
  source: z.string(),
  asOf: z.string().nullable(),
  observedAt: z.iso.datetime(),
  currency: z.string().nullable(),
  marketCap: z.number().nullable(),
  pe: z.number().nullable(),
  pb: z.number().nullable(),
  eps: z.number().nullable(),
  roe: z.number().nullable(),
  roa: z.number().nullable(),
  debtToEquity: z.number().nullable(),
  dividendYield: z.number().nullable(),
  revenueTtm: z.number().nullable(),
  netIncomeTtm: z.number().nullable(),
  fcfTtm: z.number().nullable(),
  currentRatio: z.number().nullable(),
  beta: z.number().nullable(),
  grossMargin: z.number().nullable(),
  netMargin: z.number().nullable(),
  totalDebt: z.number().nullable(),
  totalAssets: z.number().nullable(),
  bookValuePerShare: z.number().nullable(),
  evEbitda: z.number().nullable(),
});

export type Fundamentals = z.infer<typeof FundamentalsSchema>;

export const InstrumentDetailSchema = InstrumentSummarySchema.extend({
  tvSymbol: z.string(),
  yahooSymbol: z.string().nullable(),
  isin: z.string().nullable(),
  logoid: z.string().nullable(),
  history: z.object({
    barCount: z.number().int(),
    firstDate: z.string().nullable(),
    lastDate: z.string().nullable(),
  }),
  fundamentals: FundamentalsSchema.nullable(),
});

export type InstrumentDetail = z.infer<typeof InstrumentDetailSchema>;

export const InstrumentDetailResponseSchema = z.object({
  data: InstrumentDetailSchema,
  meta: MarketMetaSchema,
});

export type InstrumentDetailResponse = z.infer<
  typeof InstrumentDetailResponseSchema
>;

export const DailyBarSchema = z.object({
  date: z.string(),
  open: z.number().nullable(),
  high: z.number().nullable(),
  low: z.number().nullable(),
  close: z.number().nullable(),
  adjClose: z.number().nullable(),
  volume: z.number().int().nullable(),
});

export const HistoryStatsSchema = z.object({
  barCount: z.number().int(),
  rangeBarCount: z.number().int(),
  firstDate: z.string().nullable(),
  lastDate: z.string().nullable(),
  high20: z.number().nullable(),
  low20: z.number().nullable(),
  high52w: z.number().nullable(),
  low52w: z.number().nullable(),
  avgVolume20: z.number().int().nullable(),
});

export type HistoryStats = z.infer<typeof HistoryStatsSchema>;

export const SupportResistanceSchema = z.object({
  pivot: z.number(),
  r1: z.number(),
  r2: z.number(),
  r3: z.number(),
  s1: z.number(),
  s2: z.number(),
  s3: z.number(),
  asOf: z.string(),
  basis: z.enum(["raw", "adjusted"]),
});

export type SupportResistance = z.infer<typeof SupportResistanceSchema>;

export const InstrumentHistoryResponseSchema = z.object({
  data: z.array(DailyBarSchema),
  stats: HistoryStatsSchema,
  levels: SupportResistanceSchema.nullable(),
  meta: MarketMetaSchema,
});

export type InstrumentHistoryResponse = z.infer<
  typeof InstrumentHistoryResponseSchema
>;

export const MarketOverviewSchema = z.object({
  index: InstrumentSummarySchema.nullable(),
  indexSparkline: z.array(z.number()),
  breadth: z.object({
    advancers: z.number().int(),
    decliners: z.number().int(),
    unchanged: z.number().int(),
    total: z.number().int(),
  }),
  gainers: z.array(InstrumentSummarySchema),
  losers: z.array(InstrumentSummarySchema),
  sectors: z.array(
    z.object({
      sector: z.string(),
      changePct: z.number().nullable(),
      advancers: z.number().int(),
      decliners: z.number().int(),
      count: z.number().int(),
    }),
  ),
  instrumentCount: z.number().int(),
});

export type MarketOverview = z.infer<typeof MarketOverviewSchema>;

export const MarketOverviewResponseSchema = z.object({
  data: MarketOverviewSchema,
  meta: MarketMetaSchema,
});

export type MarketOverviewResponse = z.infer<
  typeof MarketOverviewResponseSchema
>;

export const DataStatusJobSchema = z.object({
  job: z.string(),
  status: z.enum(["running", "success", "partial", "failed"]),
  provider: z.string().nullable(),
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable(),
  itemsOk: z.number().int(),
  itemsFailed: z.number().int(),
  error: z.string().nullable(),
  stale: z.boolean(),
});

export const DataStatusResponseSchema = z.object({
  data: z.object({
    jobs: z.array(DataStatusJobSchema),
    counts: z.object({
      instruments: z.number().int(),
      stocks: z.number().int(),
      indices: z.number().int(),
      quotes: z.number().int(),
      dailyBars: z.number().int(),
      barInstruments: z.number().int(),
      fundamentals: z.number().int(),
      newsItems: z.number().int(),
      newsLinks: z.number().int(),
    }),
  }),
  meta: MarketMetaSchema,
});

export type DataStatusResponse = z.infer<typeof DataStatusResponseSchema>;

export const NewsItemSchema = z.object({
  id: z.number().int(),
  source: z.string(),
  lang: z.enum(["ar", "en"]),
  title: z.string(),
  summary: z.string().nullable(),
  url: z.string(),
  publishedAt: z.iso.datetime(),
  matchType: z.enum(["ticker", "name"]),
});

export type NewsItem = z.infer<typeof NewsItemSchema>;

export const InstrumentNewsResponseSchema = z.object({
  data: z.array(NewsItemSchema),
  meta: MarketMetaSchema.extend({
    lang: z.enum(["ar", "en"]).nullable(),
    fallback: z.boolean(),
  }),
});

export type InstrumentNewsResponse = z.infer<
  typeof InstrumentNewsResponseSchema
>;

export const FeedNewsItemSchema = z.object({
  id: z.number().int(),
  source: z.string(),
  lang: z.enum(["ar", "en"]),
  title: z.string(),
  summary: z.string().nullable(),
  url: z.string(),
  publishedAt: z.iso.datetime(),
  category: z.string().nullable(),
  // AI fields
  aiSummary: z.string().nullable(),
  aiKeyPoints: z.array(z.string()).nullable(),
  sentiment: z.enum(["bullish", "bearish", "neutral", "mixed"]).nullable().default("neutral"),
  impactScore: z.number().int().nullable(),
  impactLevel: z.enum(["critical", "high", "medium", "low"]).nullable(),
  entities: z.object({
    tickers: z.array(z.string()),
    sectors: z.array(z.string()),
    countries: z.array(z.string()),
    people: z.array(z.string()),
    companies: z.array(z.string()),
  }).nullable(),
  translatedTitle: z.string().nullable(),
  translatedSummary: z.string().nullable(),
  sourceRegion: z.string().nullable(),
  sourceCategory: z.string().nullable(),
  tradingSignals: z.array(z.string()).nullable(),
  aiAdvice: z.string().nullable(),
}).transform((data) => ({
  ...data,
  aiKeyPoints: data.aiKeyPoints ?? [],
  entities: data.entities ?? { tickers: [], sectors: [], countries: [], people: [], companies: [] },
  tradingSignals: data.tradingSignals ?? [],
}));

export type FeedNewsItem = z.infer<typeof FeedNewsItemSchema>;

export const NewsFeedResponseSchema = z.object({
  data: z.array(FeedNewsItemSchema),
  meta: z.object({
    nextCursor: z.string().nullable(),
    limit: z.number().int(),
    region: z.enum(["egypt", "saudi", "international"]),
    asOf: z.iso.datetime().nullable(),
  }),
});

export type NewsFeedResponse = z.infer<typeof NewsFeedResponseSchema>;

export const WatchlistInstrumentSchema = z.object({
  ticker: z.string(),
  nameAr: z.string().nullable(),
  nameEn: z.string(),
  sector: z.string().nullable(),
  quote: z.object({
    price: z.number().nullable(),
    change: z.number().nullable(),
    changePct: z.number().nullable(),
    currency: z.string().nullable(),
  }).nullable(),
});

export const WatchlistSchema = z.object({
  id: z.string(),
  /** "egx30" and "sharia" are computed defaults; "custom" is a user list */
  kind: z.enum(["egx30", "sharia", "custom"]),
  name: z.string(),
  /** custom lists can be renamed/deleted/edited; defaults are read-only */
  editable: z.boolean(),
  instrumentCount: z.number().int(),
  instruments: z.array(WatchlistInstrumentSchema),
});

export type Watchlist = z.infer<typeof WatchlistSchema>;

export const WatchlistsResponseSchema = z.object({
  data: z.array(WatchlistSchema),
  meta: z.object({
    asOf: z.iso.datetime().nullable(),
  }),
});

export type WatchlistsResponse = z.infer<typeof WatchlistsResponseSchema>;

export const CreateWatchlistRequestSchema = z.object({
  name: z.string().trim().min(1).max(60),
});

export const RenameWatchlistRequestSchema = z.object({
  name: z.string().trim().min(1).max(60),
});

export const AddWatchlistItemRequestSchema = z.object({
  ticker: z.string().trim().min(1).max(20).toUpperCase(),
});

/** Full ordered list of tickers for a watchlist (drag & drop reorder) */
export const ReorderWatchlistItemsRequestSchema = z.object({
  tickers: z.array(z.string().trim().min(1).max(20).toUpperCase()).min(1).max(200),
});

export type CreateWatchlistRequest = z.infer<typeof CreateWatchlistRequestSchema>;
export type RenameWatchlistRequest = z.infer<typeof RenameWatchlistRequestSchema>;
export type AddWatchlistItemRequest = z.infer<typeof AddWatchlistItemRequestSchema>;
export type ReorderWatchlistItemsRequest = z.infer<typeof ReorderWatchlistItemsRequestSchema>;

/** Economy-strip indicators tracked by the worker (USD/EGP, oil, gold). */
export const MACRO_KEYS = [
  "usd_egp",
  "brent",
  "wti",
  "gold_oz",
  "gold_egp_24k",
  "gold_egp_21k",
] as const;

export const MacroKeySchema = z.enum(MACRO_KEYS);

export type MacroKey = z.infer<typeof MacroKeySchema>;

export const MacroQuoteSchema = z.object({
  key: MacroKeySchema,
  value: z.number().nullable(),
  change: z.number().nullable(),
  changePct: z.number().nullable(),
  currency: z.string().nullable(),
  unit: z.string().nullable(),
  source: z.string(),
  asOf: z.iso.datetime().nullable(),
  /** True when the quote is too old to trust (worker has not refreshed it). */
  stale: z.boolean(),
});

export type MacroQuote = z.infer<typeof MacroQuoteSchema>;

export const MacroQuotesResponseSchema = z.object({
  data: z.array(MacroQuoteSchema),
});

export type MacroQuotesResponse = z.infer<typeof MacroQuotesResponseSchema>;
