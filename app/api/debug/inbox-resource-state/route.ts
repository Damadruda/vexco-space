// =============================================================================
// GET /api/debug/inbox-resource-state
// Diagnóstico runtime read-only. Autenticado (NextAuth). Sin side effects.
// Expone: recursos del Inbox con su estado de embedding, log de recuperación
// semántica, y fallbacks de LLM (Pro -> Flash silencioso).
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
// Auth y prisma con el MISMO patrón que app/api/inbox/[id]/analyze/route.ts:
// getDefaultUserId() (que envuelve getServerSession) + prisma desde @/lib/db.
import { getDefaultUserId } from "@/lib/get-default-user";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  // Resolvé userId con el mismo patrón que analyze route (lanza si no hay sesión):
  let userId: string;
  try {
    userId = await getDefaultUserId();
  } catch {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const typeFilter = searchParams.get("type");        // ej. TOOL | REFERENCE | HYPE
  const statusFilter = searchParams.get("status");    // ej. READY | PENDING | FAILED | SKIPPED
  const consumerFilter = searchParams.get("consumer"); // ej. agent-chat: (prefijo)

  // ── 1. Recursos del Inbox del usuario (AnalysisResult ⋈ InboxItem) ──
  // embedding es Unsupported(vector): no se puede SELECT directo en Prisma
  // tipado; usamos $queryRaw y devolvemos solo (embedding IS NOT NULL).
  const resourcesRaw = await prisma.$queryRaw<
    Array<{
      analysisId: string;
      inboxItemId: string;
      title: string | null;
      url: string | null;
      resourceType: string | null;
      capability: string | null;
      summary: string | null;
      embeddingStatus: string;
      hasEmbedding: boolean;
      updatedAt: Date;
    }>
  >`
    SELECT
      a."id"              AS "analysisId",
      a."inboxItemId"     AS "inboxItemId",
      i."sourceTitle"     AS "title",
      i."sourceUrl"       AS "url",
      a."resourceType"    AS "resourceType",
      a."capability"      AS "capability",
      a."summary"         AS "summary",
      a."embeddingStatus" AS "embeddingStatus",
      (a."embedding" IS NOT NULL) AS "hasEmbedding",
      a."updatedAt"       AS "updatedAt"
    FROM "AnalysisResult" a
    JOIN "InboxItem" i ON i."id" = a."inboxItemId"
    WHERE i."userId" = ${userId}
    ORDER BY a."updatedAt" DESC
    LIMIT 50
  `;

  const resources = resourcesRaw
    .filter(
      (r) =>
        (!typeFilter || r.resourceType === typeFilter) &&
        (!statusFilter || r.embeddingStatus === statusFilter)
    )
    .map((r) => ({
      ...r,
      capability: r.capability ? r.capability.slice(0, 400) : null,
      summary: r.summary ? r.summary.slice(0, 400) : null,
    }));

  // ── 2. Log de recuperación semántica (topScore real por consumer) ──
  const retrievalLog = await prisma.retrievalQueryLog.findMany({
    where: consumerFilter ? { consumer: { startsWith: consumerFilter } } : undefined,
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      consumer: true,
      query: true,
      topScore: true,
      meanTopK: true,
      resultCount: true,
      latencyMs: true,
      createdAt: true,
    },
  });
  const retrievalLogTrimmed = retrievalLog.map((l) => ({
    ...l,
    query: l.query.slice(0, 220),
  }));

  // ── 3. Fallbacks de LLM (Pro -> Flash en silencio) ──
  // NOTA: accessor del cliente = prisma.lLMFallbackLog (ver arriba).
  const fallbackLog = await prisma.lLMFallbackLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      fromModel: true,
      toModel: true,
      errors: true,
      context: true,
      createdAt: true,
    },
  });
  const fallbackLogTrimmed = fallbackLog.map((f) => ({
    ...f,
    context: f.context ? f.context.slice(0, 220) : null,
  }));

  return NextResponse.json({
    resourceCount: resources.length,
    resources,
    retrievalLog: retrievalLogTrimmed,
    fallbackLog: fallbackLogTrimmed,
    timestamp: new Date().toISOString(),
  });
}
