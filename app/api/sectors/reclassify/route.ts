// =============================================================================
// POST /api/sectors/reclassify
// Re-clasifica todos los proyectos e insights pendientes (naicsSectorReviewed: false)
// con el classifier nuevo. Skip de los que el humano ya validó.
//
// Sprint Reclassify Parallel: paralelización con concurrency limit (5 in-flight).
// Antes era secuencial — funcionaba con Flash (~30s para 33 items) pero timeoutea
// con Pro stable (~5-10s/item nominal, hasta 240s peor caso por retries).
// =============================================================================

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import {
  classifyProjectSector,
  classifyInsightSector,
} from "@/lib/firm-insights/sector-classifier";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CONCURRENCY = 5;

interface ReclassifyResult {
  projectsProcessed: number;
  projectsUpdated: number;
  projectsSkipped: number;
  insightsProcessed: number;
  insightsUpdated: number;
  insightsSkipped: number;
  errors: string[];
  totalMs: number;
}

// ─── Concurrency pool helper ──────────────────────────────────────────────────
// Procesa items con un máximo de N workers en paralelo. Cada worker toma un item
// del queue, lo procesa, y vuelve a tomar el siguiente. Cuando queue está vacío,
// el worker termina. Promise.allSettled-style: errores en items individuales no
// matan el batch, se devuelven como rejected.

async function processWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, idx: number) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  const queue = items.map((item, idx) => ({ item, idx }));

  async function runner() {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) return;
      try {
        const value = await worker(next.item, next.idx);
        results[next.idx] = { status: "fulfilled", value };
      } catch (err) {
        results[next.idx] = { status: "rejected", reason: err };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => runner())
  );

  return results;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST() {
  const t0 = Date.now();
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const result: ReclassifyResult = {
      projectsProcessed: 0,
      projectsUpdated: 0,
      projectsSkipped: 0,
      insightsProcessed: 0,
      insightsUpdated: 0,
      insightsSkipped: 0,
      errors: [],
      totalMs: 0,
    };

    // ── Re-clasificar proyectos pendientes (paralelo, concurrency 5) ─────
    const pendingProjects = await prisma.project.findMany({
      where: {
        userId: user.id,
        naicsSectorReviewed: false,
      },
      select: {
        id: true,
        title: true,
        description: true,
        concept: true,
        targetMarket: true,
      },
    });

    console.log(
      `[RECLASSIFY] Starting batch — ${pendingProjects.length} projects pending. Concurrency=${CONCURRENCY}.`
    );

    const projectResults = await processWithConcurrency(
      pendingProjects,
      CONCURRENCY,
      async (p) => {
        const itemStart = Date.now();
        result.projectsProcessed++;

        // Re-check race condition: usuario puede haber confirmado entre query y ahora
        const fresh = await prisma.project.findUnique({
          where: { id: p.id },
          select: { naicsSectorReviewed: true },
        });
        if (fresh?.naicsSectorReviewed) {
          console.log(`[RECLASSIFY] project ${p.id} → SKIPPED (already reviewed)`);
          return "skipped" as const;
        }

        const classification = await classifyProjectSector({
          title: p.title,
          description: p.description,
          concept: p.concept,
          targetMarket: p.targetMarket,
        });

        await prisma.project.update({
          where: { id: p.id },
          data: {
            naicsSector: classification.naicsSector,
            naicsSectorConfidence: classification.confidence,
          },
        });

        const elapsed = Date.now() - itemStart;
        const titleShort = p.title.slice(0, 40).replace(/\n/g, " ");
        console.log(
          `[RECLASSIFY] project ${p.id} (${titleShort}) → ${classification.naicsSector ?? "UNKNOWN"} conf=${classification.confidence.toFixed(2)} in ${elapsed}ms`
        );
        return "updated" as const;
      }
    );

    for (let i = 0; i < projectResults.length; i++) {
      const r = projectResults[i];
      if (r.status === "fulfilled") {
        if (r.value === "updated") result.projectsUpdated++;
        else if (r.value === "skipped") result.projectsSkipped++;
      } else {
        const p = pendingProjects[i];
        const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
        result.errors.push(`Project ${p.id} (${p.title}): ${msg}`);
        console.warn("[RECLASSIFY_PROJECT]", p.id, msg);
      }
    }

    console.log(
      `[RECLASSIFY] Projects done. updated=${result.projectsUpdated} skipped=${result.projectsSkipped} errors=${result.errors.length} elapsed=${Date.now() - t0}ms`
    );

    // ── Re-clasificar insights pendientes (paralelo, concurrency 5) ──────
    const pendingInsights = await prisma.firmInsight.findMany({
      where: {
        ownerId: user.id,
        naicsSectorReviewed: false,
        isActive: true,
      },
      select: {
        id: true,
        title: true,
        content: true,
        functionalDomain: true,
      },
    });

    console.log(
      `[RECLASSIFY] Starting insights batch — ${pendingInsights.length} pending.`
    );

    const insightResults = await processWithConcurrency(
      pendingInsights,
      CONCURRENCY,
      async (i) => {
        const itemStart = Date.now();
        result.insightsProcessed++;

        const fresh = await prisma.firmInsight.findUnique({
          where: { id: i.id },
          select: { naicsSectorReviewed: true },
        });
        if (fresh?.naicsSectorReviewed) {
          console.log(`[RECLASSIFY] insight ${i.id} → SKIPPED (already reviewed)`);
          return "skipped" as const;
        }

        const classification = await classifyInsightSector({
          title: i.title,
          content: i.content,
          functionalDomain: i.functionalDomain,
        });

        await prisma.firmInsight.update({
          where: { id: i.id },
          data: {
            naicsSector: classification.naicsSector,
            naicsSectorConfidence: classification.confidence,
          },
        });

        const elapsed = Date.now() - itemStart;
        const titleShort = i.title.slice(0, 40).replace(/\n/g, " ");
        console.log(
          `[RECLASSIFY] insight ${i.id} (${titleShort}) → ${classification.naicsSector ?? "UNKNOWN"} conf=${classification.confidence.toFixed(2)} in ${elapsed}ms`
        );
        return "updated" as const;
      }
    );

    for (let i = 0; i < insightResults.length; i++) {
      const r = insightResults[i];
      if (r.status === "fulfilled") {
        if (r.value === "updated") result.insightsUpdated++;
        else if (r.value === "skipped") result.insightsSkipped++;
      } else {
        const ins = pendingInsights[i];
        const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
        result.errors.push(`Insight ${ins.id} (${ins.title}): ${msg}`);
        console.warn("[RECLASSIFY_INSIGHT]", ins.id, msg);
      }
    }

    result.totalMs = Date.now() - t0;
    console.log("[RECLASSIFY] Done.", result);
    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[RECLASSIFY] Fatal error:", msg);
    return NextResponse.json(
      { error: msg, totalMs: Date.now() - t0 },
      { status: 500 }
    );
  }
}
