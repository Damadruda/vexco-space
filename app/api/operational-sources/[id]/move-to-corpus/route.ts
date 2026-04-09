import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { getFirmCorpus } from "@/lib/services/firm-corpus";
import { runStageA } from "@/lib/firm-corpus/stage-a-classifier";
import { runStageB } from "@/lib/firm-corpus/stage-b-comprehension";
import { persistDocument, sanitizeForPostgres } from "@/lib/firm-corpus/persist";
import { extractFileContent } from "@/lib/services/corpus-importer";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const accessToken = (session.user as Record<string, unknown>).accessToken as string;
    if (!accessToken) return NextResponse.json({ error: "Conecta Google Drive", needsGoogleAuth: true }, { status: 401 });

    const { id } = await params;
    const opSource = await prisma.operationalSource.findUnique({ where: { id } });
    if (!opSource) return NextResponse.json({ error: "Fuente no encontrada" }, { status: 404 });

    const corpus = await getFirmCorpus();

    // Check if archived corpus doc exists
    const existingDoc = await prisma.corpusDocument.findUnique({ where: { driveFileId: opSource.driveFileId } });

    let docId: string;

    if (existingDoc) {
      // Unarchive instead of duplicating
      await prisma.corpusDocument.update({ where: { id: existingDoc.id }, data: { archived: false } });
      docId = existingDoc.id;
    } else {
      // Full narrative pipeline on this single file
      const rawContent = sanitizeForPostgres(
        await extractFileContent(
          { id: opSource.driveFileId, name: opSource.driveFileName, mimeType: opSource.driveFileMimeType, modifiedTime: new Date().toISOString() },
          accessToken
        )
      );

      const stageA = await runStageA(rawContent, opSource.driveFileName);
      const stageB = await runStageB(rawContent, opSource.driveFileName, stageA);
      const doc = await persistDocument(
        { id: opSource.driveFileId, name: opSource.driveFileName, mimeType: opSource.driveFileMimeType },
        rawContent,
        stageA,
        stageB,
        corpus.id
      );
      docId = doc.id;
    }

    // Delete operational source
    await prisma.operationalSource.delete({ where: { id } });

    return NextResponse.json({ docId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
