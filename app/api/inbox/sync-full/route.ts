// =============================================================================
// SYNC-FULL — Force full Raindrop sync (ignores lastSyncDate)
// Diagnostic endpoint: fetches latest 100 bookmarks sorted by -created,
// upserts by raindropId, returns diff for troubleshooting.
// =============================================================================

import { NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { prisma } from "@/lib/db";
import { raindropClient } from "@/lib/clients/raindrop";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
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

    // Fetch latest 100 bookmarks sorted by -created (newest first)
    const { items: bookmarks } = await raindropClient.getBookmarks(
      prefs.raindropToken,
      { collectionId: 0, page: 0, perPage: 50 }
    );
    const { items: bookmarks2 } = await raindropClient.getBookmarks(
      prefs.raindropToken,
      { collectionId: 0, page: 1, perPage: 50 }
    );
    const allBookmarks = [...bookmarks, ...bookmarks2];

    console.log(
      `[sync-full] Fetched ${allBookmarks.length} bookmarks (newest first)`
    );

    // Lookup existing items
    const raindropIds = allBookmarks.map((b) => String(b.id)).filter(Boolean);
    const existingItems = await prisma.inboxItem.findMany({
      where: { userId, raindropId: { in: raindropIds } },
      select: { id: true, raindropId: true },
    });
    const existingSet = new Set(existingItems.map((i) => i.raindropId));

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const bookmark of allBookmarks) {
      if (!bookmark.link) {
        skipped++;
        continue;
      }

      const rdId = String(bookmark.id);

      if (existingSet.has(rdId)) {
        // Already exists — update metadata
        try {
          await prisma.inboxItem.updateMany({
            where: { userId, raindropId: rdId },
            data: {
              tags: bookmark.tags ?? [],
              sourceUrl: bookmark.link,
              sourceTitle: bookmark.title,
              rawContent: bookmark.excerpt || bookmark.title,
            },
          });
          updated++;
        } catch {
          skipped++;
        }
        continue;
      }

      // New item — create
      try {
        await prisma.inboxItem.create({
          data: {
            type: "url",
            rawContent: bookmark.excerpt || bookmark.title,
            sourceUrl: bookmark.link,
            sourceTitle: bookmark.title,
            raindropId: rdId,
            tags: bookmark.tags ?? [],
            status: "unprocessed",
            userId,
          },
        });
        created++;
      } catch {
        skipped++;
      }
    }

    // Date range of fetched bookmarks
    const dates = allBookmarks
      .map((b) => b.created)
      .filter(Boolean)
      .sort();
    const dateRange =
      dates.length > 0
        ? `${dates[0]} — ${dates[dates.length - 1]}`
        : "sin fechas";

    return NextResponse.json({
      created,
      updated,
      skipped,
      totalFetched: allBookmarks.length,
      dateRange,
      message: `${created} nuevos, ${updated} actualizados, ${skipped} omitidos de ${allBookmarks.length} fetched`,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    if (
      error instanceof Error &&
      error.message.includes("Token de Raindrop")
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[SYNC-FULL] Error:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
