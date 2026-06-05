import { NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

interface RevenueAlert {
  projectId: string;
  projectTitle: string;
  message: string;
  severity: "high" | "medium" | "low";
}

// GET: Revenue priority ranking of all active projects
export async function GET() {
  try {
    const userId = await getDefaultUserId();

    const projects = await prisma.project.findMany({
      where: { userId, isArchived: false },
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
        revenueProximityScore: true,
        revenueProximityReason: true,
        stepsToRevenue: true,
        stepsToRevenueDetail: true,
        estimatedRevenueDate: true,
        revenueLastAssessedAt: true,
        revenueLastAssessedBy: true,
      },
      orderBy: [
        { revenueProximityScore: { sort: "desc", nulls: "last" } },
        { updatedAt: "desc" },
      ],
    });

    // Cobrados: proyectos con ≥1 PAID completado. Salen del ranking de proximidad.
    const paidMilestones = await prisma.projectCommercialMilestone.findMany({
      where: {
        stage: "PAID",
        completedAt: { not: null },
        project: { userId, isArchived: false },
      },
      select: { projectId: true, amount: true, currency: true },
    });

    const collectedTotals = new Map<string, number>();
    const collectedCurrency = new Map<string, string>();
    for (const m of paidMilestones) {
      collectedTotals.set(
        m.projectId,
        (collectedTotals.get(m.projectId) ?? 0) + (m.amount ?? 0)
      );
      if (!collectedCurrency.has(m.projectId)) {
        collectedCurrency.set(m.projectId, m.currency);
      }
    }
    const collectedIds = new Set(collectedTotals.keys());

    const activeProjects = projects.filter((p) => !collectedIds.has(p.id));
    const collected = projects
      .filter((p) => collectedIds.has(p.id))
      .map((p) => ({
        id: p.id,
        title: p.title,
        collectedTotal: collectedTotals.get(p.id) ?? 0,
        currency: collectedCurrency.get(p.id) ?? "EUR",
      }));

    // Calculate alerts
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const alerts: RevenueAlert[] = [];

    for (const p of activeProjects) {
      // Score >= 7 and <= 2 steps to revenue
      if (
        p.revenueProximityScore &&
        p.revenueProximityScore >= 7 &&
        p.stepsToRevenue != null &&
        p.stepsToRevenue <= 2
      ) {
        alerts.push({
          projectId: p.id,
          projectTitle: p.title,
          message: `${p.title} está a ${p.stepsToRevenue} paso${p.stepsToRevenue === 1 ? "" : "s"} de facturar`,
          severity: "high",
        });
      }

      // Score >= 8 and no assessment in 7+ days
      if (
        p.revenueProximityScore &&
        p.revenueProximityScore >= 8 &&
        p.revenueLastAssessedAt &&
        p.revenueLastAssessedAt < sevenDaysAgo
      ) {
        alerts.push({
          projectId: p.id,
          projectTitle: p.title,
          message: `${p.title} está cerca de facturar pero no ha recibido atención`,
          severity: "high",
        });
      }

      // No score and created 3+ days ago
      if (p.revenueProximityScore == null && p.createdAt < threeDaysAgo) {
        alerts.push({
          projectId: p.id,
          projectTitle: p.title,
          message: `${p.title} no tiene evaluación de revenue priority`,
          severity: "low",
        });
      }
    }

    return NextResponse.json({ projects: activeProjects, alerts, collected });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[REVENUE_RANKING GET]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
