// =============================================================================
// SYNC-FULL — Force full Raindrop sync (ignores lastSyncDate)
// Fetches bookmarks page-by-page sorted by -created, upserts by raindropId.
// =============================================================================

import { NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { prisma } from "@/lib/db";
import { raindropClient } from "@/lib/clients/raindrop";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PER_PAGE = 50;
const MAX_PAGES = 10; // safety: 500 bookmarks max

export async function POST() {
  try {
    const userId = await getDefaultUserId();

    const prefs = await prisma.userPreferences.findUnique({
      where: { userId },
    });

    if (!prefs?.raindropToken) {
      return NextResponse.json(
        { success: false, error: "Raindrop no configurado. Anade tu token en Preferencias." },
        { status: 400 }
      );
    }

    // Fetch bookmarks page by page (sorted by -created via raindrop client)
    let allBookmarks: Awaited<ReturnType<typeof raindropClient.getBookmarks>>["items"] = [];
    let page = 0;

    while (page < MAX_PAGES) {
      try {
        const { items: pageItems } = await raindropClient.getBookmarks(
          prefs.raindropToken,
          { collectionId: 0, page, perPage: PER_PAGE }
        );
        allBookmarks = [...allBookmarks, ...pageItems];
        console.log(
          `[sync-full] Page ${page}: ${pageItems.length} items (total: ${allBookmarks.length})`
        );
        if (pageItems.length < PER_PAGE) break;
        page++;
      } catch (pageErr) {
        const msg = pageErr instanceof Error ? pageErr.message : String(pageErr);
        console.error(`[sync-full] Error fetching page ${page}: ${msg}`);
        break;
      }
    }

    if (allBookmarks.length === 0) {
      return NextResponse.json({
        success: true,
        created: 0,
        updated: 0,
        skipped: 0,
        totalFetched: 0,
        dateRange: "sin datos",
        message: "No se obtuvieron bookmarks de Raindrop",
      });
    }

    console.log(
      `[sync-full] Total fetched: ${allBookmarks.length} across ${page + 1} pages`
    );

    // Batch lookup existing items
    const raindropIds = allBookmarks.map((b) => String(b._id)).filter(Boolean);
    const existingItems = await prisma.inboxItem.findMany({
      where: { userId, raindropId: { in: raindropIds } },
      select: { id: true, raindropId: true },
    });
    const existingSet = new Set(existingItems.map((i) => i.raindropId));

    console.log(
      `[sync-full] ${existingSet.size} already in DB, ${raindropIds.length - existingSet.size} potentially new`
    );

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let processed = 0;

    for (const bookmark of allBookmarks) {
      processed++;
      if (processed % 100 === 0) {
        console.log(`[sync-full] Progress: ${processed}/${allBookmarks.length}`);
      }

      if (!bookmark.link) {
        skipped++;
        continue;
      }

      const rdId = String(bookmark._id);

      if (existingSet.has(rdId)) {
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

      // New item
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

    // Date range
    const dates = allBookmarks
      .map((b) => b.created)
      .filter(Boolean)
      .sort();
    const dateRange =
      dates.length > 0
        ? `${dates[0]} — ${dates[dates.length - 1]}`
        : "sin fechas";

    console.log(
      `[sync-full] Done: ${created} created, ${updated} updated, ${skipped} skipped`
    );

    return NextResponse.json({
      success: true,
      created,
      updated,
      skipped,
      totalFetched: allBookmarks.length,
      dateRange,
      message: `${created} nuevos, ${updated} actualizados, ${skipped} omitidos de ${allBookmarks.length} fetched`,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack?.substring(0, 500) : undefined;

    if (msg === "No autenticado") {
      return NextResponse.json(
        { success: false, error: "No autenticado" },
        { status: 401 }
      );
    }
    if (msg.includes("Token de Raindrop")) {
      return NextResponse.json(
        { success: false, error: msg },
        { status: 400 }
      );
    }

    console.error("[sync-full] Fatal:", msg, stack);
    return NextResponse.json(
      { success: false, error: msg, stack },
      { status: 500 }
    );
  }
}
