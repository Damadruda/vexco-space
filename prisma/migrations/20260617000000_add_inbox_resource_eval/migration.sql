-- Resource evaluation + embedding sobre AnalysisResult
ALTER TABLE "AnalysisResult"
  ADD COLUMN "resourceType"    TEXT,
  ADD COLUMN "capability"      TEXT,
  ADD COLUMN "embeddingStatus" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "embedding"       vector(768);

-- Indice HNSW para similitud coseno (NULLs se ignoran)
CREATE INDEX "AnalysisResult_embedding_hnsw_idx"
  ON "AnalysisResult" USING hnsw ("embedding" vector_cosine_ops);

CREATE INDEX "AnalysisResult_resourceType_idx" ON "AnalysisResult"("resourceType");
CREATE INDEX "AnalysisResult_embeddingStatus_idx" ON "AnalysisResult"("embeddingStatus");
