-- Migration 0016: Change embedding column dimension to 2048 to match model output
-- The nvidia/nemotron-3-embed-1b model produces 2048-dimensional embeddings

ALTER TABLE "document_pages" ALTER COLUMN "embedding" TYPE halfvec(2048);

-- Update the HNSW index for the new dimension
DROP INDEX IF EXISTS "document_pages_embedding_hnsw_idx";
CREATE INDEX "document_pages_embedding_hnsw_idx"
  ON "document_pages"
  USING hnsw ("embedding" halfvec_l2_ops)
  WITH (m = 16, ef_construction = 64);

COMMENT ON COLUMN "document_pages"."embedding" IS 'Half-precision vector embedding (2048 dims) for semantic search';