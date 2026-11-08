import { authClient } from "@/lib/auth-client";
import { apiBaseUrl } from "@/lib/config";

/**
 * Admin endpoints are intentionally outside the public OpenAPI contract, so the
 * generated `api` client has no types for them. This helper keeps the exact same
 * auth behaviour as `api.ts`: pull the Better Auth session cookie out of
 * SecureStore and send it as a header (native has no cookie jar).
 */
export class AdminApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
  }
}

async function withAuthHeaders(init?: HeadersInit): Promise<Headers> {
  const headers = new Headers(init);
  const cookie = await authClient.getCookie();

  if (cookie) {
    headers.set("Cookie", cookie);
  }

  return headers;
}

export async function adminFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = await withAuthHeaders(init.headers);
  const res = await fetch(`${apiBaseUrl}${path}`, { ...init, headers });

  const text = await res.text();
  let payload: unknown = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!res.ok) {
    const message =
      (payload as { error?: { message?: string } } | null)?.error?.message ??
      `Request failed (${res.status})`;
    throw new AdminApiError(message, res.status);
  }

  return payload as T;
}

export type AdminDocument = {
  id: string;
  sha256: string;
  filename: string;
  periodStart: string;
  periodEnd: string;
  pages: number;
  storagePath: string;
  status: string;
  error: string | null;
  uploadedBy: string;
  uploadedAt: string;
  publishedAt: string | null;
};

export type AdminDocumentRow = {
  id: string;
  instrumentId: string | null;
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
  documentId: string;
  page: number;
  rowIndex: number;
  status: string;
  reviewNote: string | null;
  ticker: string | null;
  nameAr: string | null;
  nameEn: string | null;
};

export type AdminDocumentDetail = {
  document: AdminDocument;
  rows: AdminDocumentRow[];
};

export type AdminIncomingFile = {
  filename: string;
  sha256: string;
  size: number;
  modifiedAt: string;
  alreadyUploaded: boolean;
  existingStatus?: string;
  periodStart?: string;
  periodEnd?: string;
};

export type AdminPublishResult = {
  id: string;
  status: string;
  published: number;
  skippedUnmatched: number;
  withIssues: number;
};

export const adminApi = {
  list: () => adminFetch<{ data: AdminDocument[] }>("/api/admin/documents"),

  detail: (id: string) =>
    adminFetch<{ data: AdminDocumentDetail }>(
      `/api/admin/documents/${encodeURIComponent(id)}`,
    ),

  scan: () =>
    adminFetch<{ data: AdminIncomingFile[] }>("/api/admin/documents/scan"),

  importFile: (body: {
    filename: string;
    periodStart: string;
    periodEnd: string;
  }) =>
    adminFetch<{ data: AdminDocument }>("/api/admin/documents/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  upload: async (file: { uri: string; name: string; mimeType?: string }, dates: {
    periodStart: string;
    periodEnd: string;
  }) => {
    const form = new FormData();
    form.append("file", {
      uri: file.uri,
      name: file.name,
      type: file.mimeType || "application/pdf",
    });
    form.append("periodStart", dates.periodStart);
    form.append("periodEnd", dates.periodEnd);

    // Use a dedicated fetch that doesn't set Content-Type (let RN set it with boundary)
    const cookie = await authClient.getCookie();
    const headers: HeadersInit = cookie ? { Cookie: cookie } : {};

    const res = await fetch(`${apiBaseUrl}/api/admin/documents`, {
      method: "POST",
      headers,
      body: form,
    });

    const text = await res.text();
    let payload: unknown = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }
    if (!res.ok) {
      const message =
        (payload as { error?: { message?: string } } | null)?.error?.message ??
        `Request failed (${res.status})`;
      throw new AdminApiError(message, res.status);
    }
    return payload as { data: AdminDocument };
  },

  extract: (id: string) =>
    adminFetch<{ data: unknown }>(
      `/api/admin/documents/${encodeURIComponent(id)}/extract`,
      { method: "POST" },
    ),

  publish: (id: string) =>
    adminFetch<{ data: AdminPublishResult }>(
      `/api/admin/documents/${encodeURIComponent(id)}/publish`,
      { method: "POST" },
    ),

  remove: (id: string) =>
    adminFetch<{ data: { id: string; deleted: boolean } }>(
      `/api/admin/documents/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    ),
};

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const toIsoDate = (d: Date): string => {
  const year = d.getFullYear();
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/**
 * Mirrors the server's `extractDatesFromFilename` so the upload form can
 * pre-fill the quarter for the standard EGX disclosure filenames:
 * `DiscDoc_ID123_31-DEC-2025_ARB.pdf`.
 */
export function datesFromFilename(
  filename: string,
): { periodStart: string; periodEnd: string } | null {
  const match = filename.match(
    /DiscDoc_ID\d+_(\d{1,2})-([A-Za-z]{3})-(\d{4})_ARB\.pdf$/i,
  );
  if (!match?.[1] || !match[2] || !match[3]) {
    return null;
  }

  const day = Number.parseInt(match[1], 10);
  const month = MONTHS[match[2].toLowerCase()];
  const year = Number.parseInt(match[3], 10);

  if (!month || Number.isNaN(day) || Number.isNaN(year)) {
    return null;
  }

  const periodEnd = new Date(year, month - 1, day);
  const periodStart = new Date(year, month - 3, 1);

  return { periodStart: toIsoDate(periodStart), periodEnd: toIsoDate(periodEnd) };
}
