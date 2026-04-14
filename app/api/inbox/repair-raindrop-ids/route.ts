// =============================================================================
// REPAIR-RAINDROP-IDS — One-shot repair for items with raindropId="undefined"
// Matches InboxItem.sourceUrl against Raindrop API .link to backfill real _id.
// Idempotent: safe to re-run; only touches items with broken raindropId.
// =============================================================================

import { NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { prisma } from "@/lib/db";
import { raindropClient } from "@/lib/clients/raindrop";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PER_PAGE = 50;
const MAX_PAGES = 20; // safety: 1000 bookmarks max

export async function POST() {
  try {
    const userId = await getDefaultUserId();

    const prefs = await prisma.userPreferences.findUnique({ where: { userId } });
    if (!prefs?.raindropToken) {
      return NextResponse.json(
        { success: false, error: "Raindrop no configurado" },
        { status: 400 }
      );
    }

    // 1) Fetch all bookmarks from Raindrop (real ids + links)
    let allBookmarks: { _id: number; link: string }[] = [];
    let page = 0;
    while (page < MAX_PAGES) {
      const { items } = await raindropClient.getBookmarks(prefs.raindropToken, {
        collectionId: 0,
        page,
        perPage: PER_PAGE,
      });
      allBookmarks = allBookmarks.concat(
        items.map((b) => ({ _id: b._id, link: b.link }))
      );
      if (items.length < PER_PAGE) break;
      page++;
    }

    if (allBookmarks.length === 0) {
      return NextResponse.json({
        success: false,
        error: "No se pudieron obtener bookmarks de Raindrop",
      });
    }

    // 2) Build URL → _id lookup
    const urlToId = new Map<string, string>();
    for (const b of allBookmarks) {
      if (b.link && b._id) urlToId.set(b.link, String(b._id));
    }

    // 3) Find all broken items (raindropId="undefined" OR null)
    const brokenItems = await prisma.inboxItem.findMany({
      where: {
        userId,
        OR: [{ raindropId: "undefined" }, { raindropId: null }],
        sourceUrl: { not: null },
      },
      select: { id: true, sourceUrl: true },
    });

    // 4) Repair: backfill raindropId by sourceUrl lookup
    let repaired = 0;
    let unmatched = 0;
    const unmatchedSamples: string[] = [];
    const seenRaindropIds = new Set<string>();
    let skippedDuplicate = 0;

    for (const item of brokenItems) {
      if (!item.sourceUrl) {
        unmatched++;
        continue;
      }
      const realId = urlToId.get(item.sourceUrl);
      if (!realId) {
        unmatched++;
        if (unmatchedSamples.length < 5) unmatchedSamples.push(item.sourceUrl);
        continue;
      }

      // If two broken items share the same real raindropId (duplicate URL),
      // only repair the first; leave the second as "undefined" to be cleaned up
      // manually if needed. This avoids unique-constraint-style collisions
      // even though raindropId is not unique in the schema.
      if (seenRaindropIds.has(realId)) {
        skippedDuplicate++;
        continue;
      }
      seenRaindropIds.add(realId);

      await prisma.inboxItem.update({
        where: { id: item.id },
        data: { raindropId: realId },
      });
      repaired++;
    }

    return NextResponse.json({
      success: true,
      totalBrokenFound: brokenItems.length,
      raindropBookmarksFetched: allBookmarks.length,
      repaired,
      unmatched,
      skippedDuplicate,
      unmatchedSamples,
      message: `Reparados ${repaired} de ${brokenItems.length} items. ${unmatched} sin match en Raindrop (probablemente borrados allá). ${skippedDuplicate} saltados por URL duplicada.`,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[repair-raindrop-ids] Fatal:", msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
