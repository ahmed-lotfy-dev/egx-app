-- Migration 0014: Add pgvector support and embeddings for RAG
-- This enables vector similarity search on document pages

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS "vector";

-- Add embedding column to document_pages (1536 dimensions for NVIDIA NIM embedding model)
-- Using halfvec for storage efficiency (2 bytes per dimension vs 4 for float)
ALTER TABLE "document_pages" ADD COLUMN "embedding" halfvec(1536);

-- Create HNSW index for fast similarity search
-- m=16, ef_construction=64 are good defaults for 1536-dim vectors
CREATE INDEX "document_pages_embedding_hnsw_idx"
  ON "document_pages"
  USING hnsw ("embedding" halfvec_l2_ops)
  WITH (m = 16, ef_construction = 64);

-- Also add a filtered index for document-scoped searches (optional optimization)
CREATE INDEX "document_pages_document_id_embedding_idx"
  ON "document_pages" ("document_id", "embedding");

-- Add a column to track embedding status
ALTER TABLE "document_pages" ADD COLUMN "embedding_status" text NOT NULL DEFAULT 'pending';
ALTER TABLE "document_pages" ADD COLUMN "embedding_error" text;
ALTER TABLE "document_pages" ADD COLUMN "embedded_at" timestamp with time zone;

-- Comment for documentation
COMMENT ON COLUMN "document_pages"."embedding" IS 'Half-precision vector embedding (1536 dims) for semantic search';
COMMENT ON COLUMN "document_pages"."embedding_status" IS 'pending | completed | failed';
COMMENT ON INDEX "document_pages_embedding_hnsw_idx" IS 'HNSW index for fast vector similarity search on document pages';