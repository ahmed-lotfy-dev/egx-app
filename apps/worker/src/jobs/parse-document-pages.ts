import { and, eq, isNotNull } from "drizzle-orm";

import { db } from "@egx/api/db";
import { documentPages, sourceDocuments } from "@egx/api/schema";
import { extractionPath } from "@egx/api/documents";
import { readFile } from "node:fs/promises";

/**
 * Phase 4b — parse extraction JSON artifact and populate document_pages.
 *
 * Runs after extraction (Phase 3) and before embedding (Phase 5).
 * Reads the extraction JSON artifact and creates one row per page in
 * document_pages table with the page text, ready for embedding.
 */

type ExtractionArtifact = {
  engine: string;
  engineVersion: string;
  totalPages: number;
  pages: { page: number; segment: string; rows: number }[];
  rows: Array<{
    page: number;
    rawName: string;
    nameAr: string;
    segment: string;
    [key: string]: unknown;
  }>;
  documentSha256?: string;
};

export type ParsePagesOptions = {
  /** Specific document id to parse (required for programmatic use). */
  id?: string;
  /** Specific document hash (CLI). */
  sha256?: string;
  /** How many documents to process. Defaults to 1. */
  limit?: number;
};

async function getDocumentsToParse(options: ParsePagesOptions) {
  const filters: any[] = [
    eq(sourceDocuments.status, "extracted"),
    isNotNull(sourceDocuments.extractionPath),
  ];

  if (options.id !== undefined) {
    filters.push(eq(sourceDocuments.id, options.id));
  }
  if (options.sha256) {
    filters.push(eq(sourceDocuments.sha256, options.sha256));
  }

  const limit = options.limit ?? 1;

  const rows = await db
    .select({
      id: sourceDocuments.id,
      sha256: sourceDocuments.sha256,
      filename: sourceDocuments.filename,
      extractionPath: sourceDocuments.extractionPath,
    })
    .from(sourceDocuments)
    .where(and(...filters))
    .orderBy(sourceDocuments.id)
    .limit(limit);

  return rows;
}

function buildPageText(artifact: ExtractionArtifact, pageNo: number): string {
  const pageRows = artifact.rows.filter((r) => r.page === pageNo);
  if (pageRows.length === 0) return "";

  const pageInfo = artifact.pages.find((p) => p.page === pageNo);
  const segment = pageInfo?.segment ?? "unknown";

  const lines = [
    `PAGE ${pageNo} (${segment.toUpperCase()})`,
    `Rows: ${pageRows.length}`,
    "",
  ];

  for (const row of pageRows) {
    const parts: string[] = [];
    if (row.nameAr) parts.push(`اسم: ${row.nameAr}`);
    if (row.rawName && row.rawName !== row.nameAr) parts.push(`أصلي: ${row.rawName}`);
    if (row.close !== null) parts.push(`إغلاق: ${row.close}`);
    if (row.changePct !== null) parts.push(`تغير%: ${row.changePct}`);
    if (row.listedShares !== null) parts.push(`أسهم: ${row.listedShares}`);
    if (row.marketCap !== null) parts.push(`قيمة سوقية: ${row.marketCap}`);
    if (row.paidCapital !== null) parts.push(`رأس مال: ${row.paidCapital}`);
    if (row.peTrailing !== null) parts.push(`مكرر: ${row.peTrailing}`);
    if (row.dividendYield !== null) parts.push(`عائد: ${row.dividendYield}`);
    if (row.netProfit !== null) parts.push(`صافي ربح: ${row.netProfit}`);
    if (row.netProfitPeriodEnd) parts.push(`نهاية فترة ربح: ${row.netProfitPeriodEnd}`);
    if (row.lastCoupon !== null) parts.push(`كوبون: ${row.lastCoupon}`);
    if (row.exDate) parts.push(`تاريخ استحقاق: ${row.exDate}`);
    if (row.currency) parts.push(`عملة: ${row.currency}`);

    lines.push(parts.join(" | "));
  }

  return lines.join("\n");
}

export async function parseDocumentPages(options: ParsePagesOptions): Promise<{
  processed: number;
  pagesCreated: number;
  failed: number;
}> {
  const documents = await getDocumentsToParse(options);

  if (documents.length === 0) {
    return { processed: 0, pagesCreated: 0, failed: 0 };
  }

  console.log(`[parse-pages] Found ${documents.length} document(s) to parse`);

  let processed = 0;
  let pagesCreated = 0;
  let failed = 0;

  for (const doc of documents) {
    if (!doc.extractionPath) {
      console.warn(`[parse-pages] Document ${doc.id} has no extraction path`);
      failed++;
      continue;
    }

    try {
      // Read and parse the extraction artifact
      const raw = await readFile(doc.extractionPath, "utf8");
      const artifact = JSON.parse(raw) as ExtractionArtifact;

      if (!artifact.pages || artifact.pages.length === 0) {
        console.warn(`[parse-pages] Document ${doc.id} has no pages in artifact`);
        failed++;
        continue;
      }

      // Clear any existing pages for this document (idempotent / re-parse safe)
      await db.delete(documentPages).where(eq(documentPages.documentId, doc.id));

      // Create page rows
      for (const page of artifact.pages) {
        const pageText = buildPageText(artifact, page.page);

        if (!pageText.trim()) continue;

        await db.insert(documentPages).values({
          documentId: doc.id,
          pageNo: page.page,
          text: pageText,
          embeddingStatus: "pending",
        });
        pagesCreated++;
      }

      processed++;
      console.log(`[parse-pages] Document ${doc.id} (${doc.filename}): ${artifact.pages.length} pages parsed`);

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[parse-pages] Failed for document ${doc.id}: ${message}`);
      failed++;
    }
  }

  return { processed, pagesCreated, failed };
}

// CLI entry point
if (import.meta.main) {
  const args = process.argv.slice(2);
  const options: ParsePagesOptions = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--id") {
      options.id = args[++i];
    } else if (args[i] === "--sha") {
      options.sha256 = args[++i];
    } else if (args[i] === "--limit") {
      const limitArg = args[++i];
      options.limit = limitArg ? parseInt(limitArg, 10) : undefined;
    }
  }

  // Validate required id for CLI usage
  if (!options.id && !options.sha256) {
    console.error("[parse-pages] Error: --id or --sha is required");
    process.exit(1);
  }

  // After validation, id is guaranteed to be defined for CLI usage
  const cliOptions = options as Required<ParsePagesOptions>;

  console.log(`[parse-pages] Starting with options:`, options);

  try {
    const result = await parseDocumentPages(cliOptions);
    console.log(`[parse-pages] Done: ${result.processed} docs, ${result.pagesCreated} pages, ${result.failed} failed`);
    process.exit(result.failed > 0 ? 1 : 0);
  } catch (error) {
    console.error("[parse-pages] Fatal error:", error);
    process.exit(1);
  }
}