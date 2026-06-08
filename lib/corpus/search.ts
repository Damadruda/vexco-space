// =============================================================================
// VEXCO-LAB — CORPUS SEARCH (retrieval semantico sobre FirmCorpus)
// Embebe la query, similitud coseno via pgvector, filtro de metadata, y SIEMPRE
// loguea en RetrievalQueryLog (instrumentacion de salud de retrieval).
// =============================================================================

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { embedQuery, toVectorLiteral } from "@/lib/clients/embeddings";

export interface SearchHit {
  chunkId: string;
  documentId: string;
  ordinal: number;
  content: string;
  score: number; // 1 - distancia coseno; mayor = mas relevante
}

export interface SearchParams {
  query: string;
  corpusId?: string;
  industry?: string;
  topK?: number;
  minScore?: number;
  consumer: string;
}

// Helpers para inyectar filtros condicionales en el template tag de Prisma
function prismaAnd(col: string, val: string) {
  return Prisma.sql` AND ${Prisma.raw(`"${col}"`)} = ${val}`;
}
function empty() {
  return Prisma.empty;
}

export async function searchCorpus(params: SearchParams): Promise<SearchHit[]> {
  const { query, corpusId, industry, topK = 8, minScore = 0, consumer } = params;
  const start = Date.now();

  const qVec = await embedQuery(query);
  const vecLiteral = toVectorLiteral(qVec);

  // Filtros opcionales construidos con Prisma.sql para evitar inyeccion
  const rows = await prisma.$queryRaw<
    { chunkId: string; documentId: string; ordinal: number; content: string; score: number }[]
  >`
    SELECT
      "id"          AS "chunkId",
      "documentId"  AS "documentId",
      "ordinal"     AS "ordinal",
      "content"     AS "content",
      1 - ("embedding" <=> ${vecLiteral}::vector) AS "score"
    FROM "CorpusChunk"
    WHERE 1=1
      ${corpusId ? prismaAnd("corpusId", corpusId) : empty()}
      ${industry ? prismaAnd("industry", industry) : empty()}
    ORDER BY "embedding" <=> ${vecLiteral}::vector
    LIMIT ${topK}
  `;

  const hits = rows.filter((r) => r.score >= minScore);
  const latencyMs = Date.now() - start;

  const topScore = hits.length ? hits[0].score : 0;
  const meanTopK = hits.length ? hits.reduce((s, h) => s + h.score, 0) / hits.length : 0;

  // Log siempre (no bloqueante)
  await prisma.retrievalQueryLog.create({
    data: {
      query: query.slice(0, 2000),
      scopeCorpusId: corpusId ?? null,
      scopeIndustry: industry ?? null,
      topScore,
      meanTopK,
      resultCount: hits.length,
      latencyMs,
      consumer,
    },
  }).catch((e) => console.error("[searchCorpus] log fail:", e));

  return hits;
}
