export type InstrumentKind = "stock" | "index";

export type InstrumentSeed = {
  ticker: string;
  tvSymbol: string;
  yahooSymbol: string | null;
  nameEn: string;
  nameAr: string | null;
  sector: string | null;
  industry: string | null;
  logoid: string | null;
  kind: InstrumentKind;
  currency: string;
};

export type InstrumentRef = Pick<
  InstrumentSeed,
  "ticker" | "tvSymbol" | "yahooSymbol" | "kind" | "currency"
>;

export type QuoteRecord = {
  ticker: string;
  price: number | null;
  change: number | null;
  changePct: number | null;
  volume: number | null;
  marketCap: number | null;
  currency: string | null;
  source: string;
  asOf: Date;
};

export type FundamentalRecord = {
  ticker: string;
  asOf: string;
  observedAt: Date;
  currency: string | null;
  marketCap: number | null;
  pe: number | null;
  pb: number | null;
  eps: number | null;
  roe: number | null;
  roa: number | null;
  debtToEquity: number | null;
  dividendYield: number | null;
  revenueTtm: number | null;
  netIncomeTtm: number | null;
  fcfTtm: number | null;
  currentRatio: number | null;
  beta: number | null;
  grossMargin: number | null;
  netMargin: number | null;
  totalDebt: number | null;
  totalAssets: number | null;
  bookValuePerShare: number | null;
  evEbitda: number | null;
  raw: unknown;
};

export type DailyBarRecord = {
  /** Cairo trading date, YYYY-MM-DD. */
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  adjClose: number | null;
  volume: number | null;
  priceBasis: "adjusted" | "raw";
  source: string;
  raw: unknown;
};

export interface MarketDataProvider {
  readonly name: string;
  fetchUniverse?(): Promise<InstrumentSeed[]>;
  fetchQuotes?(instruments: InstrumentRef[]): Promise<QuoteRecord[]>;
  fetchFundamentals?(
    instruments: InstrumentRef[],
  ): Promise<FundamentalRecord[]>;
  fetchDailyBars?(
    instrument: InstrumentRef,
    days: number,
  ): Promise<DailyBarRecord[]>;
}
