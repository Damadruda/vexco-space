import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getDefaultUserId } from "@/lib/get-default-user";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const userId = await getDefaultUserId();

    const now = new Date();
    const weekFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const [
      projectCounts, projectTypeCounts, totalNotes, totalLinks, totalImages,
      taskStats, doneTaskStats, inboxTotal, inboxUnprocessed,
      tasksThisWeek, tasksOverdue, insightsDraft, recentActivity,
    ] = await Promise.all([
      prisma.project.groupBy({
        by: ["status"],
        where: { userId },
        _count: true
      }),
      prisma.project.groupBy({
        by: ["projectType"],
        where: { userId },
        _count: true
      }),
      prisma.note.count({ where: { userId } }),
      prisma.link.count({ where: { userId } }),
      prisma.image.count({ where: { userId } }),
      prisma.agileTask.groupBy({
        by: ["projectId"],
        _count: { id: true },
        where: { projectId: { not: null } },
      }),
      prisma.agileTask.groupBy({
        by: ["projectId"],
        _count: { id: true },
        where: { projectId: { not: null }, status: "done" },
      }),
      prisma.inboxItem.count({ where: { userId } }),
      prisma.inboxItem.count({ where: { userId, status: "unprocessed" } }),
      // Tasks this week
      prisma.agileTask.findMany({
        where: {
          project: { userId },
          dueDate: { gte: now, lte: weekFromNow },
          status: { not: "done" },
        },
        select: {
          id: true,
          title: true,
          dueDate: true,
          projectId: true,
          project: { select: { title: true } },
        },
        orderBy: { dueDate: "asc" },
        take: 5,
      }),
      // Overdue tasks
      prisma.agileTask.count({
        where: {
          project: { userId },
          dueDate: { lt: now },
          status: { not: "done" },
        },
      }),
      // Insights draft count
      prisma.firmInsight.count({
        where: { ownerId: userId, validatedByUser: false, isActive: true },
      }),
      // Recent activity
      prisma.project.findMany({
        where: { userId },
        select: { id: true, title: true, revenueLastAssessedAt: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),
    ]);

    const stats = {
      totalProjects: projectCounts.reduce((acc, c) => acc + c._count, 0),
      projectsByStatus: {
        idea: projectCounts.find((c) => c.status === "idea")?._count || 0,
        development: projectCounts.find((c) => c.status === "development")?._count || 0,
        execution: projectCounts.find((c) => c.status === "execution")?._count || 0,
        completed: projectCounts.find((c) => c.status === "completed")?._count || 0
      },
      projectsByType: {
        idea: projectTypeCounts.find((c) => c.projectType === "idea")?._count || 0,
        active: projectTypeCounts.find((c) => c.projectType === "active")?._count || 0,
        operational: projectTypeCounts.find((c) => c.projectType === "operational")?._count || 0,
        completed: projectTypeCounts.find((c) => c.projectType === "completed")?._count || 0
      },
      totalNotes,
      totalLinks,
      totalImages,
      totalContent: totalNotes + totalLinks + totalImages,
      tasksByProject: Object.fromEntries(
        taskStats.map(t => [t.projectId, {
          total: t._count.id,
          done: doneTaskStats.find(d => d.projectId === t.projectId)?._count.id ?? 0,
        }])
      ),
      inboxTotal,
      inboxUnprocessed,
      tasksThisWeek: tasksThisWeek.map(t => ({
        id: t.id,
        title: t.title,
        dueDate: t.dueDate,
        projectId: t.projectId,
        projectTitle: t.project?.title ?? "",
      })),
      tasksOverdueCount: tasksOverdue,
      insightsDraftCount: insightsDraft,
      recentActivity: recentActivity.map(p => ({
        id: p.id,
        title: p.title,
        lastActivity: p.updatedAt,
        lastDiagnosis: p.revenueLastAssessedAt,
      })),
    };

    return NextResponse.json({ stats });
  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    console.error("Error fetching stats:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
