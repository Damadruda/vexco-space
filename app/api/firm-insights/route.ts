import { NextRequest, NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET: List FirmInsights with optional filters
export async function GET(request: NextRequest) {
  try {
    const userId = await getDefaultUserId();
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const domain = searchParams.get("domain");
    const tagsParam = searchParams.get("tags");

    const where: Record<string, unknown> = { ownerId: userId };
    if (type) where.insightType = type;
    if (domain) where.domain = domain;
    if (tagsParam) {
      const tagsArr = tagsParam.split(",").map((t) => t.trim());
      where.tags = { hasSome: tagsArr };
    }

    const insights = await prisma.firmInsight.findMany({
      where,
      include: { sourceProject: { select: { id: true, title: true } } },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });

    return NextResponse.json({ insights });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[FIRM_INSIGHTS GET]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST: Create a new FirmInsight
export async function POST(request: NextRequest) {
  try {
    const userId = await getDefaultUserId();
    const body = await request.json();
    const {
      title,
      content,
      insightType,
      domain,
      tags,
      confidence,
      sourceProjectId,
      sourceAgentId,
      metadata,
    } = body as {
      title: string;
      content: string;
      insightType: string;
      domain?: string;
      tags?: string[];
      confidence?: number;
      sourceProjectId?: string;
      sourceAgentId?: string;
      metadata?: Record<string, unknown>;
    };

    if (!title || !content || !insightType) {
      return NextResponse.json(
        { error: "title, content, and insightType are required" },
        { status: 400 }
      );
    }

    const insight = await prisma.firmInsight.create({
      data: {
        title,
        content,
        insightType,
        domain: domain ?? null,
        tags: tags ?? [],
        confidence: confidence ?? 50,
        sourceProjectId: sourceProjectId ?? null,
        sourceAgentId: sourceAgentId ?? null,
        metadata: metadata ?? null,
        ownerId: userId,
      },
    });

    return NextResponse.json({ insight }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[FIRM_INSIGHTS POST]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PATCH: Update a FirmInsight
export async function PATCH(request: NextRequest) {
  try {
    const userId = await getDefaultUserId();
    const body = await request.json();
    const { id, validatedByUser, confidence, isActive, content } = body as {
      id: string;
      validatedByUser?: boolean;
      confidence?: number;
      isActive?: boolean;
      content?: string;
    };

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const existing = await prisma.firmInsight.findFirst({
      where: { id, ownerId: userId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (validatedByUser !== undefined) data.validatedByUser = validatedByUser;
    if (confidence !== undefined) data.confidence = Math.min(100, Math.max(0, confidence));
    if (isActive !== undefined) data.isActive = isActive;
    if (content !== undefined) data.content = content;

    const updated = await prisma.firmInsight.update({
      where: { id },
      data,
    });

    return NextResponse.json({ insight: updated });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[FIRM_INSIGHTS PATCH]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
