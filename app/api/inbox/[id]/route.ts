import { NextRequest, NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await getDefaultUserId();

    const item = await prisma.inboxItem.findFirst({
      where: { id: params.id, userId },
      include: { analysis: true },
    });

    if (!item) {
      return NextResponse.json(
        { error: "Item no encontrado o no autorizado" },
        { status: 404 }
      );
    }

    return NextResponse.json({ item });
  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    console.error("[INBOX] Error fetching item:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await getDefaultUserId();
    const body = await request.json();

    const existing = await prisma.inboxItem.findFirst({
      where: { id: params.id, userId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Item no encontrado o no autorizado" },
        { status: 404 }
      );
    }

    const { status, priority, tags } = body;
    const item = await prisma.inboxItem.update({
      where: { id: params.id },
      data: {
        ...(status !== undefined && { status }),
        ...(priority !== undefined && { priority }),
        ...(tags !== undefined && { tags }),
        updatedAt: new Date(),
      },
      include: { analysis: true },
    });

    return NextResponse.json({ item });
  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    console.error("[INBOX] Error updating:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await getDefaultUserId();

    const existing = await prisma.inboxItem.findFirst({
      where: { id: params.id, userId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Item no encontrado o no autorizado" },
        { status: 404 }
      );
    }

    await prisma.inboxItem.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    console.error("[INBOX] Error deleting:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
