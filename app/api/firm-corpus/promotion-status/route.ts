// =============================================================================
// GET /api/firm-corpus/promotion-status?projectId=X
// Devuelve el estado de promoción al corpus de cada DriveDocSummary del proyecto.
// Usado por la vista de proyecto para pintar los estados del botón Promover.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json({ error: "projectId requerido" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json({ error: "User no encontrado" }, { status: 404 });
    }

    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: user.id },
      select: { id: true },
    });
    if (!project) {
      return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
    }

    const summaries = await prisma.driveDocSummary.findMany({
      where: { projectId },
      select: { driveFileId: true },
    });

    const fileIds = summaries.map((s) => s.driveFileId);
    if (fileIds.length === 0) {
      return NextResponse.json({ items: [] });
    }

    const corpusDocs = await prisma.corpusDocument.findMany({
      where: { driveFileId: { in: fileIds } },
      select: { driveFileId: true, reviewedAt: true, archived: true },
    });

    const corpusMap = new Map(corpusDocs.map((d) => [d.driveFileId, d]));

    const items = fileIds.map((driveFileId) => {
      const cd = corpusMap.get(driveFileId);
      let corpusStatus: "not_promoted" | "pending_review" | "reviewed" | "archived";
      if (!cd) corpusStatus = "not_promoted";
      else if (cd.archived) corpusStatus = "archived";
      else if (cd.reviewedAt) corpusStatus = "reviewed";
      else corpusStatus = "pending_review";
      return { driveFileId, corpusStatus };
    });

    return NextResponse.json({ items });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
