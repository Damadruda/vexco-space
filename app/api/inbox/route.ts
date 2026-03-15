import { NextRequest, NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const userId = await getDefaultUserId();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const type = searchParams.get("type");

    const where: Record<string, string> = { userId };
    if (status) where.status = status;
    if (type) where.type = type;

    const items = await prisma.inboxItem.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { analysis: true },
    });

    return NextResponse.json({ items });
  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    console.error("[INBOX] Error fetching:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getDefaultUserId();
    const body = await request.json();
    const { type, rawContent, sourceUrl, sourceTitle, tags } = body;

    if (!type || !rawContent) {
      return NextResponse.json(
        { error: "type y rawContent son requeridos" },
        { status: 400 }
      );
    }

    const validTypes = ["url", "text", "document", "image"];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: "type debe ser: url, text, document o image" },
        { status: 400 }
      );
    }

    const item = await prisma.inboxItem.create({
      data: {
        type,
        rawContent,
        sourceUrl: sourceUrl ?? null,
        sourceTitle: sourceTitle ?? null,
        tags: tags ?? [],
        status: "unprocessed",
        userId,
      },
    });

    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    console.error("[INBOX] Error creating:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
