// =============================================================================
// GET /api/debug/naics-diagnostic
// Diagnóstico read-only del clasificador NAICS y del matcher de FirmInsight.
// Autenticado (NextAuth). READ-only. Sin side effects. Sin migraciones.
//
// Mide:
//  1. Poblamiento + trust de naicsSector en Project y FirmInsight.
//  2. Distribución de naicsSectorConfidence (histograma + valores exactos top)
//     — confianza del CLASIFICADOR (Float 0-1), NO el confidence Int del insight.
//  3. LLMFallbackLog agrupado por modelo + ventanas temporales + muestra reciente.
//  4. (opcional, ?projects=id1,id2,id3) dry-run de matchInsightsForProject:
//     qué insights trae hoy cada proyecto, con el sector de cada insight matcheado.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { matchInsightsForProject } from "@/lib/firm-insights/matcher";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type TableName = "Project" | "FirmInsight";

interface TrustRow {
  null_sector: number;
  trusted: number;
  untrusted: number;
  reviewed_manually: number;
  active_total: number;
  total: number;
}

interface HistRow {
  c_null: number;
  c_lt_070: number;
  c_070_079: number;
  c_080_089: number;
  c_090_094: number;
  c_095_099: number;
  c_100: number;
}

interface ExactRow {
  value: number;
  n: number;
}

interface FallbackGroupRow {
  fromModel: string;
  toModel: string;
  n: number;
  first_seen: string | null;
  last_seen: string | null;
}

interface FallbackWindowRow {
  total: number;
  last_7d: number;
  last_30d: number;
  last_40d: number;
}

interface FallbackRecentRow {
  fromModel: string;
  toModel: string;
  context: string | null;
  createdAt: string;
}

async function trustDistribution(table: TableName): Promise<TrustRow> {
  // active_total solo aplica a FirmInsight (tiene columna isActive).
  const activeClause =
    table === "FirmInsight"
      ? `(COUNT(*) FILTER (WHERE "isActive" = true))::int`
      : `0`;
  const rows = await prisma.$queryRawUnsafe<TrustRow[]>(`
    SELECT
      (COUNT(*) FILTER (WHERE "naicsSector" IS NULL))::int AS null_sector,
      (COUNT(*) FILTER (
        WHERE "naicsSector" IS NOT NULL
        AND ("naicsSectorReviewed" = true OR "naicsSectorConfidence" >= 0.7)
      ))::int AS trusted,
      (COUNT(*) FILTER (
        WHERE "naicsSector" IS NOT NULL
        AND "naicsSectorReviewed" = false
        AND ("naicsSectorConfidence" IS NULL OR "naicsSectorConfidence" < 0.7)
      ))::int AS untrusted,
      (COUNT(*) FILTER (WHERE "naicsSectorReviewed" = true))::int AS reviewed_manually,
      ${activeClause} AS active_total,
      (COUNT(*))::int AS total
    FROM "${table}"
  `);
  return rows[0];
}

async function confidenceHistogram(table: TableName): Promise<HistRow> {
  const rows = await prisma.$queryRawUnsafe<HistRow[]>(`
    SELECT
      (COUNT(*) FILTER (WHERE "naicsSectorConfidence" IS NULL))::int AS c_null,
      (COUNT(*) FILTER (WHERE "naicsSectorConfidence" < 0.70))::int AS c_lt_070,
      (COUNT(*) FILTER (WHERE "naicsSectorConfidence" >= 0.70 AND "naicsSectorConfidence" < 0.80))::int AS c_070_079,
      (COUNT(*) FILTER (WHERE "naicsSectorConfidence" >= 0.80 AND "naicsSectorConfidence" < 0.90))::int AS c_080_089,
      (COUNT(*) FILTER (WHERE "naicsSectorConfidence" >= 0.90 AND "naicsSectorConfidence" < 0.95))::int AS c_090_094,
      (COUNT(*) FILTER (WHERE "naicsSectorConfidence" >= 0.95 AND "naicsSectorConfidence" < 1.0))::int AS c_095_099,
      (COUNT(*) FILTER (WHERE "naicsSectorConfidence" = 1.0))::int AS c_100
    FROM "${table}"
  `);
  return rows[0];
}

async function confidenceExactTop(table: TableName): Promise<ExactRow[]> {
  return prisma.$queryRawUnsafe<ExactRow[]>(`
    SELECT "naicsSectorConfidence" AS value, (COUNT(*))::int AS n
    FROM "${table}"
    WHERE "naicsSectorConfidence" IS NOT NULL
    GROUP BY "naicsSectorConfidence"
    ORDER BY n DESC, value DESC
    LIMIT 10
  `);
}

