// =============================================================================
// VEXCO-LAB — BACKGROUND RAINDROP SYNC + AUTO-ANALYSIS
// Fire-and-forget: import bookmarks → Jina extraction → Gemini analysis.
// Used by: sync-raindrop route, session route, debate route.
// =============================================================================

import { GoogleGenAI } from "@google/genai";
import { prisma } from "@/lib/db";
import { raindropClient } from "@/lib/clients/raindrop";
import { jinaClient } from "@/lib/clients/jina";

const ONE_HOUR_MS = 60 * 60 * 1_000;
const MAX_ITEMS_PER_SYNC = 10;

const ANALYSIS_PROMPT = (
  sourceTitle: string,
  sourceUrl: string,
  content: string
) => `Eres un analista estratégico de negocios. Analiza el siguiente contenido y devuelve un JSON con esta estructura exacta:

{
  "summary": "resumen ejecutivo en 2-3 oraciones, tono C-Level, directo",
  "keyInsights": ["insight 1", "insight 2", "insight 3"],
  "suggestedTags": ["tag1", "tag2", "tag3"],
  "category": "project|trend|discovery|noise",
  "sentiment": "positive|negative|neutral|mixed",
  "relevanceScore": 0.0
}

Reglas:
- Escribe con oraciones cortas e impactantes. Voz activa.
- Cero jerga o palabras como "sumérgete", "tapiz", "crucial", "descubre".
- "noise" = contenido irrelevante para decisiones de negocio.
- relevanceScore: 1.0 = altamente relevante para estrategia B2B.
- Devuelve SOLO el JSON, sin markdown ni explicaciones adicionales.

CONTENIDO A ANALIZAR:
Título: ${sourceTitle}
URL: ${sourceUrl}
Contenido: ${content.slice(0, 25_000)}`;

// ─── Core sync: import bookmarks + analyze new items ─────────────────────────

export async function runRaindropSync(
  userId: string,
  raindropToken: string,
  collectionId?: number
): Promise<{ imported: number; skipped: number; analyzed: number; errors: number }> {
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

  // ── Batch dedup: fetch all existing URLs for this user in one query ────
  const bookmarkUrls = allBookmarks
    .map((b) => b.link)
    .filter(Boolean);

  const existingItems = await prisma.inboxItem.findMany({
    where: { userId, sourceUrl: { in: bookmarkUrls } },
    select: { sourceUrl: true },
  });
  const existingUrlSet = new Set(existingItems.map((i) => i.sourceUrl));

  let imported = 0;
  let skipped = 0;
  let errors = 0;
  const newItemIds: string[] = [];

  for (const bookmark of allBookmarks) {
    if (!bookmark.link) {
      skipped++;
      continue;
    }

    if (existingUrlSet.has(bookmark.link)) {
      skipped++;
      continue;
    }

    try {
      const item = await prisma.inboxItem.create({
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
      newItemIds.push(item.id);
      imported++;
      // Add to set to avoid duplicates within the same sync batch
      existingUrlSet.add(bookmark.link);
    } catch {
      errors++;
    }
  }

  await prisma.userPreferences.update({
    where: { userId },
    data: { raindropLastSync: new Date() },
  });

  // Auto-analyze up to MAX_ITEMS_PER_SYNC new items
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey || newItemIds.length === 0) {
    return { imported, skipped, analyzed: 0, errors };
  }

  const toAnalyze = newItemIds.slice(0, MAX_ITEMS_PER_SYNC);
  const items_ = await prisma.inboxItem.findMany({
    where: { id: { in: toAnalyze } },
  });

  const results = await Promise.allSettled(
    items_.map(async (item) => {
      let content = item.rawContent;

      // Enrich via Jina if content is short
      if (item.sourceUrl && content.length < 500) {
        try {
          const jinaApiKey = process.env.JINA_API_KEY;
          const extracted = await jinaClient.extractContent(item.sourceUrl, jinaApiKey);
          if (extracted.content) content = extracted.content;
        } catch {
          // Jina failed — continue with rawContent
        }
      }

      const ai = new GoogleGenAI({ apiKey });
      const prompt = ANALYSIS_PROMPT(
        item.sourceTitle ?? item.rawContent.slice(0, 80),
        item.sourceUrl ?? "",
        content
      );

      const result = await ai.models.generateContent({
        model: "gemini-2.5-pro",
        contents: prompt,
      });
      const responseText = result.text || "";
      const cleaned = responseText.replace(/```json\n?|\n?```/g, "").trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON in Gemini response");

      const aiData = JSON.parse(jsonMatch[0]) as {
        summary: string;
        keyInsights: string[];
        suggestedTags: string[];
        category: string;
        sentiment: string;
        relevanceScore: number;
      };

      await prisma.analysisResult.upsert({
        where: { inboxItemId: item.id },
        create: {
          inboxItemId: item.id,
          summary: aiData.summary ?? "",
          keyInsights: aiData.keyInsights ?? [],
          suggestedTags: aiData.suggestedTags ?? [],
          category: aiData.category ?? "noise",
          sentiment: aiData.sentiment ?? "neutral",
          relevanceScore: aiData.relevanceScore ?? 0,
          rawAiResponse: responseText,
          modelUsed: "gemini-2.5-pro",
          processingTimeMs: 0,
        },
        update: {
          summary: aiData.summary ?? "",
          keyInsights: aiData.keyInsights ?? [],
          suggestedTags: aiData.suggestedTags ?? [],
          category: aiData.category ?? "noise",
          sentiment: aiData.sentiment ?? "neutral",
          relevanceScore: aiData.relevanceScore ?? 0,
          rawAiResponse: responseText,
          modelUsed: "gemini-2.5-pro",
          processingTimeMs: 0,
          updatedAt: new Date(),
        },
      });

      await prisma.inboxItem.update({
        where: { id: item.id },
        data: { status: "processed" },
      });
    })
  );

  const analyzed = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;
  if (failed > 0) {
    console.warn(`[RAINDROP-SYNC] ${failed} items failed analysis`);
  }

  return { imported, skipped, analyzed, errors };
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
