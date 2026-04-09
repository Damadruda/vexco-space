import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { detectOperationalKind } from "@/lib/firm-corpus/file-router";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const { id } = await params;
    const doc = await prisma.corpusDocument.findUnique({ where: { id } });
    if (!doc) return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });

    // Archive the corpus document
    await prisma.corpusDocument.update({ where: { id }, data: { archived: true } });

    // Create operational source
    const opSource = await prisma.operationalSource.upsert({
      where: { driveFileId: doc.driveFileId },
      create: {
        driveFileId: doc.driveFileId,
        driveFileName: doc.driveFileName,
        driveFileMimeType: doc.mimeType,
        detectedKind: detectOperationalKind(doc.driveFileName),
        status: "PENDING",
      },
      update: { lastSeenAt: new Date(), driveFileName: doc.driveFileName },
    });

    return NextResponse.json({ archivedDocId: doc.id, newOperationalSourceId: opSource.id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
