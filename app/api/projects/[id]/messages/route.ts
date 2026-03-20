import { NextRequest, NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await getDefaultUserId();
    const messages = await prisma.chatMessage.findMany({
      where: { projectId: params.id, userId },
      orderBy: { createdAt: "asc" },
      take: 50,
      select: {
        id: true,
        role: true,
        content: true,
        agentId: true,
        agentName: true,
        createdAt: true,
      },
    });
    return NextResponse.json({ messages });
  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to load messages" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await getDefaultUserId();
    const body = await request.json();
    const { role, content, agentId, agentName } = body as {
      role: string;
      content: string;
      agentId?: string;
      agentName?: string;
    };

    if (!role || !content) {
      return NextResponse.json({ error: "role and content required" }, { status: 400 });
    }

    const message = await prisma.chatMessage.create({
      data: {
        role,
        content,
        agentId,
        agentName,
        userId,
        projectId: params.id,
      },
    });
    return NextResponse.json({ message });
  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to save message" }, { status: 500 });
  }
}
