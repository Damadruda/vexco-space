import { NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { prisma } from "@/lib/db";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; milestoneId: string }> }
) {
  try {
    const userId = await getDefaultUserId();
    const { id, milestoneId } = await params;

    const mp = await prisma.metaProject.findFirst({ where: { id, ownerId: userId } });
    if (!mp) {
      return NextResponse.json({ error: "MetaProject no encontrado" }, { status: 404 });
    }

    const body = await request.json();
    const milestone = await prisma.metaProjectMilestone.update({
      where: { id: milestoneId, metaProjectId: id },
      data: {
        ...(body.title !== undefined && { title: body.title }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.status !== undefined && { status: body.status }),
        ...(body.dependsOnProjectIds !== undefined && { dependsOnProjectIds: body.dependsOnProjectIds }),
        ...(body.dueDate !== undefined && { dueDate: body.dueDate ? new Date(body.dueDate) : null }),
      },
    });
    return NextResponse.json({ milestone });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; milestoneId: string }> }
) {
  try {
    const userId = await getDefaultUserId();
    const { id, milestoneId } = await params;

    const mp = await prisma.metaProject.findFirst({ where: { id, ownerId: userId } });
    if (!mp) {
      return NextResponse.json({ error: "MetaProject no encontrado" }, { status: 404 });
    }

    await prisma.metaProjectMilestone.delete({
      where: { id: milestoneId, metaProjectId: id },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    );
  }
}
