import { db } from "@egx/api/db";
import { documentPages, sourceDocuments } from "@egx/api/schema";
import { and, eq, isNotNull, sql } from "drizzle-orm";
// import { NIM_EMBEDDING_MODEL } from "../lib/nim";

/**
 * Phase 5 — generate embeddings for document pages after publishing.
 *
 * This runs after a document is published to create vector embeddings
 * for RAG-based semantic search. Uses NVIDIA NIM embedding model.
 */

const BATCH_SIZE = 32; // NIM batch limit
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

type PageRow = {
  id: string;
  documentId: string;
  pageNo: number;
  text: string;
};

export type EmbedOptions = {
  /** Specific document id to embed (CLI / admin retry). */
  id?: string;
  /** How many pending documents to process. Defaults to 1. */
  limit?: number;
};

async function getPendingPages(options: EmbedOptions): Promise<Array<PageRow>> {
  const filters: any[] = [eq(documentPages.embeddingStatus, "pending")];

  if (options.id !== undefined) {
    filters.push(eq(documentPages.documentId, options.id));
  }

  const limit = options.limit ?? 1000;

  const rows = await db
    .select({
      id: documentPages.id,
      documentId: documentPages.documentId,
      pageNo: documentPages.pageNo,
      text: documentPages.text,
    })
    .from(documentPages)
    .where(and(...filters))
    .orderBy(documentPages.pageNo)
    .limit(limit);

  return rows;
}

async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    throw new Error("NVIDIA_API_KEY not configured");
  }

  const res = await fetch("https://integrate.api.nvidia.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.NVIDIA_NIM_EMBEDDING_MODEL || "nvidia/nv-embed-v2",
      input: texts,
      input_type: "passage",
      truncate: "END",
    }),
  });

  if (!res.ok) {
    const error = await res.text().catch(() => "unknown");
    throw new Error(`NIM embeddings failed (${res.status}): ${error}`);
  }

  const data = await res.json() as { data: Array<{ embedding: number[] }> };
  if (!data.data[0]) {
    throw new Error("No embedding returned from NIM");
  }
  return data.data.map((d) => d.embedding);
}

async function updateEmbeddings(
  pageIds: string[],
  embeddings: number[][],
): Promise<void> {
  // Use a transaction to update all embeddings atomically
  await db.transaction(async (tx) => {
    for (let i = 0; i < pageIds.length; i++) {
      const embedding = embeddings[i];
      if (!embedding) continue;
      // Convert to halfvec format: array of floats -> PostgreSQL halfvec literal
      const vecLiteral = "[" + embedding.map((v) => v.toFixed(8)).join(",") + "]";

      await tx.execute(sql`
        UPDATE document_pages
        SET embedding = ${vecLiteral}::halfvec(2048),
            embedding_status = 'completed',
            embedded_at = now(),
            embedding_error = null
        WHERE id = ${pageIds[i]}
      `);
    }
  });
}

async function markFailed(pageIds: string[], error: string): Promise<void> {
  await db.transaction(async (tx) => {
    for (const pageId of pageIds) {
      await tx
        .update(documentPages)
        .set({
          embeddingStatus: "failed",
          embeddingError: error.slice(0, 2000),
        })
        .where(eq(documentPages.id, pageId));
    }
  });
}

export async function embedDocuments(options: EmbedOptions): Promise<{
  processed: number;
  failed: number;
}> {
  const pages = await getPendingPages(options);

  if (pages.length === 0) {
    return { processed: 0, failed: 0 };
  }

  console.log(`[embed] Found ${pages.length} pages to embed`);

  let processed = 0;
  let failed = 0;

  // Process in batches
  for (let i = 0; i < pages.length; i += BATCH_SIZE) {
    const batch = pages.slice(i, i + BATCH_SIZE);
    const texts = batch.map((p) => p.text);
    const pageIds = batch.map((p) => p.id);

    let attempt = 0;
    let success = false;

    while (attempt < MAX_RETRIES && !success) {
      try {
        const embeddings = await generateEmbeddings(texts);
        await updateEmbeddings(pageIds, embeddings);
        processed += batch.length;
        success = true;
        console.log(`[embed] Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(pages.length / BATCH_SIZE)} completed (${batch.length} pages)`);
      } catch (error) {
        attempt++;
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[embed] Batch ${Math.floor(i / BATCH_SIZE) + 1} attempt ${attempt}/${MAX_RETRIES} failed: ${message}`);

        if (attempt >= MAX_RETRIES) {
          await markFailed(pageIds, message);
          failed += batch.length;
        } else {
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
        }
      }
    }
  }

  return { processed, failed };
}

async function getPendingPages(options: EmbedOptions): Promise<Array<PageRow>> {
  const filters: any[] = [eq(documentPages.embeddingStatus, "pending")];

  if (options.id !== undefined) {
    filters.push(eq(documentPages.documentId, options.id));
  }

  const limit = options.limit ?? 1000;

  const rows = await db
    .select({
      id: documentPages.id,
      documentId: documentPages.documentId,
      pageNo: documentPages.pageNo,
      text: documentPages.text,
    })
    .from(documentPages)
    .where(and(...filters))
    .orderBy(documentPages.pageNo)
    .limit(limit);

  return rows;
}

// CLI entry point
if (import.meta.main) {
  const args = process.argv.slice(2);
  const options: EmbedOptions = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--id") {
      options.id = args[++i];
    } else if (args[i] === "--limit") {
      options.limit = parseInt(args[++i], 10);
    }
  }

  console.log(`[embed] Starting with options:`, options);

  try {
    const result = await embedDocuments(options);
    console.log(`[embed] Done: ${result.processed} processed, ${result.failed} failed`);
    process.exit(result.failed > 0 ? 1 : 0);
  } catch (error) {
    console.error("[embed] Fatal error:", error);
    process.exit(1);
  }
}