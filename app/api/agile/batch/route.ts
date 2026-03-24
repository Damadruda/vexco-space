import { NextRequest, NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    await getDefaultUserId();
    const body = await request.json();
    const { tasks } = body as {
      tasks: Array<{
        title: string;
        description?: string;
        priority?: string;
        projectId?: string;
        labels?: string[];
        sprint?: string;
      }>;
    };

    if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
      return NextResponse.json(
        { error: "tasks array is required" },
        { status: 400 }
      );
    }

    const created = await prisma.$transaction(
      tasks.map(t => prisma.agileTask.create({
        data: {
          title: t.title,
          description: t.description ?? null,
          status: "backlog",
          priority: t.priority ?? "high",
          type: "task",
          projectId: t.projectId ?? null,
          labels: t.labels ?? [],
          sprint: t.sprint ?? "Sprint 0",
        },
      }))
    );

    return NextResponse.json({ tasks: created, count: created.length });
  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[AGILE/BATCH] Error:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
