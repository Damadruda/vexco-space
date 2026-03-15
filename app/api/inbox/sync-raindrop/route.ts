import { NextRequest, NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { prisma } from "@/lib/db";
import { raindropClient } from "@/lib/clients/raindrop";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const userId = await getDefaultUserId();

    const prefs = await prisma.userPreferences.findUnique({
      where: { userId },
    });

    if (!prefs?.raindropToken) {
      return NextResponse.json(
        { error: "Raindrop no configurado. Añade tu token en Preferencias." },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { collectionId, search } = body as {
      collectionId?: number;
      search?: string;
    };

    const { items } = await raindropClient.getBookmarks(prefs.raindropToken, {
      collectionId,
      search,
      perPage: 50,
    });

    let imported = 0;
    let skipped = 0;

    for (const bookmark of items) {
      const existing = await prisma.inboxItem.findFirst({
        where: { userId, sourceUrl: bookmark.link },
      });

      if (existing) {
        skipped++;
        continue;
      }

      await prisma.inboxItem.create({
        data: {
          type: "url",
          rawContent: bookmark.excerpt || bookmark.title,
          sourceUrl: bookmark.link,
          sourceTitle: bookmark.title,
          tags: bookmark.tags ?? [],
          status: "unprocessed",
          userId,
        },
      });

      imported++;
    }

    // Update last sync timestamp
    await prisma.userPreferences.update({
      where: { userId },
      data: { raindropLastSync: new Date() },
    });

    return NextResponse.json({
      imported,
      skipped,
      total: items.length,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    if (error instanceof Error && error.message.includes("Token de Raindrop")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[SYNC-RAINDROP] Error:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
