// =============================================================================
// /api/firm-corpus/reclassify-failed — Re-classify documents with errors
// POST: re-runs classification on documents with processingError != null
// Does NOT delete documents — only updates classification fields
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { getFirmCorpus } from "@/lib/services/firm-corpus";
import {
  classifyDocument,
  sanitizeForPostgres,
  sanitizeJson,
  logSanitizationDelta,
} from "@/lib/services/corpus-importer";
import type { CorpusDocumentType, CorpusOutcome } from "@prisma/client";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { error: "No autenticado", needsGoogleAuth: true },
        { status: 401 }
      );
    }

    const accessToken = (session.user as Record<string, unknown>).accessToken as string;

    const corpus = await getFirmCorpus();

    // Find all documents with processing errors
    const failedDocs = await prisma.corpusDocument.findMany({
      where: {
        corpusId: corpus.id,
        processingError: { not: null },
      },
      select: {
        id: true,
        driveFileId: true,
        driveFileName: true,
        driveFileUrl: true,
        mimeType: true,
        rawContent: true,
      },
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

        // If rawContent is empty, try to re-fetch from Drive
        if (!content && accessToken) {
          try {
            let exportUrl: string;
            if (doc.mimeType.includes("google-apps")) {
              if (doc.mimeType.includes("spreadsheet")) {
                exportUrl = `https://www.googleapis.com/drive/v3/files/${doc.driveFileId}/export?mimeType=text/csv`;
              } else {
                exportUrl = `https://www.googleapis.com/drive/v3/files/${doc.driveFileId}/export?mimeType=text/plain`;
              }
            } else {
              exportUrl = `https://www.googleapis.com/drive/v3/files/${doc.driveFileId}?alt=media`;
            }

            const response = await fetch(exportUrl, {
              headers: { Authorization: `Bearer ${accessToken}` },
            });

            if (response.ok) {
              const rawText = await response.text();
              content = sanitizeForPostgres(rawText);
              logSanitizationDelta("rawContent(refetch)", doc.driveFileId, rawText, content);
            }
          } catch {
            console.warn(`[corpus-reclassify] Could not re-fetch ${doc.driveFileName} from Drive`);
          }
        }

        if (!content) {
          console.warn(`[corpus-reclassify] No content available for ${doc.driveFileName}, skipping`);
          stillFailing++;
          continue;
        }

        // Re-classify
        const classification = await classifyDocument(doc.driveFileName, content);

        const safeSummary = sanitizeForPostgres(classification.extractedSummary);
        const safeIndustry = classification.industry ? sanitizeForPostgres(classification.industry) : null;
        const safeGeography = classification.geography ? sanitizeForPostgres(classification.geography) : null;
        const safeCompanySize = classification.companySize ? sanitizeForPostgres(classification.companySize) : null;
        const safeEntities = sanitizeJson(classification.keyEntities as unknown as Record<string, unknown>);

        // Determine if classification actually succeeded
        const classificationFailed =
          classification.documentType === "UNCLASSIFIED" &&
          classification.extractedSummary.startsWith("Classification failed");

        await prisma.corpusDocument.update({
          where: { id: doc.id },
          data: {
            documentType: classification.documentType as CorpusDocumentType,
            industry: safeIndustry,
            geography: safeGeography,
            companySize: safeCompanySize,
            outcome: classification.outcome as CorpusOutcome | null,
            extractedSummary: safeSummary,
            keyEntities: safeEntities,
            rawContent: content || undefined, // Update rawContent if we re-fetched it
            embeddingStatus: classificationFailed ? "FAILED" : "PENDING",
            processingError: classificationFailed
              ? sanitizeForPostgres(classification.extractedSummary)
              : null,
            lastProcessedAt: new Date(),
          },
        });

        if (classificationFailed) {
          stillFailing++;
          console.warn(`[corpus-reclassify] Still failing: ${doc.driveFileName}`);
        } else {
          reclassified++;
          console.log(`[corpus-reclassify] SUCCESS: ${doc.driveFileName} → ${classification.documentType}`);
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`[corpus-reclassify] ERROR on ${doc.driveFileName}: ${msg}`);
        stillFailing++;

        // Update the error message
        await prisma.corpusDocument
          .update({
            where: { id: doc.id },
            data: {
              processingError: sanitizeForPostgres(`Reclassification failed: ${msg}`),
              lastProcessedAt: new Date(),
            },
          })
          .catch(() => {});
      }
    }

    console.log(
      `[corpus-reclassify] COMPLETE: ${reclassified} reclassified, ${stillFailing} still failing out of ${failedDocs.length}`
    );

    return NextResponse.json({
      success: true,
      total: failedDocs.length,
      reclassified,
      stillFailing,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[corpus-reclassify] API error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
