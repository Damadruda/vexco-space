import { NextRequest, NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await getDefaultUserId();
    const body = await request.json();
    const { outcome } = body;

    const validOutcomes = ["APPROVED", "REJECTED", "DEFERRED"];
    if (outcome && !validOutcomes.includes(outcome)) {
      return NextResponse.json(
        { error: "outcome debe ser APPROVED, REJECTED o DEFERRED" },
        { status: 400 }
      );
    }

    const existing = await prisma.decisionLog.findFirst({
      where: { id: params.id, userId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Decisión no encontrada o no autorizada" },
        { status: 404 }
      );
    }

    const decision = await prisma.decisionLog.update({
      where: { id: params.id },
      data: { outcome, updatedAt: new Date() },
    });

    return NextResponse.json({ decision });
  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    console.error("[DECISIONS] Error updating:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await getDefaultUserId();

    const existing = await prisma.decisionLog.findFirst({
      where: { id: params.id, userId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Decisión no encontrada o no autorizada" },
        { status: 404 }
      );
    }

    await prisma.decisionLog.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    console.error("[DECISIONS] Error deleting:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
