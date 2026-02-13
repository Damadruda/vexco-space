import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getDefaultUserId } from "@/lib/get-default-user";

export const dynamic = "force-dynamic";

const ALLOWED_FIELDS = ["title", "content", "category", "tags", "isFavorite", "projectId"];

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await getDefaultUserId();

    const existing = await prisma.note.findUnique({ where: { id: params.id } });
    if (!existing) {
      return NextResponse.json({ error: "Nota no encontrada" }, { status: 404 });
    }
    if (existing.userId !== userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const body = await request.json();
    const updateData: any = {};
    for (const field of ALLOWED_FIELDS) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    const note = await prisma.note.update({
      where: { id: params.id },
      data: updateData
    });

    return NextResponse.json({ note });
  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    console.error("Error updating note:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await getDefaultUserId();

    const existing = await prisma.note.findUnique({ where: { id: params.id } });
    if (!existing) {
      return NextResponse.json({ error: "Nota no encontrada" }, { status: 404 });
    }
    if (existing.userId !== userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    await prisma.note.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    console.error("Error deleting note:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
