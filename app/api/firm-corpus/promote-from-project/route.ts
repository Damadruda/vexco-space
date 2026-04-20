// =============================================================================
// POST /api/firm-corpus/promote-from-project
// Promueve un DriveDocSummary específico al Firm Corpus.
// El CorpusDocument resultante es autónomo (sin FK al proyecto origen).
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { getFirmCorpus } from "@/lib/services/firm-corpus";
import { promoteSingleFile } from "@/lib/services/corpus-importer";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface DriveFileMeta {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  webViewLink?: string;
  size?: string;
}

async function fetchDriveFileMetadata(
  fileId: string,
  accessToken: string
): Promise<DriveFileMeta> {
  const fields = encodeURIComponent("id,name,mimeType,modifiedTime,webViewLink,size");
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=${fields}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Drive API ${res.status}: no se pudo leer metadata del archivo`);
  }
  return (await res.json()) as DriveFileMeta;
}

export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { driveFileId, projectId } = body as {
      driveFileId?: string;
      projectId?: string;
    };

    if (!driveFileId || !projectId) {
      return NextResponse.json(
        { error: "driveFileId y projectId son requeridos" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });
    if (!user) {
      return NextResponse.json({ error: "User no encontrado" }, { status: 404 });
    }

    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: user.id },
      select: { id: true },
    });
    if (!project) {
      return NextResponse.json(
        { error: "Proyecto no encontrado o sin acceso" },
        { status: 404 }
      );
    }

    const summary = await prisma.driveDocSummary.findUnique({
      where: { projectId_driveFileId: { projectId, driveFileId } },
    });
    if (!summary) {
      return NextResponse.json(
        { error: "El archivo no está vinculado al proyecto" },
        { status: 404 }
      );
    }

    const existing = await prisma.corpusDocument.findUnique({
      where: { driveFileId },
      select: { id: true, reviewedAt: true, archived: true },
    });
    if (existing) {
      return NextResponse.json(
        {
          error: "already_in_corpus",
          message: "Este archivo ya está en el Firm Corpus.",
          corpusDocumentId: existing.id,
          reviewed: !!existing.reviewedAt,
          archived: existing.archived,
        },
        { status: 409 }
      );
    }

    const fileMeta = await fetchDriveFileMetadata(driveFileId, accessToken);
    const corpus = await getFirmCorpus();
    const result = await promoteSingleFile(fileMeta, accessToken, corpus.id);

    return NextResponse.json({
      success: true,
      corpusDocumentId: result.corpusDocumentId,
      routed: result.routed,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[promote-from-project] FATAL: ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
