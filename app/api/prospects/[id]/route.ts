import { NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { prisma } from "@/lib/db";

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
    return NextResponse.json({ prospect });
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
