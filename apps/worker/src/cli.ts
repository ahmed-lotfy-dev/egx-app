import { closeDb } from "@egx/api/db";

import { syncBars, type BarsOptions } from "./jobs/bars";
import { syncFundamentals } from "./jobs/fundamentals";
import { syncMacro } from "./jobs/macro";
import { processAnalysisQueue, syncNews, syncNewsWithAnalysis } from "./jobs/news";
import { syncQuotes } from "./jobs/quotes";
import { syncUniverse } from "./jobs/universe";
import { resolveYahooSymbols } from "./jobs/yahoo-symbols";
import { startScheduler } from "./scheduler";

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
  const providerArg = option("provider");

  return {
    tickers: option("tickers")
      ?.split(",")
      .map((ticker) => ticker.trim().toUpperCase())
      .filter(Boolean),
    limit: positiveNumber("limit"),
    days: positiveNumber("days"),
    missing: args.includes("--missing"),
    provider:
      providerArg === "tradingview" || providerArg === "yahoo"
        ? providerArg
        : undefined,
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
    case "macro":
      print("macro", await syncMacro());
      break;
    case "bars":
      print("bars", await syncBars(readBarsOptions()));
      break;
    case "symbols":
      print("symbols", await resolveYahooSymbols());
      break;
    case "fundamentals":
      print("fundamentals", await syncFundamentals());
      break;
    case "news":
      print("news", await syncNews());
      break;
    case "news:analyze":
      print("news:analyze", await processAnalysisQueue(50));
      break;
    case "news:full":
      print("news:full", await syncNewsWithAnalysis());
      break;
    case "all": {
      const barsOptions = readBarsOptions();
      print("universe", await syncUniverse());
      print("symbols", await resolveYahooSymbols());
      print("bars", await syncBars(barsOptions));
      print("quotes", await syncQuotes());
      print("fundamentals", await syncFundamentals());
      print("news", await syncNews());
      break;
    }
    case "schedule":
      startScheduler();
      // Keep the event loop alive; the scheduler owns shutdown.
      await new Promise(() => {});
      break;
    default:
      console.error(
        [
          "Usage: bun src/cli.ts <universe|quotes|macro|bars|symbols|fundamentals|news|news:analyze|news:full|all|schedule> [options]",
          "",
          "Bars options:",
          "  --tickers COMI,HRHO   limit to specific tickers",
          "  --limit 10            limit the number of instruments",
          "  --days 365            history window in days",
          "  --missing             only instruments with no stored bars",
          "  --provider tradingview|yahoo",
          "schedule:               run the ingest scheduler loop (quotes every 3 min",
          "                        in market hours, bars/fundamentals/news daily)",
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