async function fallbackGroups(): Promise<FallbackGroupRow[]> {
  return prisma.$queryRawUnsafe<FallbackGroupRow[]>(`
    SELECT "fromModel", "toModel", (COUNT(*))::int AS n,
           MIN("createdAt")::text AS first_seen,
           MAX("createdAt")::text AS last_seen
    FROM "LLMFallbackLog"
    GROUP BY "fromModel", "toModel"
    ORDER BY n DESC
  `);
}

async function fallbackWindows(): Promise<FallbackWindowRow> {
  const rows = await prisma.$queryRawUnsafe<FallbackWindowRow[]>(`
    SELECT
      (COUNT(*))::int AS total,
      (COUNT(*) FILTER (WHERE "createdAt" >= now() - interval '7 days'))::int AS last_7d,
      (COUNT(*) FILTER (WHERE "createdAt" >= now() - interval '30 days'))::int AS last_30d,
      (COUNT(*) FILTER (WHERE "createdAt" >= now() - interval '40 days'))::int AS last_40d
    FROM "LLMFallbackLog"
  `);
  return rows[0];
}

async function fallbackRecent(): Promise<FallbackRecentRow[]> {
  return prisma.$queryRawUnsafe<FallbackRecentRow[]>(`
    SELECT "fromModel", "toModel",
           LEFT(COALESCE("context", ''), 160) AS context,
           "createdAt"::text AS "createdAt"
    FROM "LLMFallbackLog"
    ORDER BY "createdAt" DESC
    LIMIT 20
  `);
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
  };

  // ── 1 + 2: trust + histograma de confianza por tabla ───────────────────
  for (const table of ["Project", "FirmInsight"] as const) {
    try {
      result[`${table}_trust`] = await trustDistribution(table);
      result[`${table}_confidence_histogram`] = await confidenceHistogram(table);
      result[`${table}_confidence_exact_top`] = await confidenceExactTop(table);
    } catch (err) {
      result[`${table}_error`] =
        err instanceof Error ? err.message.slice(0, 200) : String(err);
    }
  }

  // ── 3: LLMFallbackLog ───────────────────────────────────────────────────
  try {
    result.fallback_by_model = await fallbackGroups();
    result.fallback_windows = await fallbackWindows();
    result.fallback_recent = await fallbackRecent();
  } catch (err) {
    result.fallback_error =
      err instanceof Error ? err.message.slice(0, 200) : String(err);
  }

  // ── 4: dry-run opcional del matcher ─────────────────────────────────────
  const projectsParam = new URL(request.url).searchParams.get("projects");
  if (projectsParam) {
    try {
      const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
      });
      if (!user) {
        result.dryrun_error = "User not found for session email";
      } else {
        const ids = projectsParam
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);

        const runs = [];
        for (const projectId of ids) {
          const project = await prisma.project.findFirst({
            where: { id: projectId, userId: user.id },
            select: {
              id: true,
              title: true,
              naicsSector: true,
              naicsSectorConfidence: true,
              naicsSectorReviewed: true,
            },
          });

          const matched = await matchInsightsForProject({
            projectId,
            userId: user.id,
            topN: 10,
          });

          const matchedIds = matched.map((m) => m.id);
          const sectors = matchedIds.length
            ? await prisma.firmInsight.findMany({
                where: { id: { in: matchedIds } },
                select: {
                  id: true,
                  naicsSector: true,
                  naicsSectorConfidence: true,
                  naicsSectorReviewed: true,
                },
              })
            : [];
          const sectorById = new Map(sectors.map((s) => [s.id, s]));

          runs.push({
            projectId,
            found: Boolean(project),
            project,
            matchedCount: matched.length,
            matched: matched.map((m) => {
              const s = sectorById.get(m.id);
              return {
                id: m.id,
                title: m.title,
                sourceProject: m.sourceProject?.title ?? null,
                insightSector: s?.naicsSector ?? null,
                insightSectorConfidence: s?.naicsSectorConfidence ?? null,
                insightSectorReviewed: s?.naicsSectorReviewed ?? false,
              };
            }),
          });
        }
        result.dryrun = runs;
      }
    } catch (err) {
      result.dryrun_error =
        err instanceof Error ? err.message.slice(0, 200) : String(err);
    }
  }

  return NextResponse.json(result);
}
