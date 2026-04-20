// =============================================================================
// POST /api/firm-corpus/[id]/reprocess
// Re-ejecuta extract + Stage A + Stage B sobre un CorpusDocument existente.
// Reutiliza persistDocument: sobrescribe clasificación, summary, keyEntities,
// rawContent, provenance. Preserva curación humana (archived, reviewedAt,
// reviewedBy, customTags).
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { extractFileContent } from "@/lib/services/corpus-importer";
import { runStageA } from "@/lib/firm-corpus/stage-a-classifier";
import { runStageB } from "@/lib/firm-corpus/stage-b-comprehension";
import { persistDocument, sanitizeForPostgres } from "@/lib/firm-corpus/persist";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const accessToken = (session.user as Record<string, unknown>).accessToken as
      | string
      | undefined;
    if (!accessToken) {
      return NextResponse.json(
        { error: "No hay access token de Google en la sesión. Reingresá." },
        { status: 403 }
      );
    }

    const doc = await prisma.corpusDocument.findUnique({
      where: { id: params.id },
    });
    if (!doc) {
      return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
    }

    const driveFileRef = {
      id: doc.driveFileId,
      name: doc.driveFileName,
      mimeType: doc.mimeType,
      modifiedTime: doc.updatedAt.toISOString(),
      webViewLink: doc.driveFileUrl,
    };

    console.log(`[reprocess] Starting reprocess of ${doc.driveFileName} (${doc.id})`);

    try {
      const rawContentUnsafe = await extractFileContent(driveFileRef, accessToken);
      const rawContent = sanitizeForPostgres(rawContentUnsafe);

      let stageA;
      try {
        stageA = await runStageA(rawContent, doc.driveFileName);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[reprocess] STAGE_A_FAIL ${doc.driveFileName}: ${msg}`);
        stageA = {
          documentType: "UNCLASSIFIED" as const,
          industry: null,
          geography: null,
          outcome: null,
        };
      }

      const stageB = await runStageB(rawContent, doc.driveFileName, stageA);

      const updated = await persistDocument(
        driveFileRef,
        rawContent,
        stageA,
        stageB,
        doc.corpusId
      );

      console.log(
        `[reprocess] DONE ${doc.driveFileName}: ${updated.documentType} / ${updated.provenance} / summary ${updated.extractedSummary?.length ?? 0} chars`
      );

      return NextResponse.json({
        success: true,
        corpusDocumentId: updated.id,
        documentType: updated.documentType,
        provenance: updated.provenance,
        summaryLength: updated.extractedSummary?.length ?? 0,
      });
    } catch (pipelineError: unknown) {
      const msg = pipelineError instanceof Error ? pipelineError.message : String(pipelineError);
      console.error(`[reprocess] PIPELINE_FAIL ${doc.driveFileName}: ${msg}`);

      await prisma.corpusDocument.update({
        where: { id: doc.id },
        data: {
          embeddingStatus: "FAILED",
          processingError: sanitizeForPostgres(msg),
          lastProcessedAt: new Date(),
        },
      });

      return NextResponse.json({ error: msg }, { status: 500 });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[reprocess] FATAL: ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
