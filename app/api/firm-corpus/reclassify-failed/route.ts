// =============================================================================
// /api/firm-corpus/reclassify-failed — Re-classify documents with errors
// Uses new M.2a-PLUS pipeline: Stage A (Flash) + Stage B (Pro)
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { getFirmCorpus } from "@/lib/services/firm-corpus";
import { runStageA } from "@/lib/firm-corpus/stage-a-classifier";
import { runStageB } from "@/lib/firm-corpus/stage-b-comprehension";
import { persistDocument, sanitizeForPostgres } from "@/lib/firm-corpus/persist";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "No autenticado", needsGoogleAuth: true }, { status: 401 });
    }

    const accessToken = (session.user as Record<string, unknown>).accessToken as string;
    const corpus = await getFirmCorpus();

    const failedDocs = await prisma.corpusDocument.findMany({
      where: { corpusId: corpus.id, processingError: { not: null } },
      select: { id: true, driveFileId: true, driveFileName: true, driveFileUrl: true, mimeType: true, rawContent: true },
    });

    if (failedDocs.length === 0) {
      return NextResponse.json({ success: true, total: 0, reclassified: 0, stillFailing: 0 });
    }

    console.log(`[corpus-reclassify] Starting reclassification of ${failedDocs.length} failed documents`);

    let reclassified = 0;
    let stillFailing = 0;

    for (const doc of failedDocs) {
      try {
        let content = doc.rawContent || "";

        // Re-fetch from Drive if no raw content
        if (!content && accessToken) {
          try {
            let exportUrl: string;
            if (doc.mimeType.includes("google-apps")) {
              exportUrl = doc.mimeType.includes("spreadsheet")
                ? `https://www.googleapis.com/drive/v3/files/${doc.driveFileId}/export?mimeType=text/csv`
                : `https://www.googleapis.com/drive/v3/files/${doc.driveFileId}/export?mimeType=text/plain`;
            } else {
              exportUrl = `https://www.googleapis.com/drive/v3/files/${doc.driveFileId}?alt=media`;
            }
            const response = await fetch(exportUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
            if (response.ok) content = sanitizeForPostgres(await response.text());
          } catch {
            console.warn(`[corpus-reclassify] Could not re-fetch ${doc.driveFileName}`);
          }
        }

        if (!content) {
          stillFailing++;
          continue;
        }

        const stageA = await runStageA(content, doc.driveFileName);
        const stageB = await runStageB(content, doc.driveFileName, stageA);

        await persistDocument(
          { id: doc.driveFileId, name: doc.driveFileName, mimeType: doc.mimeType, webViewLink: doc.driveFileUrl },
          content,
          stageA,
          stageB,
          corpus.id
        );

        reclassified++;
        console.log(`[corpus-reclassify] SUCCESS: ${doc.driveFileName} -> ${stageA.documentType} / ${stageB.provenance}`);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`[corpus-reclassify] ERROR on ${doc.driveFileName}: ${msg}`);
        stillFailing++;
        await prisma.corpusDocument.update({
          where: { id: doc.id },
          data: { processingError: sanitizeForPostgres(`Reclassification failed: ${msg}`), lastProcessedAt: new Date() },
        }).catch(() => {});
      }
    }

    console.log(`[corpus-reclassify] COMPLETE: ${reclassified} reclassified, ${stillFailing} still failing`);
    return NextResponse.json({ success: true, total: failedDocs.length, reclassified, stillFailing });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
