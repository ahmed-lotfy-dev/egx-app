import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { env } from "../config/env";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const PDF_MAGIC = Buffer.from("%PDF-");

export function documentsRoot(): string {
  return env.DOCUMENTS_DIR;
}

export function documentPath(sha256: string): string {
  return join(documentsRoot(), "documents", `${sha256}.pdf`);
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
