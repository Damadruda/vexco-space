import { NextRequest, NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const userId = await getDefaultUserId();
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const status = searchParams.get("status");
    const tag = searchParams.get("tag");

    const where: Record<string, unknown> = { authorId: userId };
    if (category) where.category = category;
    if (status) where.status = status;
    if (tag) where.tags = { has: tag };

    const articles = await prisma.knowledgeBase.findMany({
      where,
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({ articles });
  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    console.error("[KNOWLEDGE] Error fetching:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getDefaultUserId();
    const body = await request.json();
    const { title, content, contentType, category, tags, sourceUrl } = body;

    if (!title || !content) {
      return NextResponse.json(
        { error: "title y content son requeridos" },
        { status: 400 }
      );
    }

    const article = await prisma.knowledgeBase.create({
      data: {
        title,
        content,
        contentType: contentType ?? "article",
        category: category ?? null,
        tags: tags ?? [],
        sourceUrl: sourceUrl ?? null,
        authorId: userId,
        status: "draft",
      },
    });

    return NextResponse.json({ article }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    console.error("[KNOWLEDGE] Error creating:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
