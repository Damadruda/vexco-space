// =============================================================================
// MIP — /api/market-intelligence/list
// Listado paginado simple de briefs para validación manual (sin UI todavía).
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import type { MarketBriefType } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") ?? "20", 10) || 20,
    100
  );
  const briefTypeParam = url.searchParams.get("briefType");
  const briefType = briefTypeParam ? (briefTypeParam as MarketBriefType) : undefined;

  const briefs = await prisma.marketIntelligenceBrief.findMany({
    where: briefType ? { briefType } : {},
    orderBy: { publishedAt: "desc" },
    take: limit,
    include: {
      template: { select: { name: true, briefType: true } },
    },
  });

  return NextResponse.json({
    ok: true,
    count: briefs.length,
    briefs: briefs.map((b) => {
      const sd = b.structuredData as Record<string, unknown> | null;
      return {
        id: b.id,
        templateId: b.templateId,
        templateName: b.template.name,
        briefType: b.briefType,
        publishedAt: b.publishedAt,
        sectorTags: b.sectorTags,
        geographyTags: b.geographyTags,
        tokenCost: b.tokenCost,
        structuredData: b.structuredData,
        hasParseError: sd?._parseError === true,
      };
    }),
  });
}
