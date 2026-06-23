// =============================================================================
// VEXCO-LAB — INBOX RESOURCE SEARCH (recuperacion semantica de recursos curados)
// Espejo de searchCorpus pero sobre AnalysisResult ⋈ InboxItem. Solo items con
// embedding (resourceType REFERENCE/TOOL embebidos). Loguea en RetrievalQueryLog.
// =============================================================================

import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { embedQuery, toVectorLiteral } from "@/lib/clients/embeddings";

export interface InboxResourceHit {
  analysisId: string;
  inboxItemId: string;
  title: string;
  url: string | null;
  resourceType: string | null;
  capability: string | null;
  summary: string;
  score: number;
}

export interface InboxResourceSearchParams {
  userId: string;
  query: string;
  resourceTypes?: string[]; // ej. ["TOOL", "REFERENCE"]
  topK?: number;
  minScore?: number;
  consumer: string;
}

export async function searchInboxResources(
  params: InboxResourceSearchParams
): Promise<InboxResourceHit[]> {
  const { userId, query, resourceTypes, topK = 6, minScore = 0.55, consumer } = params;
  const start = Date.now();

  const qVec = await embedQuery(query);
  const vecLiteral = toVectorLiteral(qVec);

  const typeFilter =
    resourceTypes && resourceTypes.length > 0
      ? Prisma.sql` AND a."resourceType" IN (${Prisma.join(resourceTypes)})`
      : Prisma.empty;

  const rows = await prisma.$queryRaw<
    {
      analysisId: string;
      inboxItemId: string;
      title: string | null;
      url: string | null;
      resourceType: string | null;
      capability: string | null;
      summary: string;
      score: number;
    }[]
  >`
    SELECT
      a."id"           AS "analysisId",
      a."inboxItemId"  AS "inboxItemId",
      i."sourceTitle"  AS "title",
      i."sourceUrl"    AS "url",
      a."resourceType" AS "resourceType",
      a."capability"   AS "capability",
      a."summary"      AS "summary",
      1 - (a."embedding" <=> ${vecLiteral}::vector) AS "score"
    FROM "AnalysisResult" a
    JOIN "InboxItem" i ON i."id" = a."inboxItemId"
    WHERE a."embedding" IS NOT NULL
      AND i."userId" = ${userId}
      ${typeFilter}
    ORDER BY a."embedding" <=> ${vecLiteral}::vector
    LIMIT ${topK}
  `;

  const hits: InboxResourceHit[] = rows
    .filter((r) => r.score >= minScore)
    .map((r) => ({
      analysisId: r.analysisId,
      inboxItemId: r.inboxItemId,
      title: r.title ?? "(sin titulo)",
      url: r.url,
      resourceType: r.resourceType,
      capability: r.capability,
      summary: r.summary,
      score: r.score,
    }));

  const latencyMs = Date.now() - start;
  const topScore = hits.length ? hits[0].score : 0;
  const meanTopK = hits.length ? hits.reduce((s, h) => s + h.score, 0) / hits.length : 0;

  await prisma.retrievalQueryLog
    .create({
      data: {
        query: query.slice(0, 2000),
        scopeCorpusId: null,
        scopeIndustry: null,
        topScore,
        meanTopK,
        resultCount: hits.length,
        latencyMs,
        consumer,
      },
    })
    .catch((e) => console.error("[searchInboxResources] log fail:", e));

  return hits;
}

// Formatea hits como bloque de contexto para el prompt del agente.
export function formatInboxResourceBlock(hits: InboxResourceHit[]): string {
  if (!hits.length) return "";
  const lines = hits.map((h, i) => {
    const tag = h.resourceType ? `[${h.resourceType}] ` : "";
    const cap = h.capability ? ` — Capacidad: ${h.capability}` : "";
    const url = h.url ? ` (Fuente: ${h.url})` : "";
    return `${i + 1}. ${tag}${h.title}${cap}${url}`;
  });
  return [
    "HERRAMIENTAS Y RECURSOS CURADOS RELEVANTES (del Inbox del usuario, recuperados por similitud semantica con esta consulta):",
    "Si alguno resuelve un blocker o cambia la viabilidad de lo que se discute, decilo explicitamente y explica como se integraria al proyecto — sin inventar capacidades que el recurso no declara (REGLA #0.5).",
    ...lines,
  ].join("\n");
}
