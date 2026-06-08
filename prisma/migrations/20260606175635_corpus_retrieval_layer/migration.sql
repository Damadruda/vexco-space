-- Extension pgvector (Neon la soporta)
CREATE EXTENSION IF NOT EXISTS vector;

-- CorpusChunk
CREATE TABLE "CorpusChunk" (
  "id"           TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
  "documentId"   TEXT NOT NULL,
  "ordinal"      INTEGER NOT NULL,
  "content"      TEXT NOT NULL,
  "tokenCount"   INTEGER NOT NULL,
  "embedding"    vector(768) NOT NULL,
  "corpusId"     TEXT NOT NULL,
  "documentType" "CorpusDocumentType" NOT NULL DEFAULT 'UNCLASSIFIED',
  "industry"     TEXT,
  "provenance"   "Provenance" NOT NULL DEFAULT 'UNKNOWN',
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CorpusChunk_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CorpusChunk"
  ADD CONSTRAINT "CorpusChunk_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "CorpusDocument"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "CorpusChunk_documentId_idx" ON "CorpusChunk"("documentId");
CREATE INDEX "CorpusChunk_corpusId_idx" ON "CorpusChunk"("corpusId");
CREATE INDEX "CorpusChunk_corpusId_industry_idx" ON "CorpusChunk"("corpusId", "industry");

-- Indice HNSW para similitud coseno
CREATE INDEX "CorpusChunk_embedding_hnsw_idx"
  ON "CorpusChunk" USING hnsw ("embedding" vector_cosine_ops);

-- RetrievalQueryLog
CREATE TABLE "RetrievalQueryLog" (
  "id"            TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
  "query"         TEXT NOT NULL,
  "scopeCorpusId" TEXT,
  "scopeIndustry" TEXT,
  "topScore"      DOUBLE PRECISION NOT NULL,
  "meanTopK"      DOUBLE PRECISION NOT NULL,
  "resultCount"   INTEGER NOT NULL,
  "latencyMs"     INTEGER NOT NULL,
  "consumer"      TEXT NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RetrievalQueryLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RetrievalQueryLog_consumer_createdAt_idx" ON "RetrievalQueryLog"("consumer", "createdAt");
CREATE INDEX "RetrievalQueryLog_createdAt_idx" ON "RetrievalQueryLog"("createdAt");
