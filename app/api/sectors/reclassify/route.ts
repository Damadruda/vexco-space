// =============================================================================
// POST /api/sectors/reclassify
// Re-clasifica todos los proyectos e insights pendientes (naicsSectorReviewed: false)
// con el classifier nuevo. Skip de los que el humano ya validó.
// Procesamiento secuencial para no saturar rate limits de Gemini Flash.
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

interface ReclassifyResult {
  projectsProcessed: number;
  projectsUpdated: number;
  projectsSkipped: number;
  insightsProcessed: number;
  insightsUpdated: number;
  insightsSkipped: number;
  errors: string[];
}

export async function POST() {
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
    };

    // ── Re-clasificar proyectos pendientes ───────────────────────────────
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

    for (const p of pendingProjects) {
      result.projectsProcessed++;
      try {
        // Re-check race condition: el usuario puede haber confirmado entre la query y ahora
        const fresh = await prisma.project.findUnique({
          where: { id: p.id },
          select: { naicsSectorReviewed: true },
        });
        if (fresh?.naicsSectorReviewed) {
          result.projectsSkipped++;
          continue;
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
        result.projectsUpdated++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`Project ${p.id} (${p.title}): ${msg}`);
        console.warn("[RECLASSIFY_PROJECT]", p.id, msg);
      }
    }

    // ── Re-clasificar insights pendientes ────────────────────────────────
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

    for (const i of pendingInsights) {
      result.insightsProcessed++;
      try {
        const fresh = await prisma.firmInsight.findUnique({
          where: { id: i.id },
          select: { naicsSectorReviewed: true },
        });
        if (fresh?.naicsSectorReviewed) {
          result.insightsSkipped++;
          continue;
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
        result.insightsUpdated++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`Insight ${i.id} (${i.title}): ${msg}`);
        console.warn("[RECLASSIFY_INSIGHT]", i.id, msg);
      }
    }

    console.log("[RECLASSIFY] Result:", result);
    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[RECLASSIFY] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
