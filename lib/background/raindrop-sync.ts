// =============================================================================
// VEXCO-LAB — BACKGROUND RAINDROP SYNC (auto-analyze DESACTIVADO)
//
// Estado transitorio (abril 2026): este módulo importa bookmarks de Raindrop
// pero NO los analiza. Los items quedan en status="unprocessed" y Diego los
// analiza manualmente desde la UI del Inbox o vía /api/inbox/reprocess-batch,
// que usa el pipeline nuevo Stage A + Stage B (lib/inbox/).
//
// El pipeline viejo single-shot (gemini-3.1-pro-preview + prompt hardcoded)
// se eliminó en este hotfix porque violaba el principio M.2a-PLUS documentado
// en CLAUDE.md sección 8.5 y alucinaba ~40% en campos narrativos.
//
// TODO (Sprint Raindrop Sync Alignment): refactorizar para invocar
// runStageA + runStageB de lib/inbox/ directamente, manteniendo el patrón
// M.2a-PLUS end-to-end (incluyendo consumo de InboxCorrection).
// =============================================================================

import { prisma } from "@/lib/db";
import { raindropClient } from "@/lib/clients/raindrop";

const ONE_HOUR_MS = 60 * 60 * 1_000;

// ─── Core sync: import bookmarks only (no auto-analyze) ──────────────────────

export async function runRaindropSync(
  userId: string,
  raindropToken: string,
  collectionId?: number
): Promise<{ created: number; updated: number; skipped: number; analyzed: number; errors: number }> {
  // ── Fetch ALL bookmarks with pagination ────────────────────────────────
  const PER_PAGE = 50;
  const MAX_PAGES = 10; // safety limit: 500 bookmarks max
  let allBookmarks: Awaited<ReturnType<typeof raindropClient.getBookmarks>>["items"] = [];
  let page = 0;

  while (page < MAX_PAGES) {
    const { items: pageItems } = await raindropClient.getBookmarks(raindropToken, {
      collectionId,
      page,
      perPage: PER_PAGE,
    });
    allBookmarks = [...allBookmarks, ...pageItems];
    if (pageItems.length < PER_PAGE) break; // last page
    page++;
  }

  console.log(`[raindrop-sync] Fetched ${allBookmarks.length} bookmarks across ${page + 1} pages`);
  if (allBookmarks.length > 0) {
    const dates = allBookmarks.slice(0, 5).map((b) => b.created);
    console.log(`[raindrop-sync] First 5 dates (newest first):`, dates);
  }

  // ── Batch dedup: fetch all existing items by raindropId in one query ────
  const raindropIds = allBookmarks
    .map((b) => String(b._id))
    .filter(Boolean);

  const existingItems = await prisma.inboxItem.findMany({
    where: { userId, raindropId: { in: raindropIds } },
    select: { id: true, raindropId: true, sourceTitle: true, tags: true },
  });
  const existingByRaindropId = new Map(
    existingItems.map((i) => [i.raindropId, i])
  );

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const bookmark of allBookmarks) {
    if (!bookmark.link) {
      skipped++;
      continue;
    }

    const rdId = String(bookmark._id);
    const existing = existingByRaindropId.get(rdId);

    if (existing) {
      // Already exists — update ONLY metadata (tags, title, URL, rawContent)
      // NEVER touch: status, category, relevance, projectId, analysis
      const tagsChanged = JSON.stringify(existing.tags) !== JSON.stringify(bookmark.tags ?? []);
      const titleChanged = existing.sourceTitle !== bookmark.title;

      if (tagsChanged || titleChanged) {
        try {
          await prisma.inboxItem.update({
            where: { id: existing.id },
            data: {
              tags: bookmark.tags ?? [],
              sourceUrl: bookmark.link,
              sourceTitle: bookmark.title,
              rawContent: bookmark.excerpt || bookmark.title,
            },
          });
          updated++;
        } catch (err) {
          console.error(`[RAINDROP SYNC] Error updating bookmark ${bookmark._id}:`, err);
          errors++;
        }
      } else {
        skipped++;
      }
      continue;
    }

    // New item — create as unprocessed (no auto-analyze)
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
    } catch (err) {
      console.error(`[RAINDROP SYNC] Error creating bookmark ${bookmark._id}:`, err);
      errors++;
    }
  }

  console.log(`[raindrop-sync] Results: ${created} created, ${updated} updated, ${skipped} skipped, ${errors} errors (auto-analyze disabled)`);

  await prisma.userPreferences.update({
    where: { userId },
    data: { raindropLastSync: new Date() },
  });

  // analyzed: 0 hardcoded — el pipeline de análisis automático está desactivado.
  // Los items entran como unprocessed y se analizan bajo demanda desde la UI
  // o vía /api/inbox/reprocess-batch (Stage A + Stage B).
  return { created, updated, skipped, analyzed: 0, errors };
}

// ─── Trigger: only sync if token exists and last sync > 1h ago ───────────────

export async function triggerRaindropSyncIfNeeded(userId: string): Promise<void> {
  try {
    const prefs = await prisma.userPreferences.findUnique({ where: { userId } });
    if (!prefs?.raindropToken) return;

    const oneHourAgo = new Date(Date.now() - ONE_HOUR_MS);
    if (prefs.raindropLastSync && prefs.raindropLastSync > oneHourAgo) return;

    await runRaindropSync(userId, prefs.raindropToken);
  } catch (err) {
    console.warn("[RAINDROP-SYNC] Background sync failed:", err);
  }
}
