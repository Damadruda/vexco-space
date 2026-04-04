import { NextRequest, NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET: Get FirmInsights relevant to a project
export async function GET(request: NextRequest) {
  try {
    const userId = await getDefaultUserId();
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");

    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required" },
        { status: 400 }
      );
    }

    // Load project to extract keywords
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId },
      select: {
        id: true,
        title: true,
        description: true,
        concept: true,
        targetMarket: true,
        tags: true,
      },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Extract keywords from project
    const keywords: string[] = [];
    const texts = [
      project.title,
      project.description,
      project.concept,
      project.targetMarket,
    ].filter(Boolean) as string[];

    texts.forEach((text) => {
      text
        .toLowerCase()
        .split(/[\s,.\-_\/]+/)
        .filter((w) => w.length > 3)
        .forEach((w) => {
          if (!keywords.includes(w)) keywords.push(w);
        });
    });

    // Add project tags as keywords
    if (project.tags?.length) {
      project.tags.forEach((t) => {
        const lower = t.toLowerCase();
        if (!keywords.includes(lower)) keywords.push(lower);
      });
    }

    // Fetch active insights (excluding self-references)
    const insights = await prisma.firmInsight.findMany({
      where: {
        isActive: true,
        ownerId: userId,
        sourceProjectId: { not: projectId },
      },
      include: { sourceProject: { select: { id: true, title: true } } },
      orderBy: [{ confidence: "desc" }, { updatedAt: "desc" }],
      take: 30,
    });

    // Filter by keyword overlap in JS
    const matched = insights
      .filter((insight) => {
        const insightText =
          `${insight.title} ${insight.content} ${insight.domain ?? ""} ${(insight.tags ?? []).join(" ")}`.toLowerCase();
        return keywords.some((kw) => insightText.includes(kw));
      })
      .slice(0, 10);

    return NextResponse.json({ insights: matched });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[FIRM_INSIGHTS RELEVANT]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
