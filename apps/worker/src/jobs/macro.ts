import { db } from "@egx/api/db";
import { macroQuotes } from "@egx/api/schema";

import { fetchWithRetry } from "../lib/http";
import { withIngestRun } from "../lib/runs";

const GLOBAL_SCAN_URL = "https://scanner.tradingview.com/global/scan";

const TROY_OUNCE_GRAMS = 31.103474;

type MacroSymbol = {
  key: string;
  tvSymbol: string;
  currency: string;
  unit: string | null;
};

const MACRO_SYMBOLS: MacroSymbol[] = [
  { key: "usd_egp", tvSymbol: "FX_IDC:USDEGP", currency: "EGP", unit: null },
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

export async function syncMacro() {
  return withIngestRun("macro", "tradingview", async () => {
    const rows = await scanGlobal(MACRO_SYMBOLS.map((s) => s.tvSymbol));
    const asOf = new Date();
    const values = new Map<string, number>();

    for (const macro of MACRO_SYMBOLS) {
      const row = rows.get(macro.tvSymbol);
      const close = row ? num(row.d[1]) : null;

      if (close !== null) {
        values.set(macro.key, close);
      }

      await db
        .insert(macroQuotes)
        .values({
          key: macro.key,
          value: close?.toString() ?? null,
          change: row ? (num(row.d[3])?.toString() ?? null) : null,
          changePct: row ? (num(row.d[2])?.toString() ?? null) : null,
          currency: row
            ? typeof row.d[4] === "string"
              ? row.d[4]
              : macro.currency
            : macro.currency,
          unit: macro.unit,
          source: "tradingview",
          asOf,
        })
        .onConflictDoUpdate({
          target: macroQuotes.key,
          set: {
            value: close?.toString() ?? null,
            change: row ? (num(row.d[3])?.toString() ?? null) : null,
            changePct: row ? (num(row.d[2])?.toString() ?? null) : null,
            currency: row
              ? typeof row.d[4] === "string"
                ? row.d[4]
                : macro.currency
              : macro.currency,
            asOf,
            fetchedAt: new Date(),
          },
        });
    }

    // Egyptian gold gram prices derived from the global ounce price and
    // USD/EGP (24k = pure, 21k = 87.5%). Marked as derived, not an official
    // local market quote.
    const goldOz = values.get("gold_oz");
    const usdEgp = values.get("usd_egp");

    if (goldOz !== undefined && usdEgp !== undefined) {
      const gram24 = (goldOz / TROY_OUNCE_GRAMS) * usdEgp;
      const gram21 = gram24 * (21 / 24);

      for (const [key, value] of [
        ["gold_egp_24k", gram24],
        ["gold_egp_21k", gram21],
      ] as const) {
        await db
          .insert(macroQuotes)
          .values({
            key,
            value: value.toString(),
            change: null,
            changePct: null,
            currency: "EGP",
            unit: "gram",
            source: "derived",
            asOf,
          })
          .onConflictDoUpdate({
            target: macroQuotes.key,
            set: { value: value.toString(), asOf, fetchedAt: new Date() },
          });
      }
    }

    if (values.size === 0) {
      throw new Error("TradingView global scan returned no macro quotes");
    }

    return {
      itemsOk: values.size,
      itemsFailed: MACRO_SYMBOLS.length - values.size,
      status: values.size < MACRO_SYMBOLS.length ? "partial" : "success",
      metadata: { symbols: MACRO_SYMBOLS.map((s) => s.tvSymbol), values: Object.fromEntries(values) },
    };
  });
}
