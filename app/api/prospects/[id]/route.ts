import { NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { prisma } from "@/lib/db";
import { CommercialStage } from "@prisma/client";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getDefaultUserId();
    const { id } = await params;
    const prospect = await prisma.prospect.findFirst({
      where: { id, ownerId: userId },
      include: {
        fits: {
          include: { project: { select: { id: true, title: true, revenueProximityScore: true } } },
          orderBy: { fitScore: "desc" },
        },
        channel: { select: { id: true, name: true } },
      },
    });
    if (!prospect) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }

    // Proyectos vinculados directamente (Project.prospectId) — distinto de fits.
    const linked = await prisma.project.findMany({
      where: { prospectId: id, userId },
      select: { id: true, title: true },
    });

    let billing: {
      totalFacturado: number;
      totalCobrado: number;
      currency: string;
      projects: Array<{ id: string; title: string; facturado: number; cobrado: number }>;
    } = { totalFacturado: 0, totalCobrado: 0, currency: prospect.currency, projects: [] };

    if (linked.length > 0) {
      const linkedIds = linked.map((p) => p.id);
      const ms = await prisma.projectCommercialMilestone.findMany({
        where: {
          projectId: { in: linkedIds },
          completedAt: { not: null },
          stage: { in: [CommercialStage.INVOICE_SENT, CommercialStage.PAID] },
        },
        select: { projectId: true, stage: true, amount: true },
      });
      const perProject = new Map<string, { facturado: number; cobrado: number }>();
      for (const m of ms) {
        const e = perProject.get(m.projectId) ?? { facturado: 0, cobrado: 0 };
        if (m.stage === "INVOICE_SENT") e.facturado += m.amount ?? 0;
        if (m.stage === "PAID") e.cobrado += m.amount ?? 0;
        perProject.set(m.projectId, e);
      }
      const projects = linked.map((p) => ({
        id: p.id,
        title: p.title,
        facturado: perProject.get(p.id)?.facturado ?? 0,
        cobrado: perProject.get(p.id)?.cobrado ?? 0,
      }));
      billing = {
        totalFacturado: projects.reduce((s, p) => s + p.facturado, 0),
        totalCobrado: projects.reduce((s, p) => s + p.cobrado, 0),
        currency: prospect.currency,
        projects,
      };
    }

    return NextResponse.json({ prospect, billing });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getDefaultUserId();
    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.prospect.findFirst({ where: { id, ownerId: userId } });
    if (!existing) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }

    // Auto-set dormantSince when status changes to DORMANT
    const statusData: Record<string, unknown> = {};
    if (body.status !== undefined) {
      statusData.status = body.status;
      if (body.status === "DORMANT" && existing.status !== "DORMANT") {
        statusData.dormantSince = new Date();
      } else if (body.status !== "DORMANT") {
        statusData.dormantSince = null;
      }
    }

    const prospect = await prisma.prospect.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.company !== undefined && { company: body.company }),
        ...(body.source !== undefined && { source: body.source }),
        ...(body.stage !== undefined && { stage: body.stage }),
        ...(body.estimatedDealValue !== undefined && {
          estimatedDealValue: body.estimatedDealValue ? parseFloat(body.estimatedDealValue) : null,
        }),
        ...(body.currency !== undefined && { currency: body.currency }),
        ...(body.notes !== undefined && { notes: body.notes }),
        ...(body.channelId !== undefined && { channelId: body.channelId }),
        ...(body.lostReason !== undefined && { lostReason: body.lostReason }),
        ...statusData,
      },
    });
    return NextResponse.json({ prospect });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getDefaultUserId();
    const { id } = await params;

    const existing = await prisma.prospect.findFirst({ where: { id, ownerId: userId } });
    if (!existing) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }

    await prisma.prospect.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    );
  }
}
