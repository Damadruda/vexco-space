import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getDefaultUserId } from "@/lib/get-default-user";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await getDefaultUserId();

    const milestone = await prisma.milestone.findUnique({
      where: { id: params.id },
      include: { project: true }
    });

    if (!milestone) {
      return NextResponse.json({ error: "Milestone no encontrado" }, { status: 404 });
    }
    if (milestone.project.userId !== userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const body = await request.json();
    const updateData: any = {};

    if (body.title !== undefined) updateData.title = body.title;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.isCompleted !== undefined) updateData.isCompleted = body.isCompleted;
    if (body.order !== undefined) updateData.order = body.order;

    const updated = await prisma.milestone.update({
      where: { id: params.id },
      data: updateData
    });

    return NextResponse.json({ milestone: updated });
  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    console.error("Error updating milestone:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await getDefaultUserId();

    const milestone = await prisma.milestone.findUnique({
      where: { id: params.id },
      include: { project: true }
    });

    if (!milestone) {
      return NextResponse.json({ error: "Milestone no encontrado" }, { status: 404 });
    }
    if (milestone.project.userId !== userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    await prisma.milestone.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    console.error("Error deleting milestone:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
