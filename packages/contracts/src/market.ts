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

export const InstrumentHistoryResponseSchema = z.object({
  data: z.array(DailyBarSchema),
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
    }),
  }),
  meta: MarketMetaSchema,
});

export type DataStatusResponse = z.infer<typeof DataStatusResponseSchema>;
