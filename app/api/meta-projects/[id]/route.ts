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
    const metaProject = await prisma.metaProject.findFirst({
      where: { id, ownerId: userId },
      include: {
        components: {
          include: {
            project: {
              select: {
                id: true, title: true, description: true,
                revenueProximityScore: true, status: true, trackType: true,
              },
            },
          },
        },
        milestones: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!metaProject) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    return NextResponse.json({ metaProject });
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

    const existing = await prisma.metaProject.findFirst({ where: { id, ownerId: userId } });
    if (!existing) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }

    const metaProject = await prisma.metaProject.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.narrative !== undefined && { narrative: body.narrative }),
        ...(body.status !== undefined && { status: body.status }),
        ...(body.revenueScore !== undefined && { revenueScore: body.revenueScore }),
      },
    });
    return NextResponse.json({ metaProject });
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

    const existing = await prisma.metaProject.findFirst({ where: { id, ownerId: userId } });
    if (!existing) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }

    await prisma.metaProject.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    );
  }
}
