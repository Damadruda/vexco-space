import { NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  try {
    await getDefaultUserId();
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = 20;

    const [analyses, total] = await Promise.all([
      prisma.crossPortfolioAnalysis.findMany({
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          status: true,
          agentVersion: true,
          triggeredBy: true,
          errorMessage: true,
          createdAt: true,
          completedAt: true,
          metaProjectProposals: true,
        },
      }),
      prisma.crossPortfolioAnalysis.count(),
    ]);

    const items = analyses.map((a) => ({
      ...a,
      proposalCount: Array.isArray(a.metaProjectProposals)
        ? (a.metaProjectProposals as unknown[]).length
        : 0,
      metaProjectProposals: undefined,
    }));

    return NextResponse.json({ items, total, page, pageSize });
  } catch (error) {
    console.error("[CROSS-PORTFOLIO HISTORY]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    );
  }
}
