import { Hono, type Context } from "hono";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "../db/client";
import { instruments, sourceDocuments, stockSnapshots } from "../db/schema";
import { getAdmin } from "../lib/admin";
import { readDocumentFile, readDocumentLog, savePdfUpload } from "../lib/documents";
import { logger } from "../lib/logger";

export const adminDocumentRoutes = new Hono();

const forbidden = (c: Context) =>
  c.json({ error: { code: "forbidden", message: "Admin access required" } }, 403);

const badRequest = (message: string) =>
  ({ error: { code: "invalid_request", message } }) as const;

const DateString = z.iso.date();

/**
 * Re-extract a document (reset status and re-run extraction).
 */
adminDocumentRoutes.post("/api/admin/documents/:id/extract", async (c) => {
  const admin = await getAdmin(c);
  if (!admin) return forbidden(c);

  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json(badRequest("Invalid document id"), 400);
  }

  const [document] = await db
    .select()
    .from(sourceDocuments)
    .where(eq(sourceDocuments.id, id))
    .limit(1);

  if (!document) {
    return c.json({ error: { code: "not_found", message: "Document not found" } }, 404);
  }

  // Reset status to uploaded so the extractor picks it up again
  await db
    .update(sourceDocuments)
    .set({
      status: "uploaded",
      error: null,
      extractionPath: null,
      extractionHash: null,
      extractionModel: null,
      extractionVersion: 1,
      pages: 0,
    })
    .where(eq(sourceDocuments.id, id));

  logger.info({ documentId: id }, "admin document re-extract triggered");

  return c.json({ data: { id, status: "uploaded" } }, 200);
});

/**
 * Delete a document (and its staged snapshots).
 */
adminDocumentRoutes.delete("/api/admin/documents/:id", async (c) => {
  const admin = await getAdmin(c);
  if (!admin) return forbidden(c);

  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json(badRequest("Invalid document id"), 400);
  }

  const [document] = await db
    .select()
    .from(sourceDocuments)
    .where(eq(sourceDocuments.id, id))
    .limit(1);

  if (!document) {
    return c.json({ error: { code: "not_found", message: "Document not found" } }, 404);
  }

  // Delete staged snapshots first (FK cascade handles this)
  await db.delete(stockSnapshots).where(eq(stockSnapshots.documentId, id));
  // Delete document pages
  await db.delete(sourceDocuments).where(eq(sourceDocuments.id, id));

  logger.info({ documentId: id, filename: document.filename }, "admin document deleted");

  return c.json({ data: { id, deleted: true } }, 200);
});

/**
 * Publish a validated document's staged snapshots.
 *
 * Only rows matched to an instrument are published. Any live row for the same
 * (instrument, period_end) from an older document is stamped `superseded_at`
 * so exactly one live row remains per stock+period. Unmatched staged rows are
 * left for review and counted in the response.
 */
