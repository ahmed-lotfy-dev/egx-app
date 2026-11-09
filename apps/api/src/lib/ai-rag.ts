import { and, eq, isNotNull, sql } from "drizzle-orm";

import { db } from "../db/client";
import { documentPages, sourceDocuments } from "../db/schema";
import { cached } from "./cache";

export interface RagResult {
  documentId: string;
  documentFilename: string;
  pageNo: number;
  text: string;
  similarity: number;
}

/**
 * RAG retrieval using pgvector similarity search on document_pages.
 * Returns the most relevant document pages for a given query.
 */
export async function searchDocumentPages(
  queryEmbedding: number[],
  options: {
    limit?: number;
    similarityThreshold?: number;
    documentId?: string;
  } = {}
): Promise<RagResult[]> {
  const { limit = 5, similarityThreshold = 0.7, documentId } = options;

  const filters: any[] = [
    eq(documentPages.embeddingStatus, "completed"),
    isNotNull(documentPages.embedding),
  ];

  if (documentId) {
    filters.push(eq(documentPages.documentId, documentId));
  }

  // Convert embedding array to pgvector format
  const embeddingLiteral = "[" + queryEmbedding.join(",") + "]";

  const results = await db
    .select({
      documentId: documentPages.documentId,
      pageNo: documentPages.pageNo,
      text: documentPages.text,
      similarity: sql<number>`1 - (${documentPages.embedding} <=> ${embeddingLiteral}::halfvec(2048))`,
      filename: sourceDocuments.filename,
    })
    .from(documentPages)
    .innerJoin(sourceDocuments, eq(sourceDocuments.id, documentPages.documentId))
    .where(and(...filters))
    .orderBy(sql`${documentPages.embedding} <=> ${embeddingLiteral}::halfvec(2048)`)
    .limit(limit);

  return results
    .filter((r) => r.similarity >= similarityThreshold)
    .map((r) => ({
      documentId: r.documentId,
      documentFilename: r.filename,
      pageNo: r.pageNo,
      text: r.text,
      similarity: r.similarity,
    }));
}

/**
 * Formats RAG results for injection into the AI system prompt.
 */
export function formatRagContext(results: RagResult[]): string {
  if (results.length === 0) return "No relevant document pages found.";

  const lines = ["RAG CONTEXT (from uploaded EGX disclosure documents):"];
  
  for (const result of results) {
    lines.push(
      "--- DOCUMENT: " + result.documentFilename + " (Page " + result.pageNo + ") [similarity: " + result.similarity.toFixed(3) + "] ---",
      result.text.slice(0, 1000),
      "---"
    );
  }

  return lines.join("\n");
}

/**
 * Generates embedding for a query using NVIDIA NIM embedding model.
 */
export async function generateQueryEmbedding(query: string): Promise<number[]> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    throw new Error("NVIDIA_API_KEY not configured");
  }

  const res = await fetch("https://integrate.api.nvidia.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.NVIDIA_NIM_EMBEDDING_MODEL ?? "nvidia/nemotron-3-embed-1b",
      input: query,
      input_type: "query",
      truncate: "END",
    }),
  });

  if (!res.ok) {
    const error = await res.text().catch(() => "unknown");
    throw new Error("NIM embedding failed (" + res.status + "): " + error);
  }

  const data = await res.json() as { data: Array<{ embedding: number[] }> };
  if (!data.data[0]) {
    throw new Error("No embedding returned from NIM");
  }
  return data.data[0].embedding;
}

/**
 * High-level RAG search for AI chat: generates embedding and searches.
 */
export async function searchRagForChat(
  query: string,
  options: {
    limit?: number;
    similarityThreshold?: number;
    documentId?: string;
  } = {}
): Promise<{ context: string; results: import("./ai-rag").RagResult[] }> {
  const embedding = await generateQueryEmbedding(query);
  const results = await searchDocumentPages(embedding, options);
  const context = formatRagContext(results);
  return { context, results };
}