import { NextRequest, NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const userId = await getDefaultUserId();
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const isGlobal = searchParams.get("global") === "true";

    if (isGlobal) {
      // Global view: all tasks from all active projects
      const tasks = await prisma.agileTask.findMany({
        where: {
          project: {
            userId,
            isArchived: false,
          },
        },
        include: {
          project: {
            select: {
              id: true,
              title: true,
              revenueProximityScore: true,
              revenueProximityReason: true,
              stepsToRevenue: true,
            },
          },
        },
        orderBy: { updatedAt: "desc" },
      });

      // Build project summaries
      const projectMap = new Map<string, { id: string; title: string; taskCount: number; revenueProximityScore: number | null }>();
      for (const t of tasks) {
        if (t.project) {
          const existing = projectMap.get(t.project.id);
          if (existing) {
            existing.taskCount++;
          } else {
            projectMap.set(t.project.id, {
              id: t.project.id,
              title: t.project.title,
              taskCount: 1,
              revenueProximityScore: t.project.revenueProximityScore,
            });
          }
        }
      }

      const enrichedTasks = tasks.map(t => ({
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority,
        type: t.type,
        labels: t.labels,
        sprint: t.sprint,
        projectId: t.project?.id ?? null,
        projectTitle: t.project?.title ?? null,
        revenueProximityScore: t.project?.revenueProximityScore ?? null,
        revenueProximityReason: t.project?.revenueProximityReason ?? null,
        stepsToRevenue: t.project?.stepsToRevenue ?? null,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      }));

      const projects = Array.from(projectMap.values()).sort(
        (a, b) => (b.revenueProximityScore ?? 0) - (a.revenueProximityScore ?? 0)
      );

      return NextResponse.json({ tasks: enrichedTasks, projects });
    }

    // Per-project or unfiltered view
    const where: Record<string, string> = {};
    if (projectId) where.projectId = projectId;

    const tasks = await prisma.agileTask.findMany({
      where,
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ tasks });
  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    console.error("[AGILE] Error fetching tasks:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await getDefaultUserId();
    const body = await request.json();

    const task = await prisma.agileTask.create({
      data: {
        title: body.title,
        description: body.description ?? null,
        status: body.status ?? "backlog",
        priority: body.priority ?? "medium",
        type: body.type ?? "task",
        projectId: body.projectId ?? null,
        labels: body.labels ?? [],
        blockedBy: body.blockedBy ?? [],
      },
    });

    return NextResponse.json({ task });
  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    console.error("[AGILE] Error creating task:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
