import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";

import { db } from "@egx/api/db";
import { documentPath, extractionPath } from "@egx/api/documents";
import { sourceDocuments } from "@egx/api/schema";
import { and, asc, eq, type SQL } from "drizzle-orm";

import { logDocument, logProgress, logExtractionComplete } from "../lib/doc-log";

/**
 * Phase 3 — turn an uploaded PDF into a JSON artifact.
 *
 * The extractor is a small Python/pdfplumber script: the report is a ruled
 * table, so cell extraction is deterministic. No model, no guessing. Vision
 * models were tried first and failed (timeouts / reasoning-only output), and a
 * second AI pass is not needed — the importer validates the JSON in code.
 *
 * This job never touches `stock_snapshots`; staging happens in
 * `stage-document.ts` (Phase 4).
 */

const EXTRACTOR_SCRIPT = fileURLToPath(
  new URL("../../extract/extract_report.py", import.meta.url),
);
const EXTRACTOR_TIMEOUT_MS = 15 * 60_000;

export type ExtractedRow = {
  rank: number;
  page: number;
  rowIndex: number;
  rawName: string;
  nameAr: string;
  segment: "main" | "sme";
  currency: string | null;
  close: number | null;
  changePct: number | null;
  tradingValue: number | null;
  tradingVolume: number | null;
  volumePct: number | null;
  listedShares: number | null;
  marketCap: number | null;
  paidCapital: number | null;
  peTrailing: number | null;
  dividendYield: number | null;
  netProfit: number | null;
  netProfitPeriodEnd: string | null;
  lastCoupon: number | null;
  exDate: string | null;
};

export type ExtractionArtifact = {
  engine: string;
  engineVersion: string;
  totalPages: number;
  pages: { page: number; segment: string; rows: number }[];
  rows: ExtractedRow[];
  documentSha256?: string;
};

export type ExtractOptions = {
  /** Specific document id (CLI / admin retry). */
  id?: string;
  /** Specific document hash (CLI). */
  sha256?: string;
  /** How many pending documents to process. Defaults to 1. */
  limit?: number;
};

type DocumentRow = typeof sourceDocuments.$inferSelect;

type RunResult = { code: number; stderr: string };

function runExtractor(pdfPath: string, outPath: string): Promise<RunResult> {
  return new Promise((resolve) => {
    const python = process.env.EXTRACTOR_PYTHON?.trim() || "python3";
    const child = spawn(python, [EXTRACTOR_SCRIPT, pdfPath, "--out", outPath], {
      stdio: ["ignore", "ignore", "pipe"],
    });

    let stderr = "";
    const timer = setTimeout(() => {
      stderr += "\nextractor timed out after 5 minutes";
      child.kill("SIGKILL");
    }, EXTRACTOR_TIMEOUT_MS);

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      // Keep memory bounded if the script floods stderr.
      if (stderr.length > 20_000) stderr = stderr.slice(-20_000);
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ code: -1, stderr: `${error.message}\n${stderr}` });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stderr });
    });
  });
}

/**
 * Claims one pending document atomically.
 *
 * `FOR UPDATE SKIP LOCKED` keeps two worker instances (or a manual CLI run
 * during a scheduler tick) from extracting the same file twice.
 */
async function claimNext(options: ExtractOptions): Promise<DocumentRow | null> {
  const filters: SQL[] = [];

  if (options.id !== undefined) filters.push(eq(sourceDocuments.id, options.id));
  if (options.sha256) filters.push(eq(sourceDocuments.sha256, options.sha256));
  // An explicit id/hash may be retried after a failure.
  if (options.id === undefined && !options.sha256) {
    filters.push(eq(sourceDocuments.status, "uploaded"));
  }

  const claimed = await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(sourceDocuments)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(asc(sourceDocuments.id))
      .limit(1)
      .for("update", { skipLocked: true });

    if (!row) return [];

    await tx
      .update(sourceDocuments)
      .set({ status: "extracting", error: null })
      .where(eq(sourceDocuments.id, row.id));

    return [{ ...row, status: "extracting" }];
  });

  return claimed[0] ?? null;
}

