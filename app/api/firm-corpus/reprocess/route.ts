// =============================================================================
// REPROCESS — Re-run Stage A + B on all narrative corpus documents
// Soft migration: marks existing frameworks DEPRECATED, re-detected ones become ACTIVE
// =============================================================================

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runStageA } from "@/lib/firm-corpus/stage-a-classifier";
import { runStageB } from "@/lib/firm-corpus/stage-b-comprehension";
import { sanitizeForPostgres } from "@/lib/firm-corpus/persist";
import type { Provenance } from "@prisma/client";

export const maxDuration = 300;

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

export async function POST() {
  try {
    // PASO 1: Soft migration — mark all current frameworks as DEPRECATED
    const deprecatedCount = await prisma.framework.updateMany({
      where: { status: "ACTIVE" },
      data: { status: "DEPRECATED" },
    });

    console.log(
      `[reprocess] ${deprecatedCount.count} frameworks marcados DEPRECATED`
    );

    // PASO 2: Get narrative corpus documents (exclude xlsx/csv)
    const docs = await prisma.corpusDocument.findMany({
      where: {
        mimeType: {
          notIn: [
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "text/csv",
            "application/vnd.ms-excel",
          ],
        },
        rawContent: { not: null },
      },
    });

    console.log(
      `[reprocess] Procesando ${docs.length} documentos (xlsx/csv excluidos)`
    );

    const results = {
      processed: 0,
      failed: 0,
      errors: [] as string[],
    };

    // PASO 3: Re-process Stage A + Stage B in series (avoid Gemini rate limits)
    for (const doc of docs) {
      try {
        const rawContent = doc.rawContent || "";
        if (rawContent.length < 50) {
          console.warn(
            `[reprocess] Skipping ${doc.driveFileName}: content too short (${rawContent.length} chars)`
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

        // Update document with new Stage B results
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

        // Upsert frameworks detected with confidence >= 0.7
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
          `[reprocess] OK ${doc.driveFileName}: ${stageB.provenance} / ${stageB.detectedFrameworks.filter((f) => f.confidence >= 0.7).length} frameworks`
        );
        results.processed++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        results.failed++;
        results.errors.push(`${doc.driveFileName}: ${msg}`);
        console.error(`[reprocess] FAIL ${doc.driveFileName}: ${msg}`);
      }
    }

    // PASO 4: Final stats
    const activeFrameworks = await prisma.framework.count({
      where: { status: "ACTIVE" },
    });
    const deprecatedRemaining = await prisma.framework.count({
      where: { status: "DEPRECATED" },
    });

    return NextResponse.json({
      success: true,
      ...results,
      stats: {
        activeFrameworks,
        deprecatedRemaining,
        message:
          activeFrameworks >= 8 && activeFrameworks <= 12
            ? "Framework count en rango esperado (8-12)"
            : `Framework count fuera de rango: ${activeFrameworks} (esperado 8-12)`,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[reprocess] FATAL: ${msg}`);
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    );
  }
}
