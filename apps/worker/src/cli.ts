import { closeDb } from "@egx/api/db";

import { syncBars, type BarsOptions } from "./jobs/bars";
import { syncQuotes } from "./jobs/quotes";
import { syncUniverse } from "./jobs/universe";
import { resolveYahooSymbols } from "./jobs/yahoo-symbols";

const args = process.argv.slice(2);
const command = args[0] ?? "help";

function option(name: string): string | undefined {
  const index = args.indexOf(`--${name}`);

  return index === -1 ? undefined : args[index + 1];
}

function positiveNumber(name: string): number | undefined {
  const raw = option(name);

  if (!raw) {
    return undefined;
  }

  const parsed = Number(raw);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`--${name} must be a positive number`);
  }

  return parsed;
}

function readBarsOptions(): BarsOptions {
  return {
    tickers: option("tickers")
      ?.split(",")
      .map((ticker) => ticker.trim().toUpperCase())
      .filter(Boolean),
    limit: positiveNumber("limit"),
    days: positiveNumber("days"),
    missing: args.includes("--missing"),
  };
}

function print(job: string, result: object): void {
  console.log(JSON.stringify({ job, ...result }, null, 2));
}

async function main(): Promise<void> {
  switch (command) {
    case "universe":
      print("universe", await syncUniverse());
      break;
    case "quotes":
      print("quotes", await syncQuotes());
      break;
    case "bars":
      print("bars", await syncBars(readBarsOptions()));
      break;
    case "symbols":
      print("symbols", await resolveYahooSymbols());
      break;
    case "all": {
      const barsOptions = readBarsOptions();
      print("universe", await syncUniverse());
      print("symbols", await resolveYahooSymbols());
      print("bars", await syncBars(barsOptions));
      print("quotes", await syncQuotes());
      break;
    }
    default:
      console.error(
        [
          "Usage: bun src/cli.ts <universe|quotes|bars|symbols|all> [options]",
          "",
          "Bars options:",
          "  --tickers COMI,HRHO   limit to specific tickers",
          "  --limit 10            limit the number of instruments",
          "  --days 365            history window in days",
          "  --missing             only instruments with no stored bars",
        ].join("\n"),
      );
      process.exitCode = 1;
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDb();
}
