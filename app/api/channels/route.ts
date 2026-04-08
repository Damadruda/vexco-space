import { NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const userId = await getDefaultUserId();
    const channels = await prisma.channel.findMany({
      where: { ownerId: userId },
      include: {
        channelProjects: { include: { project: { select: { id: true, title: true } } } },
        _count: { select: { prospects: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json({ channels });
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
    const { name, type, reachDescription, relationshipStage, notes } = body;

    if (!name || !type) {
      return NextResponse.json({ error: "name y type son requeridos" }, { status: 400 });
    }

    const channel = await prisma.channel.create({
      data: {
        name,
        type,
        reachDescription: reachDescription || null,
        relationshipStage: relationshipStage || "cold",
        notes: notes || null,
        ownerId: userId,
      },
    });
    return NextResponse.json({ channel }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    );
  }
}
