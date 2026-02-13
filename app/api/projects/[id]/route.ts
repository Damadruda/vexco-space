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
    const project = await prisma.project.findUnique({
      where: { id: params.id },
      include: {
        ideas: true,
        notes: true,
        links: true,
        images: true
      }
    });

    if (!project) {
      return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
    }

    if (project.userId !== userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    return NextResponse.json({ project });
  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    console.error("Error fetching project:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await getDefaultUserId();

    const existing = await prisma.project.findUnique({ where: { id: params.id } });
    if (!existing) {
      return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
    }
    if (existing.userId !== userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const body = await request.json();
    const updateData: any = {};

    const allowedFields = [
      "title", "description", "status", "category", "tags", "priority",
      "progress", "dueDate", "concept", "problemSolved", "targetMarket",
      "marketValidation", "businessModel", "valueProposition", "actionPlan",
      "milestones", "resources", "metrics", "currentStep"
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        if (field === "dueDate" && body[field]) {
          updateData[field] = new Date(body[field]);
        } else {
          updateData[field] = body[field];
        }
      }
    }

    const project = await prisma.project.update({
      where: { id: params.id },
      data: updateData
    });

    return NextResponse.json({ project });
  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    console.error("Error updating project:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await getDefaultUserId();

    const existing = await prisma.project.findUnique({ where: { id: params.id } });
    if (!existing) {
      return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
    }
    if (existing.userId !== userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    await prisma.project.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    console.error("Error deleting project:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
