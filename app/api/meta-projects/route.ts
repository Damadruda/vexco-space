import { NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const userId = await getDefaultUserId();
    const metaProjects = await prisma.metaProject.findMany({
      where: { ownerId: userId },
      include: {
        components: {
          include: { project: { select: { id: true, title: true, revenueProximityScore: true } } },
        },
        milestones: { orderBy: { createdAt: "asc" } },
      },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json({ metaProjects });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getDefaultUserId();
    const body = await request.json();
    const { name, narrative, componentProjectIds, roles } = body;

    if (!name || !narrative) {
      return NextResponse.json({ error: "name y narrative son requeridos" }, { status: 400 });
    }

    const metaProject = await prisma.metaProject.create({
      data: {
        name,
        narrative,
        status: "active",
        affinitySnapshot: {},
        ownerId: userId,
        ...(componentProjectIds && {
          components: {
            create: (componentProjectIds as string[]).map((pid: string) => ({
              projectId: pid,
              role: roles?.[pid] || "complement",
            })),
          },
        }),
      },
      include: { components: true },
    });
    return NextResponse.json({ metaProject }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    );
  }
}
