import { NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { prisma } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getDefaultUserId();
    const { id } = await params;

    const mp = await prisma.metaProject.findFirst({ where: { id, ownerId: userId } });
    if (!mp) {
      return NextResponse.json({ error: "MetaProject no encontrado" }, { status: 404 });
    }

    const milestones = await prisma.metaProjectMilestone.findMany({
      where: { metaProjectId: id },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ milestones });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getDefaultUserId();
    const { id } = await params;
    const body = await request.json();

    const mp = await prisma.metaProject.findFirst({ where: { id, ownerId: userId } });
    if (!mp) {
      return NextResponse.json({ error: "MetaProject no encontrado" }, { status: 404 });
    }

    const milestone = await prisma.metaProjectMilestone.create({
      data: {
        metaProjectId: id,
        title: body.title,
        description: body.description || null,
        status: body.status || "pending",
        dependsOnProjectIds: body.dependsOnProjectIds || [],
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        ownerId: body.ownerId || null,
      },
    });
    return NextResponse.json({ milestone }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    );
  }
}
