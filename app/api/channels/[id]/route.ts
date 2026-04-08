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
    const channel = await prisma.channel.findFirst({
      where: { id, ownerId: userId },
      include: {
        channelProjects: {
          include: { project: { select: { id: true, title: true, revenueProximityScore: true } } },
        },
        prospects: { select: { id: true, name: true, company: true, stage: true } },
      },
    });
    if (!channel) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    return NextResponse.json({ channel });
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

    const existing = await prisma.channel.findFirst({ where: { id, ownerId: userId } });
    if (!existing) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }

    const channel = await prisma.channel.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.type !== undefined && { type: body.type }),
        ...(body.reachDescription !== undefined && { reachDescription: body.reachDescription }),
        ...(body.relationshipStage !== undefined && { relationshipStage: body.relationshipStage }),
        ...(body.notes !== undefined && { notes: body.notes }),
      },
    });
    return NextResponse.json({ channel });
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

    const existing = await prisma.channel.findFirst({ where: { id, ownerId: userId } });
    if (!existing) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }

    await prisma.channel.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    );
  }
}
