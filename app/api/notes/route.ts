import { NextRequest, NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const userId = await getDefaultUserId();
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");

    const where: any = { userId };
    if (projectId) where.projectId = projectId;

    const items = await prisma.note.findMany({
      where,
      orderBy: { createdAt: "desc" }
    });

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Error fetching notes:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getDefaultUserId();
    const body = await request.json();

    const note = await prisma.note.create({
      data: {
        title: body.title,
        content: body.content,
        category: body.category,
        tags: body.tags || [],
        projectId: body.projectId,
        userId
      }
    });

    return NextResponse.json({ note });
  } catch (error) {
    console.error("Error creating note:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
