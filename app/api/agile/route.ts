import { NextRequest, NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await getDefaultUserId();
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");

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
