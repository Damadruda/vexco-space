import { NextRequest, NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const userId = await getDefaultUserId();
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const outcome = searchParams.get("outcome");
    const agentSource = searchParams.get("agentSource");

    const where: Record<string, string> = { userId };
    if (projectId) where.projectId = projectId;
    if (outcome) where.outcome = outcome;
    if (agentSource) where.agentSource = agentSource;

    const decisions = await prisma.decisionLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ decisions });
  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    console.error("[DECISIONS] Error fetching:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getDefaultUserId();
    const body = await request.json();
    const { projectId, decision, context, outcome, agentSource } = body;

    if (!projectId || !decision || !context || !outcome || !agentSource) {
      return NextResponse.json(
        { error: "projectId, decision, context, outcome y agentSource son requeridos" },
        { status: 400 }
      );
    }

    const validOutcomes = ["APPROVED", "REJECTED", "DEFERRED"];
    if (!validOutcomes.includes(outcome)) {
      return NextResponse.json(
        { error: "outcome debe ser APPROVED, REJECTED o DEFERRED" },
        { status: 400 }
      );
    }

    const project = await prisma.project.findFirst({
      where: { id: projectId, userId },
    });

    if (!project) {
      return NextResponse.json(
        { error: "Proyecto no encontrado o no autorizado" },
        { status: 404 }
      );
    }

    const decisionLog = await prisma.decisionLog.create({
      data: {
        projectId,
        userId,
        decision,
        context,
        outcome,
        agentSource,
      },
    });

    return NextResponse.json({ decision: decisionLog }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    console.error("[DECISIONS] Error creating:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
