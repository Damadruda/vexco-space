import { NextRequest, NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { prisma } from "@/lib/db";
import { jinaClient } from "@/lib/clients/jina";
import { runInboxStageA } from "@/lib/inbox/stage-a-classifier";
import { runInboxStageB } from "@/lib/inbox/stage-b-analyzer";
import { getRecentCorrections } from "@/lib/inbox/corrections";
import { embedDocuments, toVectorLiteral } from "@/lib/clients/embeddings";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await getDefaultUserId();

    const item = await prisma.inboxItem.findFirst({
      where: { id: params.id, userId },
      include: { analysis: true },
    });

    if (!item) {
      return NextResponse.json(
        { error: "Item no encontrado o no autorizado" },
        { status: 404 }
      );
    }

    let content = item.rawContent;
    const processingStart = Date.now();

    if (item.sourceUrl && item.rawContent.length < 500) {
      try {
        const jinaApiKey = process.env.JINA_API_KEY;
        const extracted = await jinaClient.extractContent(item.sourceUrl, jinaApiKey);
        if (extracted.content) {
          content = extracted.content;
        }
      } catch (jinaError) {
        console.warn("[INBOX ANALYZE] Jina extraction failed, using rawContent:", jinaError);
      }
    }

    const sourceTitle = item.sourceTitle ?? item.rawContent.slice(0, 80);
    const sourceUrl = item.sourceUrl ?? "";

    const corrections = await getRecentCorrections(userId, 25);
    const stageA = await runInboxStageA(sourceTitle, sourceUrl, content, corrections);

    const stageB = await runInboxStageB(sourceTitle, sourceUrl, content, stageA);

    const processingTimeMs = Date.now() - processingStart;

    const analysisData = {
      summary: stageB.summary,
      keyInsights: stageB.keyInsights,
      suggestedTags: stageB.suggestedTags,
      category: stageA.category,
      sentiment: stageA.sentiment,
      relevanceScore: stageA.relevanceScore,
      resourceType: stageB.resourceType ?? null,
      capability: stageB.capability ?? null,
      rawAiResponse: JSON.stringify({ stageA, stageB }),
      modelUsed: "gemini-2.5-flash+gemini-2.5-pro",
      processingTimeMs,
    };

    let analysis;
    if (item.analysis) {
      analysis = await prisma.analysisResult.update({
        where: { id: item.analysis.id },
        data: analysisData,
      });
    } else {
      analysis = await prisma.analysisResult.create({
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

    // ── Embeber recurso curado (solo REFERENCE/TOOL) ──
    try {
      const rType = stageB.resourceType;
      if (rType === "TOOL" || rType === "REFERENCE") {
        const textToEmbed =
          stageB.capability && stageB.capability.length > 0
            ? `${sourceTitle}. ${stageB.capability}`
            : `${sourceTitle}. ${stageB.summary}`;
        const [vec] = await embedDocuments([textToEmbed]);
        const vecLiteral = toVectorLiteral(vec);
        await prisma.$executeRaw`
          UPDATE "AnalysisResult"
          SET "embedding" = ${vecLiteral}::vector, "embeddingStatus" = 'READY'
          WHERE "id" = ${analysis.id}
        `;
      } else {
        await prisma.analysisResult.update({
          where: { id: analysis.id },
          data: { embeddingStatus: "SKIPPED" },
        });
      }
    } catch (embErr) {
      console.warn("[INBOX ANALYZE] embedding failed (non-fatal):", embErr);
      await prisma.analysisResult
        .update({ where: { id: analysis.id }, data: { embeddingStatus: "FAILED" } })
        .catch(() => {});
    }

    return NextResponse.json({
      analysis,
      meta: {
        stageA,
        processingTimeMs,
        correctionsUsed: corrections.length,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[INBOX ANALYZE] Error:", msg);
    try {
      await prisma.inboxItem.update({
        where: { id: params.id },
        data: { status: "unprocessed" },
      });
    } catch {}
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