adminDocumentRoutes.post("/api/admin/documents/:id/publish", async (c) => {
  const admin = await getAdmin(c);
  if (!admin) return forbidden(c);

  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json(badRequest("Invalid document id"), 400);
  }

  const [document] = await db
    .select()
    .from(sourceDocuments)
    .where(eq(sourceDocuments.id, id))
    .limit(1);

  if (!document) {
    return c.json({ error: { code: "not_found", message: "Document not found" } }, 404);
  }

  if (document.status !== "validated") {
    return c.json(
      badRequest(`Document is not ready to publish (status: ${document.status})`),
      409,
    );
  }

  const [counts] = await db
    .select({
      staged: sql<number>`count(*)::int`,
      matched: sql<number>`count(${stockSnapshots.instrumentId})::int`,
      withIssues: sql<number>`count(${stockSnapshots.reviewNote})::int`,
    })
    .from(stockSnapshots)
    .where(and(eq(stockSnapshots.documentId, id), eq(stockSnapshots.status, "staged")));

  if (!counts || counts.matched === 0) {
    return c.json(
      badRequest("No matched rows to publish — review matching first"),
      409,
    );
  }

  // Supersede live rows for the same (instrument, period_end) coming from
  // other documents, then flip this document's matched rows to published.
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      UPDATE stock_snapshots
      SET superseded_at = now()
      WHERE superseded_at IS NULL
        AND document_id <> ${id}
        AND (instrument_id, period_end) IN (
          SELECT instrument_id, period_end
          FROM stock_snapshots
          WHERE document_id = ${id}
            AND instrument_id IS NOT NULL
            AND status = 'staged'
        )
    `);

    await tx.execute(sql`
      UPDATE stock_snapshots
      SET status = 'published'
      WHERE document_id = ${id}
        AND status = 'staged'
        AND instrument_id IS NOT NULL
    `);

    await tx
      .update(sourceDocuments)
      .set({ status: "published", publishedAt: new Date() })
      .where(eq(sourceDocuments.id, id));
  });

  logger.info(
    {
      documentId: id,
      published: counts.matched,
      skippedUnmatched: counts.staged - counts.matched,
      admin: admin.email,
    },
    "admin document published",
  );

  return c.json(
    {
      data: {
        id,
        status: "published",
        published: counts.matched,
        skippedUnmatched: counts.staged - counts.matched,
        withIssues: counts.withIssues,
      },
    },
    200,
  );
});

adminDocumentRoutes.post("/api/admin/documents", async (c) => {
  const admin = await getAdmin(c);
  if (!admin) return forbidden(c);

  const body = await c.req.formData().catch(() => null);
  if (!body) return c.json(badRequest("Expected multipart form data"), 400);

  const file = body.get("file");
  if (!(file instanceof File)) {
    return c.json(badRequest("Missing PDF file"), 400);
  }

  const periodStart = DateString.safeParse(body.get("periodStart"));
  const periodEnd = DateString.safeParse(body.get("periodEnd"));
  if (!periodStart.success || !periodEnd.success) {
    return c.json(badRequest("periodStart and periodEnd must be YYYY-MM-DD"), 400);
  }
  if (periodStart.data > periodEnd.data) {
    return c.json(badRequest("periodStart must be before periodEnd"), 400);
  }

  let saved;
  try {
    saved = await savePdfUpload(file);
  } catch (error) {
    const code = error instanceof Error ? error.message : "upload_failed";
    const message =
      code === "file_too_large"
        ? "File is larger than 25 MB"
        : code === "not_a_pdf"
          ? "File is not a valid PDF"
          : code === "empty_file"
            ? "File is empty"
            : "Could not store the file";
    return c.json({ error: { code, message } }, 400);
  }

  const existing = await db
    .select({ id: sourceDocuments.id, filename: sourceDocuments.filename })
    .from(sourceDocuments)
    .where(eq(sourceDocuments.sha256, saved.sha256))
    .limit(1);

  if (existing[0]) {
    return c.json(
      {
        error: {
          code: "duplicate_document",
          message: "This file was already uploaded",
        },
        documentId: existing[0].id,
      },
      409,
    );
  }

  const [created] = await db
    .insert(sourceDocuments)
    .values({
      sha256: saved.sha256,
      filename: file.name,
      periodStart: periodStart.data,
      periodEnd: periodEnd.data,
      storagePath: saved.path,
      uploadedBy: admin.email,
      status: "uploaded",
    })
    .returning();

  if (!created) {
    return c.json({ error: { code: "insert_failed", message: "Could not save document" } }, 500);
  }

  logger.info(
    { documentId: created.id, sha256: saved.sha256, bytes: saved.bytes },
    "admin document uploaded",
  );

  return c.json({ data: created }, 201);
});

adminDocumentRoutes.get("/api/admin/documents", async (c) => {
  const admin = await getAdmin(c);
  if (!admin) return forbidden(c);

  const rows = await db
    .select()
    .from(sourceDocuments)
    .orderBy(desc(sourceDocuments.uploadedAt))
    .limit(100);

  return c.json({ data: rows });
});

adminDocumentRoutes.get("/api/admin/documents/:id", async (c) => {
  const admin = await getAdmin(c);
  if (!admin) return forbidden(c);

  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json(badRequest("Invalid document id"), 400);
  }

  const [document] = await db
    .select()
    .from(sourceDocuments)
    .where(eq(sourceDocuments.id, id))
    .limit(1);

  if (!document) {
    return c.json({ error: { code: "not_found", message: "Document not found" } }, 404);
  }

  // Flat rows (snapshot fields + instrument identity) so the admin UI can read
  // instrumentId/reviewNote directly. LEFT JOIN keeps unmatched rows visible.
  const rows = await db
    .select({
      id: stockSnapshots.id,
      instrumentId: stockSnapshots.instrumentId,
      periodEnd: stockSnapshots.periodEnd,
      close: stockSnapshots.close,
      listedShares: stockSnapshots.listedShares,
      marketCap: stockSnapshots.marketCap,
      paidCapital: stockSnapshots.paidCapital,
      peTrailing: stockSnapshots.peTrailing,
      dividendYield: stockSnapshots.dividendYield,
      netProfit: stockSnapshots.netProfit,
      netProfitPeriodEnd: stockSnapshots.netProfitPeriodEnd,
      lastCoupon: stockSnapshots.lastCoupon,
      exDate: stockSnapshots.exDate,
      documentId: stockSnapshots.documentId,
      page: stockSnapshots.page,
      rowIndex: stockSnapshots.rowIndex,
      status: stockSnapshots.status,
      reviewNote: stockSnapshots.reviewNote,
      ticker: instruments.ticker,
      nameAr: instruments.nameAr,
      nameEn: instruments.nameEn,
    })
    .from(stockSnapshots)
    .leftJoin(instruments, eq(instruments.id, stockSnapshots.instrumentId))
    .where(eq(stockSnapshots.documentId, id))
    .orderBy(stockSnapshots.page, stockSnapshots.rowIndex);

  return c.json({ data: { document, rows } });
});

adminDocumentRoutes.get("/api/admin/documents/:id/file", async (c) => {
  const admin = await getAdmin(c);
  if (!admin) return forbidden(c);

  const id = Number(c.req.param("id"));
  const [document] = await db
    .select({
      sha256: sourceDocuments.sha256,
      filename: sourceDocuments.filename,
    })
    .from(sourceDocuments)
    .where(eq(sourceDocuments.id, id))
    .limit(1);

  if (!document) {
    return c.json({ error: { code: "not_found", message: "Document not found" } }, 404);
  }

  const bytes = await readDocumentFile(document.sha256).catch(() => null);
  if (!bytes) {
    return c.json({ error: { code: "missing_file", message: "File not on disk" } }, 410);
  }

  const safeName = document.filename.replace(/["\r\n]/g, "");
  // bytes is Uint8Array; create Blob directly from it
  const blob = new Blob([bytes], { type: "application/pdf" });
  return c.body(blob, 200, {
    "Content-Type": "application/pdf",
    "Content-Disposition": `inline; filename="${safeName}"`,
    "Content-Length": String(bytes.length),
    "Cache-Control": "private, max-age=0, must-revalidate",
  });
});

/**
 * Server-sent events with the document's extraction log. The stream ends when
 * the document reaches a terminal status (published/failed) or the client
 * disconnects.
 */
adminDocumentRoutes.get("/api/admin/documents/:id/events", async (c) => {
  const admin = await getAdmin(c);
  if (!admin) return forbidden(c);

  const id = Number(c.req.param("id"));
  const [document] = await db
    .select({
      sha256: sourceDocuments.sha256,
      status: sourceDocuments.status,
    })
    .from(sourceDocuments)
    .where(eq(sourceDocuments.id, id))
    .limit(1);

  if (!document) {
    return c.json({ error: { code: "not_found", message: "Document not found" } }, 404);
  }

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      let sent = 0;
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      const tick = async () => {
        if (closed) return;

        const raw = await readDocumentLog(document.sha256);
        const lines = raw.split("\n").filter(Boolean);
        for (const line of lines.slice(sent)) {
          try {
            send("log", JSON.parse(line));
          } catch {
            send("log", { message: line });
          }
        }
        sent = lines.length;

        const [current] = await db
          .select({ status: sourceDocuments.status })
          .from(sourceDocuments)
          .where(eq(sourceDocuments.id, id))
          .limit(1);

        send("status", { status: current?.status ?? "unknown" });

        if (
          !current ||
          current.status === "published" ||
          current.status === "failed"
        ) {
          controller.close();
          closed = true;
        }
      };

      await tick().catch(() => undefined);
      const timer = setInterval(() => {
        void tick().catch(() => {
          clearInterval(timer);
          controller.close();
          closed = true;
        });
      }, 1500);

      // Hono/Web streams have no cancel hook here; the interval is cleared when
      // the stream closes on a terminal status.
      c.req.raw.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(timer);
      });
    },
    cancel() {
      closed = true;
    },
  });

  return c.body(stream, 200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
});
