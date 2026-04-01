import { NextRequest, NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await getDefaultUserId();

    const project = await prisma.project.findFirst({
      where: { id: params.id, userId },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        projectType: true,
        concept: true,
        targetMarket: true,
        businessModel: true,
        valueProposition: true,
        conceptStatus: true,
        marketStatus: true,
        businessStatus: true,
        executionStatus: true,
        driveFolderId: true,
        trackType: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!project) {
      return NextResponse.json(
        { error: "Proyecto no encontrado" },
        { status: 404 }
      );
    }

    const [tasks, warRoomMessages, inboxItems, driveDocs, documents] =
      await Promise.all([
        prisma.agileTask
          .findMany({
            where: { projectId: params.id },
            select: { status: true },
          })
          .catch(() => []),

        prisma.chatMessage
          .findMany({
            where: { projectId: params.id, role: "assistant" },
            orderBy: { createdAt: "desc" },
            take: 30,
            select: {
              id: true,
              content: true,
              agentId: true,
              agentName: true,
              createdAt: true,
            },
          })
          .catch(() => []),

        prisma.inboxItem
          .findMany({
            where: { projectId: params.id },
            take: 5,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              sourceTitle: true,
              sourceUrl: true,
              status: true,
              tags: true,
            },
          })
          .catch(() => []),

        prisma.driveDocSummary
          .findMany({
            where: { projectId: params.id },
            take: 10,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              fileName: true,
              fileType: true,
              summary: true,
              category: true,
            },
          })
          .catch(() => []),

        prisma.documentGeneration
          .findMany({
            where: { projectId: params.id },
            take: 5,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              title: true,
              format: true,
              documentType: true,
              feedbackRating: true,
              createdAt: true,
            },
          })
          .catch(() => []),
      ]);

    // Task stats
    const taskStats = {
      total: tasks.length,
      backlog: tasks.filter((t) => t.status === "backlog").length,
      inProgress: tasks.filter((t) => t.status === "in-progress").length,
      review: tasks.filter((t) => t.status === "review").length,
      done: tasks.filter((t) => t.status === "done").length,
    };

    // War Room insights: last message per agent
    const agentMap = new Map<
      string,
      { agentId: string; agentName: string | null; lastMessage: string; lastActivity: string }
    >();
    for (const msg of warRoomMessages) {
      const aid = msg.agentId || "unknown";
      if (!agentMap.has(aid)) {
        agentMap.set(aid, {
          agentId: aid,
          agentName: msg.agentName,
          lastMessage: msg.content.slice(0, 300),
          lastActivity: msg.createdAt.toISOString(),
        });
      }
    }
    const warRoomInsights = Array.from(agentMap.values());

    return NextResponse.json({
      project,
      taskStats,
      warRoomInsights,
      inboxItems,
      driveDocs,
      documents,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    console.error("[PROJECT SUMMARY] Error:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
