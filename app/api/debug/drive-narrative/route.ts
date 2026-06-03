// =============================================================================
// GET /api/debug/drive-narrative?projectId=<id>
// Diagnóstico runtime del pipeline narrativo de Drive (Stage A + B).
// Expone por documento los campos crudos que las rutas de producción no
// seleccionan (processingError, lastNarrativeProcessedAt, keyInsights, wordCount),
// para entender por qué un import quedó en placeholder en vez de narrativa real.
// Autenticado (NextAuth) + verificación de ownership. READ-only. Sin side effects.
// =============================================================================

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const PLACEHOLDER_PREFIX = "Documento importado:";

type NarrativeStatus =
  | "OK"
  | "FAILED"
  | "PLACEHOLDER"
  | "IMAGE_MULTIMODAL"
  | "UNKNOWN";

function deriveStatus(doc: {
  fileType: string;
  summary: string | null;
  processingError: string | null;
  lastNarrativeProcessedAt: Date | null;
}): NarrativeStatus {
  if (doc.fileType === "image") return "IMAGE_MULTIMODAL";
  if (doc.processingError) return "FAILED";
  if (doc.summary?.startsWith(PLACEHOLDER_PREFIX)) return "PLACEHOLDER";
  if (doc.lastNarrativeProcessedAt) return "OK";
  return "UNKNOWN";
}

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json(
        { error: "Missing required query param: projectId" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: user.id },
      select: { id: true, title: true },
    });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const rawDocs = await prisma.driveDocSummary.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        driveFileId: true,
        fileName: true,
        fileType: true,
        category: true,
        summary: true,
        keyInsights: true,
        wordCount: true,
        language: true,
        hasStructuredData: true,
        assetRole: true,
        visualDescription: true,
        processingError: true,
        lastNarrativeProcessedAt: true,
        unlinkedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const docs = rawDocs.map((d) => {
      const summary = d.summary ?? "";
      return {
        fileName: d.fileName,
        fileType: d.fileType,
        category: d.category,
        narrativeStatus: deriveStatus(d),
        summaryLength: summary.length,
        summaryPreview: summary.slice(0, 300),
        keyInsightsCount: d.keyInsights.length,
        keyInsights: d.keyInsights,
        wordCount: d.wordCount,
        language: d.language,
        hasStructuredData: d.hasStructuredData,
        assetRole: d.assetRole,
        visualDescriptionLength: d.visualDescription?.length ?? 0,
        processingError: d.processingError,
        lastNarrativeProcessedAt: d.lastNarrativeProcessedAt
          ? d.lastNarrativeProcessedAt.toISOString()
          : null,
        unlinkedAt: d.unlinkedAt ? d.unlinkedAt.toISOString() : null,
        driveFileId: d.driveFileId,
        docId: d.id,
        createdAt: d.createdAt.toISOString(),
        updatedAt: d.updatedAt.toISOString(),
      };
    });

    const statusBreakdown = docs.reduce<Record<NarrativeStatus, number>>(
      (acc, d) => {
        acc[d.narrativeStatus] = (acc[d.narrativeStatus] ?? 0) + 1;
        return acc;
      },
      {} as Record<NarrativeStatus, number>
    );

    return NextResponse.json({
      projectId: project.id,
      projectTitle: project.title,
      totalDocs: docs.length,
      statusBreakdown,
      docs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[DRIVE_NARRATIVE_DEBUG]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
