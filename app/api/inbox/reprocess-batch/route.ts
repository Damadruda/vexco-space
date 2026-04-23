import { NextRequest, NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { prisma } from "@/lib/db";
import { jinaClient } from "@/lib/clients/jina";
import { runInboxStageA } from "@/lib/inbox/stage-a-classifier";
import { runInboxStageB } from "@/lib/inbox/stage-b-analyzer";
import { getRecentCorrections } from "@/lib/inbox/corrections";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BATCH_SIZE = 5;

export async function POST(request: NextRequest) {
  try {
    const userId = await getDefaultUserId();
    const body = await request.json().catch(() => ({}));
    const limit = typeof body.limit === "number" ? Math.min(body.limit, 50) : 20;
    const onlyProcessed = body.onlyProcessed !== false;

    const items = await prisma.inboxItem.findMany({
      where: {
        userId,
        ...(onlyProcessed ? { status: "processed" } : {}),
      },
      include: { analysis: true },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    if (items.length === 0) {
      return NextResponse.json({ reprocessed: 0, failed: 0, items: [] });
    }

    const corrections = await getRecentCorrections(userId, 25);

    let reprocessed = 0;
    let failed = 0;
    const results: Array<{ id: string; status: "ok" | "error"; error?: string }> = [];

    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const chunk = items.slice(i, i + BATCH_SIZE);
      const chunkResults = await Promise.allSettled(
        chunk.map(async (item) => {
          try {
            let content = item.rawContent;
            if (item.sourceUrl && content.length < 500) {
              try {
                const jinaApiKey = process.env.JINA_API_KEY;
                const extracted = await jinaClient.extractContent(item.sourceUrl, jinaApiKey);
                if (extracted.content) content = extracted.content;
              } catch {}
            }

            const sourceTitle = item.sourceTitle ?? item.rawContent.slice(0, 80);
            const sourceUrl = item.sourceUrl ?? "";

            const stageA = await runInboxStageA(sourceTitle, sourceUrl, content, corrections);
            const stageB = await runInboxStageB(sourceTitle, sourceUrl, content, stageA);

            const analysisData = {
              summary: stageB.summary,
              keyInsights: stageB.keyInsights,
              suggestedTags: stageB.suggestedTags,
              category: stageA.category,
              sentiment: stageA.sentiment,
              relevanceScore: stageA.relevanceScore,
              rawAiResponse: JSON.stringify({ stageA, stageB }),
              modelUsed: "gemini-2.5-flash+gemini-2.5-pro",
            };

            if (item.analysis) {
              await prisma.analysisResult.update({
                where: { id: item.analysis.id },
                data: analysisData,
              });
            } else {
              await prisma.analysisResult.create({
                data: {
                  ...analysisData,
                  inboxItemId: item.id,
                },
              });
            }

            await prisma.inboxItem.update({
              where: { id: item.id },
              data: { status: "processed" },
            });

            return { id: item.id, status: "ok" as const };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return { id: item.id, status: "error" as const, error: msg };
          }
        })
      );

      for (const r of chunkResults) {
        if (r.status === "fulfilled") {
          results.push(r.value);
          if (r.value.status === "ok") reprocessed++;
          else failed++;
        } else {
          failed++;
          results.push({ id: "unknown", status: "error", error: String(r.reason) });
        }
      }
    }

    return NextResponse.json({
      reprocessed,
      failed,
      total: items.length,
      correctionsUsed: corrections.length,
      items: results,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[INBOX REPROCESS BATCH]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
