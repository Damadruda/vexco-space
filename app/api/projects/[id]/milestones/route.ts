import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getDefaultUserId } from "@/lib/get-default-user";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await getDefaultUserId();
    const project = await prisma.project.findUnique({ where: { id: params.id } });

    if (!project) {
      return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
    }
    if (project.userId !== userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const milestones = await prisma.milestone.findMany({
      where: { projectId: params.id },
      orderBy: { order: "asc" }
    });

    return NextResponse.json({ milestones });
  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    console.error("Error fetching milestones:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await getDefaultUserId();
    const project = await prisma.project.findUnique({ where: { id: params.id } });

    if (!project) {
      return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
    }
    if (project.userId !== userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const body = await request.json();
    if (!body.title || typeof body.title !== "string") {
      return NextResponse.json({ error: "El título es requerido" }, { status: 400 });
    }

    // Get max order to append at end
    const maxOrder = await prisma.milestone.aggregate({
      where: { projectId: params.id },
      _max: { order: true }
    });

    const milestone = await prisma.milestone.create({
      data: {
        title: body.title,
        description: body.description || null,
        isCompleted: false,
        order: (maxOrder._max.order ?? -1) + 1,
        projectId: params.id
      }
    });

    return NextResponse.json({ milestone });
  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    console.error("Error creating milestone:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await getDefaultUserId();
    const project = await prisma.project.findUnique({ where: { id: params.id } });

    if (!project) {
      return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
    }
    if (project.userId !== userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    // Delete all milestones for this project
    await prisma.milestone.deleteMany({ where: { projectId: params.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    console.error("Error deleting milestones:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
