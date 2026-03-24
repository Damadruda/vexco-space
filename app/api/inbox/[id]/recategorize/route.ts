import { NextRequest, NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await getDefaultUserId();
    const body = await request.json();
    const { category } = body as { category: string };

    if (!["project", "trend", "discovery", "noise"].includes(category)) {
      return NextResponse.json(
        { error: "Categoría inválida" },
        { status: 400 }
      );
    }

    const analysis = await prisma.analysisResult.findFirst({
      where: { inboxItem: { id: params.id } },
    });

    if (!analysis) {
      return NextResponse.json(
        { error: "Item no tiene análisis" },
        { status: 404 }
      );
    }

    const updated = await prisma.analysisResult.update({
      where: { id: analysis.id },
      data: { category },
    });

    if (category !== "project") {
      await prisma.inboxItem.update({
        where: { id: params.id },
        data: { projectId: null },
      });
    }

    return NextResponse.json({ analysis: updated });
  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[RECATEGORIZE] Error:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
