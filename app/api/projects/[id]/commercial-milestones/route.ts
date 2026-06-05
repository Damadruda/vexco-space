import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getDefaultUserId } from "@/lib/get-default-user";
import { CommercialStage } from "@prisma/client";

export const dynamic = "force-dynamic";

// Orden canónico de stages (Prisma no ordena enums por valor lógico).
const STAGE_ORDER: CommercialStage[] = [
  "PROPOSAL_SENT",
  "ACCEPTED",
  "KICKOFF",
  "DELIVERY",
  "INVOICE_SENT",
  "PAID",
];

function stageIndex(stage: CommercialStage): number {
  const i = STAGE_ORDER.indexOf(stage);
  return i === -1 ? STAGE_ORDER.length : i;
}

// GET: lista los milestones comerciales del proyecto, ordenados por stage canónico, order, dueDate.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getDefaultUserId();
    const { id: projectId } = await params;

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
    }
    if (project.userId !== userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const rows = await prisma.projectCommercialMilestone.findMany({
      where: { projectId },
    });

    const milestones = rows.sort((a, b) => {
      const byStage = stageIndex(a.stage) - stageIndex(b.stage);
      if (byStage !== 0) return byStage;
      if (a.order !== b.order) return a.order - b.order;
      const aDue = a.dueDate ? a.dueDate.getTime() : Infinity;
      const bDue = b.dueDate ? b.dueDate.getTime() : Infinity;
      return aDue - bDue;
    });

    return NextResponse.json({ milestones });
  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    console.error("Error fetching commercial milestones:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

// POST: crea un milestone comercial.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getDefaultUserId();
    const { id: projectId } = await params;

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
    }
    if (project.userId !== userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const body = await request.json();
    const { stage, title, amount, currency, dueDate, completedAt, notes } = body as {
      stage?: string;
      title?: string;
      amount?: number;
      currency?: string;
      dueDate?: string | null;
      completedAt?: string | null;
      notes?: string;
    };

    if (!stage || !STAGE_ORDER.includes(stage as CommercialStage)) {
      return NextResponse.json({ error: "stage inválido" }, { status: 400 });
    }

    const maxOrder = await prisma.projectCommercialMilestone.aggregate({
      where: { projectId },
      _max: { order: true },
    });

    const milestone = await prisma.projectCommercialMilestone.create({
      data: {
        projectId,
        stage: stage as CommercialStage,
        title: title ?? null,
        amount: typeof amount === "number" ? amount : null,
        currency: currency || "EUR",
        dueDate: dueDate ? new Date(dueDate) : null,
        completedAt: completedAt ? new Date(completedAt) : null,
        notes: notes ?? null,
        order: (maxOrder._max.order ?? -1) + 1,
      },
    });

    return NextResponse.json({ milestone });
  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    console.error("Error creating commercial milestone:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
