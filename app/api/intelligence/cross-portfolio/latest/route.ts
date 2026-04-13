import { NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const userId = await getDefaultUserId();
    const latest = await prisma.crossPortfolioAnalysis.findFirst({
      where: { status: "completed" },
      orderBy: { createdAt: "desc" },
    });
    if (!latest) {
      return NextResponse.json({ analysis: null, projectMap: {} });
    }

    // Resolve project names server-side to avoid client-side race conditions
    const projects = await prisma.project.findMany({
      where: { userId },
      select: { id: true, title: true },
    });
    const projectMap: Record<string, string> = {};
    for (const p of projects) {
      projectMap[p.id] = p.title;
    }

    return NextResponse.json({ analysis: latest, projectMap });
  } catch (error) {
    console.error("[CROSS-PORTFOLIO LATEST]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    );
  }
}
