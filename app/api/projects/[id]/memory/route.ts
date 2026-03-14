import { NextRequest, NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/projects/[id]/memory
 *
 * Returns the full shared state of a project for agent consumption.
 * Agents read this before generating any suggestion.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await getDefaultUserId();

    const project = await prisma.project.findFirst({
      where: { id: params.id, userId },
    });

    if (!project) {
      return NextResponse.json(
        { error: "Proyecto no encontrado o no autorizado" },
        { status: 404 }
      );
    }

    // Fetch all related data in parallel
    const [
      decisions,
      agileTasks,
      roadmap,
      conceptInsights,
      recentNotes,
      recentIdeas,
    ] = await Promise.all([
      prisma.decisionLog.findMany({
        where: { projectId: params.id },
        orderBy: { createdAt: "desc" },
      }),
      prisma.agileTask.findMany({
        where: { projectId: params.id },
        orderBy: { createdAt: "asc" },
      }),
      prisma.roadmapTimeline.findMany({
        where: { projectId: params.id },
        orderBy: { year: "asc" },
      }),
      prisma.conceptInsight.findMany({
        where: { projectId: params.id },
        orderBy: { createdAt: "desc" },
      }),
      prisma.note.findMany({
        where: { projectId: params.id },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.idea.findMany({
        where: { projectId: params.id },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

    const totalTasks = agileTasks.length;
    const completedTasks = agileTasks.filter((t) => t.status === "done").length;
    const approvedDecisions = decisions.filter((d) => d.outcome === "APPROVED").length;
    const rejectedDecisions = decisions.filter((d) => d.outcome === "REJECTED").length;

    return NextResponse.json({
      project,
      decisions,
      agileTasks,
      roadmap,
      conceptInsights,
      recentNotes,
      recentIdeas,
      stats: {
        totalTasks,
        completedTasks,
        rejectedDecisions,
        approvedDecisions,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    console.error("[PROJECT MEMORY] Error:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
