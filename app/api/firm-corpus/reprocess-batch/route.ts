// =============================================================================
// REPROCESS-BATCH — Cursor-paginated re-processing of corpus documents
// Fixes 504 timeout from /reprocess by processing in batches of 5
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runStageA } from "@/lib/firm-corpus/stage-a-classifier";
import { runStageB } from "@/lib/firm-corpus/stage-b-comprehension";
import { sanitizeForPostgres } from "@/lib/firm-corpus/persist";
import type { Provenance } from "@prisma/client";

export const maxDuration = 300;

const EXCLUDED_MIME_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "application/vnd.ms-excel",
];

function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function mapLifecycleStage(
  stage: string
): "OWN" | "EXTERNAL" | "ADOPTED" | "ADAPTED" | "DERIVED" {
  const valid = ["OWN", "EXTERNAL", "ADOPTED", "ADAPTED", "DERIVED"];
  return valid.includes(stage)
    ? (stage as "OWN" | "EXTERNAL" | "ADOPTED" | "ADAPTED" | "DERIVED")
    : "EXTERNAL";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const cursor: string | null = body.cursor ?? null;
    const batchSize: number = body.batchSize ?? 5;

    // Soft migration ONLY on first batch (cursor is null)
    let deprecatedCount = 0;
    if (!cursor) {
      const result = await prisma.framework.updateMany({
        where: { status: "ACTIVE" },
        data: { status: "DEPRECATED" },
      });
      deprecatedCount = result.count;
      console.log(
        `[reprocess-batch] First batch — ${deprecatedCount} frameworks DEPRECATED`
      );
    }

    // Fetch batch of narrative documents, cursor-paginated by id ASC
    const docs = await prisma.corpusDocument.findMany({
      where: {
        mimeType: { notIn: EXCLUDED_MIME_TYPES },
        rawContent: { not: null },
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      orderBy: { id: "asc" },
      take: batchSize,
    });

    if (docs.length === 0) {
      // No more documents — return final stats
      const activeFrameworks = await prisma.framework.count({
        where: { status: "ACTIVE" },
      });
      const deprecatedRemaining = await prisma.framework.count({
        where: { status: "DEPRECATED" },
      });

      return NextResponse.json({
        success: true,
        processed: 0,
        failed: 0,
        nextCursor: null,
        hasMore: false,
        message: "No hay mas documentos para procesar",
        stats: { activeFrameworks, deprecatedRemaining },
      });
    }

    const results = { processed: 0, failed: 0, errors: [] as string[] };

    for (const doc of docs) {
      try {
        const rawContent = doc.rawContent || "";
        if (rawContent.length < 50) {
          console.warn(
            `[reprocess-batch] Skipping ${doc.driveFileName}: content too short (${rawContent.length} chars)`
          );
          results.failed++;
          results.errors.push(
            `${doc.driveFileName}: content too short (${rawContent.length} chars)`
          );
          continue;
        }

        // Stage A: Flash classification
        const stageA = await runStageA(rawContent, doc.driveFileName);

        // Stage B: Pro comprehension (3-step provenance + strict framework detection)
        const stageB = await runStageB(rawContent, doc.driveFileName, stageA);

        // Update document with new results
        await prisma.corpusDocument.update({
          where: { id: doc.id },
          data: {
            extractedSummary: sanitizeForPostgres(stageB.extractedSummary),
            keyEntities: stageB.keyEntities.map((e) => ({
              name: sanitizeForPostgres(e.name),
              type: e.type,
            })),
            provenance: stageB.provenance as Provenance,
            lastProcessedAt: new Date(),
            processingError: null,
            embeddingStatus: "PENDING",
          },
        });

        // Upsert frameworks with confidence >= 0.7
        for (const fw of stageB.detectedFrameworks) {
          if (fw.confidence < 0.7) continue;

          const slug = slugify(fw.name);
          if (!slug) continue;

          const safeName = sanitizeForPostgres(fw.name);
          const safeOriginSource =
            sanitizeForPostgres(fw.originSource) || "Unknown";
          const safeOriginAuthor = fw.originAuthor
            ? sanitizeForPostgres(fw.originAuthor)
            : null;
          const safeHint = fw.componentsHint
            ? sanitizeForPostgres(fw.componentsHint)
            : `Framework detectado en: ${doc.driveFileName}`;
          const lifecycle = mapLifecycleStage(fw.lifecycleStage);

          const framework = await prisma.framework.upsert({
            where: { slug },
            create: {
              name: safeName,
              slug,
              originSource: safeOriginSource,
              originAuthor: safeOriginAuthor,
              lifecycleStage: lifecycle,
              originalDescription: safeHint,
              status: "ACTIVE",
            },
            update: {
              status: "ACTIVE",
              lifecycleStage: lifecycle,
              originSource: safeOriginSource,
            },
          });

          // Link framework to source document
          await prisma.frameworkSourceDocument.upsert({
            where: {
              frameworkId_documentId: {
                frameworkId: framework.id,
                documentId: doc.id,
              },
            },
            create: {
              frameworkId: framework.id,
              documentId: doc.id,
              confidence: fw.confidence,
            },
            update: {
              confidence: fw.confidence,
            },
          });
        }

        console.log(
          `[reprocess-batch] OK ${doc.driveFileName}: ${stageB.provenance} / ${stageB.detectedFrameworks.filter((f) => f.confidence >= 0.7).length} fw`
        );
        results.processed++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        results.failed++;
        results.errors.push(`${doc.driveFileName}: ${msg}`);
        console.error(`[reprocess-batch] FAIL ${doc.driveFileName}: ${msg}`);
      }
    }

    const lastDoc = docs[docs.length - 1];
    const hasMore = docs.length === batchSize;

    return NextResponse.json({
      success: true,
      ...results,
      deprecatedInThisBatch: deprecatedCount,
      nextCursor: hasMore ? lastDoc.id : null,
      hasMore,
      processedDocsInThisBatch: docs.length,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[reprocess-batch] FATAL: ${msg}`);
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    );
  }
}
