import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { env } from "../config/env";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const PDF_MAGIC = Buffer.from("%PDF-");

/**
 * Absolute root for uploaded PDFs, extraction artifacts and logs.
 *
 * A relative `DOCUMENTS_DIR` is resolved against the process cwd. When it is
 * unset we use `<repo>/.data/egx`, computed from this module's location so the
 * API and the worker (which import this file) always agree, no matter which
 * directory each process was started from.
 */
export function documentsRoot(): string {
  const configured = env.DOCUMENTS_DIR?.trim();
  if (configured) {
    return isAbsolute(configured) ? configured : resolve(process.cwd(), configured);
  }
  return fileURLToPath(new URL("../../../../.data/egx", import.meta.url));
}

export function documentPath(sha256: string): string {
  return join(documentsRoot(), "documents", `${sha256}.pdf`);
}

export function incomingPath(): string {
  return join(documentsRoot(), "incoming");
}

export function incomingFilePath(filename: string): string {
  return join(incomingPath(), filename);
}

export function extractionPath(sha256: string): string {
  return join(documentsRoot(), "extractions", `${sha256}.json`);
}

export function documentLogPath(sha256: string): string {
  return join(documentsRoot(), "logs", `${sha256}.jsonl`);
}

export function sha256Of(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export type SavedDocument = {
  sha256: string;
  path: string;
  bytes: number;
};

/**
 * Validates and stores an uploaded PDF outside the web root.
 * Throws with a user-safe message when the file is not a PDF or too large.
 */
export async function savePdfUpload(file: File): Promise<SavedDocument> {
  if (file.size === 0) {
    throw new Error("empty_file");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("file_too_large");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  // Trust magic bytes, not the extension.
  if (bytes.length < PDF_MAGIC.length) {
    throw new Error("not_a_pdf");
  }
  for (let i = 0; i < PDF_MAGIC.length; i += 1) {
    if (bytes[i] !== PDF_MAGIC[i]) {
      throw new Error("not_a_pdf");
    }
  }

  const sha256 = sha256Of(bytes);
  const path = documentPath(sha256);
  await mkdir(join(documentsRoot(), "documents"), { recursive: true });

  // Same content uploaded twice: keep the first copy.
  const exists = await stat(path).then(() => true).catch(() => false);
  if (!exists) {
    await writeFile(path, bytes);
  }

  return { sha256, path, bytes: bytes.length };
}

export async function readDocumentFile(sha256: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(documentPath(sha256)));
}

export async function readDocumentLog(sha256: string): Promise<string> {
  return readFile(documentLogPath(sha256), "utf8").catch(() => "");
}
