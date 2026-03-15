// =============================================================================
// VEXCO-LAB ENGINE — INSPIRATION LAYER (Raindrop)
// Feeds curated content from user's Raindrop inbox to agents with usesRaindrop.
// Only returns items that have been processed (have AnalysisResult).
// =============================================================================

import { prisma } from "@/lib/db";

// ─── getInspirationContext ────────────────────────────────────────────────────

export async function getInspirationContext(
  userId: string,
  keywords: string[]
): Promise<string> {
  if (!keywords.length) return "";

  const keywordsLower = keywords.map((k) => k.toLowerCase());

  // Load processed inbox items with their analysis
  const items = await prisma.inboxItem.findMany({
    where: {
      userId,
      sourceUrl: { not: null },
      status: "processed",
    },
    include: { analysis: true },
    orderBy: { createdAt: "desc" },
    take: 100, // local pool to filter from
  });

  // Score each item by keyword match
  const scored = items
    .filter((item) => item.analysis !== null)
    .map((item) => {
      const titleText = (item.sourceTitle ?? item.rawContent.slice(0, 120)).toLowerCase();
      const tags = (item.analysis?.suggestedTags ?? []).map((t) => t.toLowerCase());

      const matchCount = keywordsLower.filter(
        (kw) => titleText.includes(kw) || tags.some((tag) => tag.includes(kw))
      ).length;

      return {
        item,
        matchCount,
        relevanceScore: item.analysis?.relevanceScore ?? 0,
      };
    })
    .filter((s) => s.matchCount > 0)
    .sort((a, b) =>
      b.matchCount !== a.matchCount
        ? b.matchCount - a.matchCount
        : b.relevanceScore - a.relevanceScore
    )
    .slice(0, 5);

  if (!scored.length) return "";

  const lines = scored.map((s, i) => {
    const title = s.item.sourceTitle ?? s.item.rawContent.slice(0, 80);
    const summary = s.item.analysis?.summary ?? "";
    const url = s.item.sourceUrl ?? "";
    return `${i + 1}. ${title} — ${summary}${url ? ` (Fuente: ${url})` : ""}`;
  });

  return [
    "REFERENCIAS DE INSPIRACIÓN (publicaciones curadas por el usuario):",
    ...lines,
  ].join("\n");
}
