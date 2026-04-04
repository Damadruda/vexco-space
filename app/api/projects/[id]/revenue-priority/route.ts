import { NextRequest, NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// PATCH: Update revenue priority for a project
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getDefaultUserId();
    const { id: projectId } = await params;

    const existing = await prisma.project.findFirst({
      where: { id: projectId, userId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const body = await request.json();
    const {
      revenueProximityScore,
      revenueProximityReason,
      stepsToRevenue,
      stepsToRevenueDetail,
      estimatedRevenueDate,
      assessedBy,
    } = body as {
      revenueProximityScore: number;
      revenueProximityReason: string;
      stepsToRevenue: number;
      stepsToRevenueDetail: string;
      estimatedRevenueDate?: string;
      assessedBy: string;
    };

    if (!revenueProximityScore || !revenueProximityReason) {
      return NextResponse.json(
        { error: "revenueProximityScore and revenueProximityReason are required" },
        { status: 400 }
      );
    }

    const project = await prisma.project.update({
      where: { id: projectId },
      data: {
        revenueProximityScore: Math.min(10, Math.max(1, revenueProximityScore)),
        revenueProximityReason,
        stepsToRevenue: stepsToRevenue ?? null,
        stepsToRevenueDetail: stepsToRevenueDetail ?? null,
        estimatedRevenueDate: estimatedRevenueDate
          ? new Date(estimatedRevenueDate)
          : null,
        revenueLastAssessedAt: new Date(),
        revenueLastAssessedBy: assessedBy ?? null,
      },
    });

    return NextResponse.json({ project });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[REVENUE_PRIORITY PATCH]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
