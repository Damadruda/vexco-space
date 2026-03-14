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

    const article = await prisma.knowledgeBase.findFirst({
      where: { id: params.id, authorId: userId },
    });

    if (!article) {
      return NextResponse.json(
        { error: "Artículo no encontrado o no autorizado" },
        { status: 404 }
      );
    }

    // Increment viewCount
    await prisma.knowledgeBase.update({
      where: { id: params.id },
      data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
    });

    return NextResponse.json({ article });
  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    console.error("[KNOWLEDGE] Error fetching:", error);
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

    const existing = await prisma.knowledgeBase.findFirst({
      where: { id: params.id, authorId: userId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Artículo no encontrado o no autorizado" },
        { status: 404 }
      );
    }

    const { title, content, category, tags, status, summary } = body;
    const article = await prisma.knowledgeBase.update({
      where: { id: params.id },
      data: {
        ...(title !== undefined && { title }),
        ...(content !== undefined && { content }),
        ...(category !== undefined && { category }),
        ...(tags !== undefined && { tags }),
        ...(status !== undefined && { status }),
        ...(summary !== undefined && { summary }),
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({ article });
  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    console.error("[KNOWLEDGE] Error updating:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await getDefaultUserId();

    const existing = await prisma.knowledgeBase.findFirst({
      where: { id: params.id, authorId: userId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Artículo no encontrado o no autorizado" },
        { status: 404 }
      );
    }

    await prisma.knowledgeBase.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    console.error("[KNOWLEDGE] Error deleting:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
