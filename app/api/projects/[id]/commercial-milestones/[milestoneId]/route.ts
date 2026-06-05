import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getDefaultUserId } from "@/lib/get-default-user";
import { CommercialStage, Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const STAGES: CommercialStage[] = [
  "PROPOSAL_SENT",
  "ACCEPTED",
  "KICKOFF",
  "DELIVERY",
  "INVOICE_SENT",
  "PAID",
];

// PATCH: actualiza campos del milestone (solo los presentes en el body).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; milestoneId: string }> }
) {
  try {
    const userId = await getDefaultUserId();
    const { milestoneId } = await params;

    const existing = await prisma.projectCommercialMilestone.findUnique({
      where: { id: milestoneId },
      include: { project: { select: { id: true, userId: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: "Milestone no encontrado" }, { status: 404 });
    }
    if (existing.project.userId !== userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const body = await request.json();
    const data: Prisma.ProjectCommercialMilestoneUpdateInput = {};

    if ("stage" in body) {
      if (!STAGES.includes(body.stage)) {
        return NextResponse.json({ error: "stage inválido" }, { status: 400 });
      }
      data.stage = body.stage as CommercialStage;
    }
    if ("title" in body) data.title = body.title ?? null;
    if ("amount" in body) {
      data.amount = typeof body.amount === "number" ? body.amount : null;
    }
    if ("currency" in body) data.currency = body.currency || "EUR";
    if ("notes" in body) data.notes = body.notes ?? null;
    if ("order" in body && typeof body.order === "number") data.order = body.order;
    if ("dueDate" in body) {
      data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    }
    if ("completedAt" in body) {
      data.completedAt = body.completedAt ? new Date(body.completedAt) : null;
    }

    const milestone = await prisma.projectCommercialMilestone.update({
      where: { id: milestoneId },
      data,
    });

    // Gancho Revenue Priority: deal cobrado pisa el score del Strategist.
    if (milestone.stage === "PAID" && milestone.completedAt != null) {
      await prisma.project.update({
        where: { id: existing.project.id },
        data: {
          revenueProximityScore: 10,
          revenueProximityReason: "Deal cobrado — milestone comercial PAID registrado.",
          revenueLastAssessedAt: new Date(),
          revenueLastAssessedBy: "commercial-milestone",
        },
      });
    }

    return NextResponse.json({ milestone });
  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    console.error("Error updating commercial milestone:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

// DELETE: borra el milestone tras ownership check.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; milestoneId: string }> }
) {
  try {
    const userId = await getDefaultUserId();
    const { milestoneId } = await params;

    const existing = await prisma.projectCommercialMilestone.findUnique({
      where: { id: milestoneId },
      include: { project: { select: { userId: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: "Milestone no encontrado" }, { status: 404 });
    }
    if (existing.project.userId !== userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    await prisma.projectCommercialMilestone.delete({ where: { id: milestoneId } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    console.error("Error deleting commercial milestone:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
