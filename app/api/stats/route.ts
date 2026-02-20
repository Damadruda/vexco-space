import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getDefaultUserId } from "@/lib/get-default-user";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const userId = await getDefaultUserId();

    const [projectCounts, projectTypeCounts, totalNotes, totalLinks, totalImages] = await Promise.all([
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
      prisma.image.count({ where: { userId } })
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
      totalContent: totalNotes + totalLinks + totalImages
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