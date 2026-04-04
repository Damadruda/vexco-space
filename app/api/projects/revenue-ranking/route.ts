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

    // Calculate alerts
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const alerts: RevenueAlert[] = [];

    for (const p of projects) {
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

    return NextResponse.json({ projects, alerts });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[REVENUE_RANKING GET]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
