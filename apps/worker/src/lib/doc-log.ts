import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import { documentLogPath } from "@egx/api/documents";

export type DocumentLogLevel = "step" | "info" | "warn" | "error";

export type DocumentLogEntry = {
  ts: string;
  level: DocumentLogLevel;
  message: string;
  [key: string]: unknown;
};

/**
 * Appends one JSON line to the document's progress log.
 *
 * The admin dashboard streams this file over SSE (`GET
 * /api/admin/documents/:id/events`), so every step of an extraction must be
 * recorded here. Logging never throws: a missing log line must not fail a job.
 */
export async function logDocument(
  sha256: string,
  level: DocumentLogLevel,
  message: string,
  data: Record<string, unknown> = {},
): Promise<void> {
  const entry: DocumentLogEntry = {
    ts: new Date().toISOString(),
    level,
    message,
    ...data,
  };
  const path = documentLogPath(sha256);

  try {
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, `${JSON.stringify(entry)}\n`, "utf8");
  } catch (error) {
    console.error(
      `[doc-log] could not write ${path}:`,
      error instanceof Error ? error.message : error,
    );
  }
}
