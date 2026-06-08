// =============================================================================
// CORPUS EMBED-JOB/TICK — Cron handler: embebe 1 batch de docs PENDING por invocacion
// Llamado por Vercel Cron cada 2 minutos. La cola es embeddingStatus = PENDING.
// Idempotente: borra los chunks viejos del doc antes de re-insertar.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { chunkText } from "@/lib/corpus/chunk";
import { embedDocuments, toVectorLiteral } from "@/lib/clients/embeddings";

export const maxDuration = 300;

const BATCH_DOCS = 5;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const docs = await prisma.corpusDocument.findMany({
      where: { embeddingStatus: "PENDING", rawContent: { not: null }, archived: false },
      orderBy: { id: "asc" },
      take: BATCH_DOCS,
    });

    if (docs.length === 0) {
      return NextResponse.json({ message: "No hay documentos PENDING" });
    }

    let processed = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const doc of docs) {
      try {
        const raw = doc.rawContent || "";
        if (raw.length < 50) {
          await prisma.corpusDocument.update({
            where: { id: doc.id },
            data: { embeddingStatus: "FAILED", processingError: `rawContent muy corto (${raw.length})` },
          });
          failed++;
          continue;
        }

        const chunks = chunkText(raw);
        if (chunks.length === 0) {
          await prisma.corpusDocument.update({
            where: { id: doc.id },
            data: { embeddingStatus: "FAILED", processingError: "chunkText devolvio 0 chunks" },
          });
          failed++;
          continue;
        }

        const vectors = await embedDocuments(chunks.map((c) => c.content));

        // Idempotencia: borrar chunks previos del doc
        await prisma.corpusChunk.deleteMany({ where: { documentId: doc.id } });

        // Insertar por SQL crudo (columna vector). Una fila por chunk.
        for (let i = 0; i < chunks.length; i++) {
          const c = chunks[i];
          const vecLiteral = toVectorLiteral(vectors[i]);
          await prisma.$executeRaw`
            INSERT INTO "CorpusChunk"
              ("documentId", "ordinal", "content", "tokenCount", "embedding", "corpusId", "documentType", "industry", "provenance")
            VALUES
              (${doc.id}, ${c.ordinal}, ${c.content}, ${c.tokenCount}, ${vecLiteral}::vector,
               ${doc.corpusId}, ${doc.documentType}::"CorpusDocumentType", ${doc.industry},
               ${doc.provenance}::"Provenance")
          `;
        }

        await prisma.corpusDocument.update({
          where: { id: doc.id },
          data: { embeddingStatus: "READY", processingError: null, lastProcessedAt: new Date() },
        });
        console.log(`[embed-tick] OK ${doc.driveFileName}: ${chunks.length} chunks`);
        processed++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        await prisma.corpusDocument.update({
          where: { id: doc.id },
          data: { embeddingStatus: "FAILED", processingError: msg.slice(0, 1000) },
        }).catch(() => {});
        errors.push(`${doc.driveFileName}: ${msg}`);
        console.error(`[embed-tick] FAIL ${doc.driveFileName}: ${msg}`);
        failed++;
      }
    }

    return NextResponse.json({ success: true, processed, failed, errors, docsInBatch: docs.length });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[embed-tick] FATAL: ${msg}`);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
