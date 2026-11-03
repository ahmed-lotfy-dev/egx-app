export interface Document {
  id: number;
  sha256: string;
  filename: string;
  periodStart: string;
  periodEnd: string;
  pages: number;
  status: string;
  error: string | null;
  uploadedBy: string;
  uploadedAt: string;
  publishedAt: string | null;
}

export interface SnapshotRow {
  id: number;
  instrumentId: number | null;
  periodEnd: string;
  close: number | null;
  listedShares: number | null;
  marketCap: number | null;
  paidCapital: number | null;
  peTrailing: number | null;
  dividendYield: number | null;
  netProfit: number | null;
  netProfitPeriodEnd: string | null;
  lastCoupon: number | null;
  exDate: string | null;
  documentId: number;
  page: number;
  rowIndex: number;
  status: string;
  reviewNote: string | null;
  ticker?: string;
  nameAr?: string | null;
  nameEn?: string;
}

export interface DetailData {
  document: Document;
  rows: SnapshotRow[];
}
