import { db } from "@egx/api/db";
import { macroQuotes } from "@egx/api/schema";

import { fetchWithRetry } from "../lib/http";
import { withIngestRun } from "../lib/runs";

const GLOBAL_SCAN_URL = "https://scanner.tradingview.com/global/scan";
const FXRATES_URL = "https://api.fxratesapi.com/latest";
const CURRENCY_API_URL =
  "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json";

const TROY_OUNCE_GRAMS = 31.103474;

type MacroSymbol = {
  key: string;
  tvSymbol: string;
  currency: string;
  unit: string | null;
};

/**
 * TradingView covers oil and metals well. USD/EGP is deliberately NOT taken
 * from TradingView: its `FX_IDC:USDEGP` feed is a static reference rate (0%
 * change, days-old timestamp), so it is fetched from a real FX feed instead.
 */
const MACRO_SYMBOLS: MacroSymbol[] = [
  { key: "brent", tvSymbol: "ICEEUR:BRN1!", currency: "USD", unit: "bbl" },
  { key: "wti", tvSymbol: "NYMEX:CL1!", currency: "USD", unit: "bbl" },
  { key: "gold_oz", tvSymbol: "OANDA:XAUUSD", currency: "USD", unit: "oz" },
];

type ScanRow = { s: string; d: unknown[] };

function num(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

async function scanGlobal(
  tvSymbols: string[],
): Promise<Map<string, ScanRow>> {
  const response = await fetchWithRetry(GLOBAL_SCAN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://www.tradingview.com",
      Referer: "https://www.tradingview.com/",
    },
    body: JSON.stringify({
      symbols: { tickers: tvSymbols },
      columns: ["name", "close", "change", "change_abs", "currency"],
      options: { lang: "en" },
    }),
  });

  if (!response.ok) {
    throw new Error(`TradingView global scan failed with ${response.status}`);
  }

  const payload = (await response.json()) as { data?: ScanRow[] };
  const rows = new Map<string, ScanRow>();

  for (const row of payload.data ?? []) {
    rows.set(row.s, row);
  }

  return rows;
}

type UsdEgp = { value: number; source: string };

/**
 * USD/EGP from a real FX feed, updated roughly every minute. fxratesapi is the
 * primary; the jsDelivr currency-api snapshot is the fallback. Both are free
 * and keyless.
 */
async function fetchUsdEgp(): Promise<UsdEgp | null> {
  try {
    const response = await fetchWithRetry(`${FXRATES_URL}?base=USD&symbols=EGP`);

    if (response.ok) {
      const payload = (await response.json()) as {
        rates?: Record<string, number>;
      };
      const value = num(payload.rates?.EGP);

      if (value !== null) {
        return { value, source: "fxratesapi" };
      }
    }
  } catch {
    // Fall through to the secondary source.
  }

  try {
    const response = await fetchWithRetry(CURRENCY_API_URL);

    if (response.ok) {
      const payload = (await response.json()) as {
        usd?: { egp?: number };
      };
      const value = num(payload.usd?.egp);

      if (value !== null) {
        return { value, source: "currency-api" };
      }
    }
  } catch {
    // No FX source available this cycle.
  }

  return null;
}

async function upsertMacro(values: {
  key: string;
  value: number | null;
  change: number | null;
  changePct: number | null;
  currency: string;
  unit: string | null;
  source: string;
  asOf: Date;
}) {
  await db
    .insert(macroQuotes)
    .values({
      key: values.key,
      value: values.value?.toString() ?? null,
      change: values.change?.toString() ?? null,
      changePct: values.changePct?.toString() ?? null,
      currency: values.currency,
      unit: values.unit,
      source: values.source,
      asOf: values.asOf,
    })
    .onConflictDoUpdate({
      target: macroQuotes.key,
      set: {
        value: values.value?.toString() ?? null,
        change: values.change?.toString() ?? null,
        changePct: values.changePct?.toString() ?? null,
        currency: values.currency,
        unit: values.unit,
        source: values.source,
        asOf: values.asOf,
        fetchedAt: new Date(),
      },
    });
}

export async function syncMacro() {
  return withIngestRun("macro", "tradingview", async () => {
    const asOf = new Date();

    const [rows, usdEgp] = await Promise.all([
      scanGlobal(MACRO_SYMBOLS.map((s) => s.tvSymbol)),
      fetchUsdEgp(),
    ]);

    const values = new Map<string, number>();

    // FX first — gold-gram derivation below depends on it.
    if (usdEgp) {
      values.set("usd_egp", usdEgp.value);
      await upsertMacro({
        key: "usd_egp",
        value: usdEgp.value,
        change: null,
        changePct: null,
        currency: "EGP",
        unit: null,
        source: usdEgp.source,
        asOf,
      });
    }

    for (const macro of MACRO_SYMBOLS) {
      const row = rows.get(macro.tvSymbol);
      const close = row ? num(row.d[1]) : null;

      if (close !== null) {
        values.set(macro.key, close);
      }

      await upsertMacro({
        key: macro.key,
        value: close,
        change: row ? num(row.d[3]) : null,
        changePct: row ? num(row.d[2]) : null,
        currency:
          row && typeof row.d[4] === "string" ? row.d[4] : macro.currency,
        unit: macro.unit,
        source: "tradingview",
        asOf,
      });
    }

    // Egyptian gold gram prices derived from the global ounce price and
    // USD/EGP (24k = pure, 21k = 87.5%). Marked as derived, not an official
    // local market quote.
    const goldOz = values.get("gold_oz");
    const usdEgpValue = values.get("usd_egp");

    if (goldOz !== undefined && usdEgpValue !== undefined) {
      const gram24 = (goldOz / TROY_OUNCE_GRAMS) * usdEgpValue;
      const gram21 = gram24 * (21 / 24);

      for (const [key, value] of [
        ["gold_egp_24k", gram24],
        ["gold_egp_21k", gram21],
      ] as const) {
        await upsertMacro({
          key,
          value,
          change: null,
          changePct: null,
          currency: "EGP",
          unit: "gram",
          source: "derived",
          asOf,
        });
      }
    }

    const expected = MACRO_SYMBOLS.length + 1;

    if (values.size === 0) {
      throw new Error("Macro sync produced no quotes");
    }

    return {
      itemsOk: values.size,
      itemsFailed: Math.max(0, expected - values.size),
      status: values.size < expected ? "partial" : "success",
      metadata: {
        symbols: MACRO_SYMBOLS.map((s) => s.tvSymbol),
        fxSource: usdEgp?.source ?? null,
        values: Object.fromEntries(values),
      },
    };
  });
}