async function extractOne(document: DocumentRow): Promise<"extracted" | "failed"> {
  const sha = document.sha256;
  // `storage_path` in the DB is a path relative to the repo root
  // (e.g. `.data/egx/documents/<sha>.pdf`). Resolve it via the shared
  // documents root so it works regardless of the worker's cwd.
  const pdfPath = documentPath(sha);
  const outPath = extractionPath(sha);
  await mkdir(dirname(outPath), { recursive: true });

  await logDocument(sha, "step", "بدء استخراج الجداول من ملف PDF", {
    documentId: document.id,
    file: document.filename,
  });
  await logProgress(sha, 10, "extracting", "تهيئة الملف");

  const exists = await stat(pdfPath).then(() => true).catch(() => false);
  if (!exists) {
    await fail(sha, document.id, `الملف غير موجود على القرص: ${pdfPath}`);
    await logExtractionComplete(sha, false, "الملف غير موجود");
    return "failed";
  }

  await logDocument(sha, "info", "تشغيل مستخرج الجداول (pdfplumber)", {
    engine: "pdfplumber",
    python: process.env.EXTRACTOR_PYTHON?.trim() || "python3",
  });
  await logProgress(sha, 30, "extracting", "تشغيل مستخرج pdfplumber");

  const result = await runExtractor(pdfPath, outPath);

  if (result.code !== 0) {
    const detail = result.stderr.trim().split("\n").slice(-4).join("\n");
    await fail(
      sha,
      document.id,
      result.code === -1
        ? `تعذر تشغيل مستخرج PDF: ${detail}`
        : `فشل استخراج الجداول (رمز ${result.code}): ${detail}`,
    );
    await logExtractionComplete(sha, false, "فشل المستخرج");
    return "failed";
  }

  await logProgress(sha, 70, "extracting", "معالجة البيانات المستخرجة");

  const raw = await readFile(outPath, "utf8");
  const artifact = JSON.parse(raw) as ExtractionArtifact;

  if (!Array.isArray(artifact.rows) || artifact.rows.length === 0) {
    await fail(sha, document.id, "لم يتم العثور على أي صفوف أسهم في الملف");
    await logExtractionComplete(sha, false, "لا توجد صفوف");
    return "failed";
  }

  // Keep the source hash inside the artifact so a file can be traced back even
  // if it is copied out of the documents directory.
  artifact.documentSha256 = sha;
  const payload = JSON.stringify(artifact, null, 1);
  await writeFile(outPath, payload, "utf8");

  const extractionHash = createHash("sha256").update(payload).digest("hex");
  const model = `${artifact.engine}@${artifact.engineVersion}`;

  await logProgress(sha, 90, "extracting", "حفظ البيانات المستخرجة");

  await db
    .update(sourceDocuments)
    .set({
      status: "extracted",
      error: null,
      pages: artifact.totalPages,
      extractionPath: outPath,
      extractionHash,
      extractionModel: model,
    })
    .where(eq(sourceDocuments.id, document.id));

  await logProgress(sha, 100, "completed", "اكتمل الاستخراج بنجاح");
  await logExtractionComplete(sha, true, "تم بنجاح");

  await logDocument(sha, "info", "تم استخراج الجداول", {
    rows: artifact.rows.length,
    tablePages: artifact.pages.length,
    totalPages: artifact.totalPages,
    pages: artifact.pages,
    extractionHash,
    model,
  });
  await logDocument(sha, "step", "جاهز للمراجعة والتحقق", {
    documentId: document.id,
    rows: artifact.rows.length,
  });

  return "extracted";
}

async function fail(sha: string, id: string, message: string): Promise<void> {
  await db
    .update(sourceDocuments)
    .set({ status: "failed", error: message.slice(0, 2000) })
    .where(eq(sourceDocuments.id, id));
  await logDocument(sha, "error", message, { documentId: id });
  await logExtractionComplete(sha, false, message);
}

/**
 * Processes up to `limit` documents. Returns a small summary for the CLI and
 * the scheduler.
 */
export async function extractDocuments(options: ExtractOptions = {}) {
  const limit = Math.max(1, options.limit ?? 1);
  let processed = 0;
  let extracted = 0;
  let failed = 0;

  for (let index = 0; index < limit; index += 1) {
    const document = await claimNext(options);
    if (!document) break;

    processed += 1;

    try {
      const status = await extractOne(document);
      if (status === "extracted") extracted += 1;
      else failed += 1;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      await fail(document.sha256, document.id, `خطأ غير متوقع: ${message}`);
    }
  }

  return { processed, extracted, failed };
}
