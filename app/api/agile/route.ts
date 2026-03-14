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
    console.error("Error fetching agile tasks:", error);
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
    console.error("Error creating agile task:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
