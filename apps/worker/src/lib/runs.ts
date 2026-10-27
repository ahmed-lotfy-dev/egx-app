import { eq } from "drizzle-orm";

import { db } from "@egx/api/db";
import { ingestRuns } from "@egx/api/schema";

export type RunResult = {
  itemsOk: number;
  itemsFailed?: number;
  metadata?: unknown;
  status?: "success" | "partial";
};

export async function withIngestRun(
  job: string,
  provider: string,
  run: () => Promise<RunResult>,
): Promise<RunResult> {
  const [created] = await db
    .insert(ingestRuns)
    .values({ job, provider, status: "running" })
    .returning({ id: ingestRuns.id });

  if (!created) {
    throw new Error(`Could not create the ${job} ingest run`);
  }

  try {
    const result = await run();
    const itemsFailed = result.itemsFailed ?? 0;

    await db
      .update(ingestRuns)
      .set({
        status:
          result.status ?? (itemsFailed > 0 ? "partial" : "success"),
        finishedAt: new Date(),
        itemsOk: result.itemsOk,
        itemsFailed,
        metadata: result.metadata ?? null,
      })
      .where(eq(ingestRuns.id, created.id));

    return result;
  } catch (error) {
    await db
      .update(ingestRuns)
      .set({
        status: "failed",
        finishedAt: new Date(),
        error: error instanceof Error ? error.message : String(error),
      })
      .where(eq(ingestRuns.id, created.id));

    throw error;
  }
}
