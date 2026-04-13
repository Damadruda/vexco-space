// =============================================================================
// REPROCESS-JOB/TICK — Cron handler: processes 1 batch of 5 docs per invocation
// Called by Vercel Cron every 2 minutes
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
const BATCH_SIZE = 5;

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

export async function GET(req: NextRequest) {
  // Verify Vercel Cron authentication
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Find active job (PENDING or RUNNING)
    const job = await prisma.corpusReprocessJob.findFirst({
      where: { status: { in: ["PENDING", "RUNNING"] } },
      orderBy: { createdAt: "asc" },
    });

    if (!job) {
      return NextResponse.json({ message: "No hay jobs activos" });
    }

    // Transition PENDING → RUNNING on first tick
    if (job.status === "PENDING") {
      await prisma.corpusReprocessJob.update({
        where: { id: job.id },
        data: { status: "RUNNING" },
      });
    }

    // Fetch batch of narrative documents
    const docs = await prisma.corpusDocument.findMany({
      where: {
        mimeType: { notIn: EXCLUDED_MIME_TYPES },
        rawContent: { not: null },
        ...(job.cursor ? { id: { gt: job.cursor } } : {}),
      },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
    });

    // No more docs → job completed
    if (docs.length === 0) {
      await prisma.corpusReprocessJob.update({
        where: { id: job.id },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          lastTickAt: new Date(),
        },
      });

      const activeFrameworks = await prisma.framework.count({
        where: { status: "ACTIVE" },
      });

      return NextResponse.json({
        message: "Job completado",
        jobId: job.id,
        totalProcessed: job.totalProcessed,
        totalFailed: job.totalFailed,
        activeFrameworks,
      });
    }

    let batchProcessed = 0;
    let batchFailed = 0;
    const batchErrors: string[] = [];

    for (const doc of docs) {
      try {
        const rawContent = doc.rawContent || "";
        if (rawContent.length < 50) {
          batchFailed++;
          batchErrors.push(
            `${doc.driveFileName}: content too short (${rawContent.length} chars)`
          );
          continue;
        }

        // Stage A: Flash classification
        const stageA = await runStageA(rawContent, doc.driveFileName);

        // Stage B: Pro comprehension
        const stageB = await runStageB(rawContent, doc.driveFileName, stageA);

        // Update document
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

        // Upsert frameworks (confidence >= 0.7)
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
          `[cron-tick] OK ${doc.driveFileName}: ${stageB.provenance} / ${stageB.detectedFrameworks.filter((f) => f.confidence >= 0.7).length} fw`
        );
        batchProcessed++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        batchFailed++;
        batchErrors.push(`${doc.driveFileName}: ${msg}`);
        console.error(`[cron-tick] FAIL ${doc.driveFileName}: ${msg}`);
      }
    }

    // Update job state
    const lastDoc = docs[docs.length - 1];
    const existingErrors = Array.isArray(job.errors) ? job.errors : [];

    await prisma.corpusReprocessJob.update({
      where: { id: job.id },
      data: {
        cursor: lastDoc.id,
        totalProcessed: { increment: batchProcessed },
        totalFailed: { increment: batchFailed },
        totalBatches: { increment: 1 },
        errors: [...(existingErrors as string[]), ...batchErrors],
        lastTickAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      jobId: job.id,
      batch: job.totalBatches + 1,
      batchProcessed,
      batchFailed,
      newCursor: lastDoc.id,
      docsInBatch: docs.length,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[cron-tick] FATAL: ${msg}`);
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    );
  }
}
