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

/**
 * Logs an extraction progress event. The SSE endpoint watches for
 * `type: "extraction_progress"` and converts it to a real-time progress
 * event for the dashboard.
 */
export async function logProgress(
  sha256: string,
  progress: number,
  status: "extracting" | "completed" | "failed",
  message?: string,
): Promise<void> {
  const entry = {
    ts: new Date().toISOString(),
    level: "info" as const,
    message: message || `استخراج: ${progress}%`,
    type: "extraction_progress",
    progress,
    status,
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

/**
 * Logs extraction completion or failure.
 */
export async function logExtractionComplete(
  sha256: string,
  success: boolean,
  message?: string,
): Promise<void> {
  const entry = {
    ts: new Date().toISOString(),
    level: success ? "info" : "error",
    message: message || (success ? "استخراج مكتمل" : "فشل الاستخراج"),
    type: success ? "extraction_complete" : "extraction_failed",
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
