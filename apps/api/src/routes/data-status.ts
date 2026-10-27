import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { DataStatusResponseSchema } from "@egx/contracts";
import { count, eq, sql } from "drizzle-orm";

import { db } from "../db/client";
import {
  dailyBars,
  fundamentals,
  ingestRuns,
  instruments,
  latestQuotes,
  newsInstrumentLinks,
  newsItems,
} from "../db/schema";
import { jobIsStale } from "../lib/market";

type RunRow = {
  job: string;
  status: string;
  provider: string | null;
  started_at: Date | string;
  finished_at: Date | string | null;
  items_ok: number;
  items_failed: number;
  error: string | null;
};

const JOB_ORDER = [
  "universe",
  "yahoo-symbols",
  "bars",
  "quotes",
  "fundamentals",
  "news",
];
const STATUSES = ["running", "success", "partial", "failed"] as const;

function toDate(value: Date | string | null): Date | null {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value : new Date(value);
}

const dataStatusRoute = createRoute({
  method: "get",
  path: "/api/status/data",
  tags: ["status"],
  summary: "Last ingest run per job and stored row counts",
  responses: {
    200: {
      description: "Data pipeline status",
      content: {
        "application/json": {
          schema: DataStatusResponseSchema,
        },
      },
    },
  },
});

export const dataStatusRoutes = new OpenAPIHono();

dataStatusRoutes.openapi(dataStatusRoute, async (c) => {
  const runs = (await db.execute(sql`
    select distinct on (job)
      job, status, provider, started_at, finished_at, items_ok, items_failed, error
    from ingest_runs
    order by job, started_at desc
  `)) as unknown as RunRow[];

  const [
    instrumentCount,
    stockCount,
    indexCount,
    quoteCount,
    barCount,
    barInstrumentCount,
    fundamentalCount,
    newsItemCount,
    newsLinkCount,
  ] = await Promise.all([
    db.select({ value: count() }).from(instruments),
    db
      .select({ value: count() })
      .from(instruments)
      .where(eq(instruments.kind, "stock")),
    db
      .select({ value: count() })
      .from(instruments)
      .where(eq(instruments.kind, "index")),
    db.select({ value: count() }).from(latestQuotes),
    db.select({ value: count() }).from(dailyBars),
    db
      .select({ value: sql<number>`count(distinct ${dailyBars.instrumentId})` })
      .from(dailyBars),
    db.select({ value: count() }).from(fundamentals),
    db.select({ value: count() }).from(newsItems),
    db.select({ value: count() }).from(newsInstrumentLinks),
  ]);

  const jobs = runs
    .map((run) => {
      const startedAt = toDate(run.started_at) ?? new Date(0);
      const finishedAt = toDate(run.finished_at);
      const status = STATUSES.includes(run.status as (typeof STATUSES)[number])
        ? (run.status as (typeof STATUSES)[number])
        : "failed";

      return {
        job: run.job,
        status,
        provider: run.provider,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt?.toISOString() ?? null,
        itemsOk: Number(run.items_ok),
        itemsFailed: Number(run.items_failed),
        error: run.error,
        stale: status === "running" ? false : jobIsStale(run.job, finishedAt),
      };
    })
    .sort(
      (a, b) =>
        (JOB_ORDER.indexOf(a.job) === -1 ? 99 : JOB_ORDER.indexOf(a.job)) -
        (JOB_ORDER.indexOf(b.job) === -1 ? 99 : JOB_ORDER.indexOf(b.job)),
    );

  const quoteJob = jobs.find((job) => job.job === "quotes");
  const universeJob = jobs.find((job) => job.job === "universe");
  const finished = jobs
    .map((job) => job.finishedAt)
    .filter((value): value is string => Boolean(value))
    .sort();

  return c.json(
    {
      data: {
        jobs,
        counts: {
          instruments: instrumentCount[0]?.value ?? 0,
          stocks: stockCount[0]?.value ?? 0,
          indices: indexCount[0]?.value ?? 0,
          quotes: quoteCount[0]?.value ?? 0,
          dailyBars: barCount[0]?.value ?? 0,
          barInstruments: Number(barInstrumentCount[0]?.value ?? 0),
          fundamentals: fundamentalCount[0]?.value ?? 0,
          newsItems: newsItemCount[0]?.value ?? 0,
          newsLinks: newsLinkCount[0]?.value ?? 0,
        },
      },
      meta: {
        asOf: finished.at(-1) ?? null,
        source: "worker",
        stale: quoteJob ? quoteJob.stale : true,
        universeAsOf: universeJob?.finishedAt ?? null,
      },
    },
    200,
  );
});
