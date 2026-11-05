// Fetch TradingView Arabic names for all EGX stocks and build the authoritative map
import { fetchWithRetry } from "./src/lib/http";
import { hasArabic } from "@egx/api/text";

const SCAN_URL = "https://scanner.tradingview.com/egypt/scan";
const IDENTITY_COLUMNS = [
  "name",
  "description",
  "sector",
  "industry",
  "logoid",
  "currency",
  "type",
] as const;

async function scan(columns: readonly string[], lang: "en" | "ar") {
  const response = await fetchWithRetry(SCAN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://www.tradingview.com",
      Referer: "https://www.tradingview.com/",
    },
    body: JSON.stringify({
      filter: [
        {
          left: "type",
          operation: "in_range",
          right: ["stock", "dr", "fund"],
        },
      ],
      options: { lang },
      markets: ["egypt"],
      columns,
      sort: { sortBy: "name", sortOrder: "asc" },
      range: [0, 600],
    }),
  });

  if (!response.ok) {
    throw new Error(`TradingView scan failed with ${response.status}`);
  }

  const payload = (await response.json()) as { totalCount?: number; data?: { s: string; d: unknown[] }[] };

  if (!Array.isArray(payload.data) || payload.data.length === 0) {
    throw new Error("TradingView scan returned no instruments");
  }

  return payload.data;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function main() {
  console.log("Fetching TradingView universe (EN)...");
  const enRows = await scan(IDENTITY_COLUMNS, "en");
  console.log(`  ${enRows.length} rows`);

  console.log("Fetching TradingView universe (AR)...");
  const arRows = await scan(IDENTITY_COLUMNS, "ar");
  console.log(`  ${arRows.length} rows`);

  const arBySymbol = new Map(arRows.map((row) => [row.s, row] as const));

  const results: { ticker: string; tvSymbol: string; nameEn: string; nameAr: string | null }[] = [];

  for (const row of enRows) {
    const ticker = text(row.d[0]);
    const tvSymbol = row.s;

    if (!ticker || !tvSymbol) continue;

    const arabicDescription = text(arBySymbol.get(tvSymbol)?.d[1]);
    const nameAr = arabicDescription && hasArabic(arabicDescription) ? arabicDescription : null;

    results.push({ ticker, tvSymbol, nameEn: text(row.d[1]) ?? ticker, nameAr });
  }

  console.log("\n=== TRADINGVIEW ARABIC NAMES ===");
  for (const r of results) {
    if (r.nameAr) {
      console.log(`  "${r.nameAr}": "${r.ticker}",`);
    } else {
      console.log(`  // NO AR: ${r.ticker} (${r.nameEn})`);
    }
  }

  // Also output as TypeScript map
  console.log("\n=== MAP ENTRIES ===");
  for (const r of results) {
    if (r.nameAr) {
      console.log(`  "${r.nameAr}": "${r.ticker}",`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});