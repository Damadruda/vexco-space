// =============================================================================
// POST /api/projects/[id]/reimport-drive
// Re-procesa una carpeta de Drive ya vinculada a un proyecto.
// - Re-fetcha la lista actual de archivos desde Drive
// - Soft-delete huérfanos (DriveDocSummary cuyo driveFileId ya no está en la carpeta)
// - Promueve al Firm Corpus los archivos indicados en `promoteToCorpusDriveFileIds`
// - Soft-delete (set unlinkedAt) los archivos indicados en `unlinkDriveFileIds`
// - Re-corre el flow completo de analyze-folder sobre los archivos vigentes
//   (multimodal global + summarizeDocument per-file con Convergencia v2 / REGLA #0.5)
// - Sobrescribe project.concept/description/targetMarket/etc + DriveDocSummary upsert
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { getFirmCorpus } from "@/lib/services/firm-corpus";
import { promoteSingleFile } from "@/lib/services/corpus-importer";
import {
  scanFolderRecursively,
  detectProjectType,
  filterAndPrioritizeFiles,
  processFilesInBatches,
  inferFileType,
  summarizeDocument,
  summarizeDocumentMultimodal,
} from "@/lib/services/drive-import-helpers";
import { callGeminiMultimodal } from "@/lib/clients/llm";
import type { Part } from "@/lib/clients/llm";

export const dynamic = "force-dynamic";
export const maxDuration = 500;

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
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=${fields}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`Drive API ${res.status}: metadata read failed`);
  return (await res.json()) as DriveFileMeta;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const startTime = Date.now();
  const projectId = params.id;

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });
    if (!user) return NextResponse.json({ error: "User no encontrado" }, { status: 404 });

    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: user.id },
    });
    if (!project) {
      return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
    }
    if (!project.driveFolderId) {
      return NextResponse.json(
        { error: "Proyecto sin driveFolderId. No hay nada que re-importar." },
        { status: 400 }
      );
    }

    const account = await prisma.account.findFirst({
      where: { userId: user.id, provider: "google" },
    });
    if (!account?.access_token) {
      return NextResponse.json(
        { error: "Token de Google no encontrado. Reingresá." },
        { status: 401 }
      );
    }
    const accessToken = account.access_token;

    const body = await request.json().catch(() => ({}));
    const {
      unlinkDriveFileIds = [],
      promoteToCorpusDriveFileIds = [],
    } = body as {
      unlinkDriveFileIds?: string[];
      promoteToCorpusDriveFileIds?: string[];
    };

    const stats = {
      promoted: [] as Array<{ driveFileId: string; corpusDocumentId: string; routed: string }>,
      promoteFailed: [] as Array<{ driveFileId: string; reason: string }>,
      unlinked: [] as string[],
      orphansSoftDeleted: [] as string[],
      reprocessed: 0,
      reprocessErrors: [] as string[],
      durationMs: 0,
    };

    // ─── 1. PROMOVER al Firm Corpus antes de desvincular ────────────────────
    // Si la promoción falla, el archivo NO se desvincula (se queda como estaba).
    const corpus = await getFirmCorpus();
    const promoteSet = new Set<string>(promoteToCorpusDriveFileIds);
    const safeToUnlink = new Set<string>();

    for (const driveFileId of unlinkDriveFileIds) {
      if (promoteSet.has(driveFileId)) {
        try {
          const fileMeta = await fetchDriveFileMetadata(driveFileId, accessToken);
          const result = await promoteSingleFile(fileMeta, accessToken, corpus.id);
          stats.promoted.push({
            driveFileId,
            corpusDocumentId: result.corpusDocumentId,
            routed: result.routed,
          });
          safeToUnlink.add(driveFileId);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          stats.promoteFailed.push({ driveFileId, reason: msg });
          console.warn(`[REIMPORT] Promote failed for ${driveFileId}: ${msg}`);
          // NO agregar a safeToUnlink → no se desvincula
        }
      } else {
        // Desvincular sin promover
        safeToUnlink.add(driveFileId);
      }
    }

    // ─── 2. Soft-delete de los archivos marcados (que pasaron promoción) ───
    if (safeToUnlink.size > 0) {
      const updateResult = await prisma.driveDocSummary.updateMany({
        where: {
          projectId,
          driveFileId: { in: Array.from(safeToUnlink) },
        },
        data: { unlinkedAt: new Date() },
      });
      stats.unlinked = Array.from(safeToUnlink).slice(0, updateResult.count);
    }

    // ─── 3. Re-fetch lista actual de archivos en la carpeta de Drive ───────
    const allFiles = await scanFolderRecursively(
      project.driveFolderId,
      accessToken,
      0,
      5,
      project.title
    );
    if (allFiles.length === 0) {
      stats.durationMs = Date.now() - startTime;
      return NextResponse.json({
        success: false,
        error: "La carpeta de Drive está vacía o no es accesible.",
        stats,
      });
    }

    // ─── 4. Identificar huérfanos: en DB pero ya no en la carpeta ──────────
    const driveIdsInFolder = new Set(allFiles.map((f) => f.id));
    const existingActiveSummaries = await prisma.driveDocSummary.findMany({
      where: { projectId, unlinkedAt: null },
      select: { driveFileId: true },
    });
    const orphans = existingActiveSummaries
      .map((s) => s.driveFileId)
      .filter((id) => !driveIdsInFolder.has(id) && !safeToUnlink.has(id));

    if (orphans.length > 0) {
      await prisma.driveDocSummary.updateMany({
        where: { projectId, driveFileId: { in: orphans } },
        data: { unlinkedAt: new Date() },
      });
      stats.orphansSoftDeleted = orphans;
    }

    // ─── 5. Filtrar para re-procesamiento: excluir manualmente desvinculados ─
    const filesToReprocess = allFiles.filter((f) => !safeToUnlink.has(f.id));
    if (filesToReprocess.length === 0) {
      stats.durationMs = Date.now() - startTime;
      return NextResponse.json({
        success: true,
        message: "Todos los archivos fueron desvinculados. Nada para re-procesar.",
        stats,
      });
    }

    const projectType = detectProjectType(filesToReprocess);
    const { selected: textFiles } = filterAndPrioritizeFiles(
      filesToReprocess,
      projectType
    );

    const { parts } = await processFilesInBatches(
      textFiles,
      accessToken
    );
    if (parts.length === 0) {
      stats.durationMs = Date.now() - startTime;
      return NextResponse.json({
        success: false,
        error: "No se pudo procesar ningún archivo después del re-fetch.",
        stats,
      });
    }

    // ─── 6. Multimodal global → sobrescribe campos del proyecto ────────────
    const fileListForPrompt = textFiles
      .map((f) => `- ${f.name} (${f.mimeType})`)
      .join("\n");

    const analysisPrompt = `Analiza los siguientes archivos del proyecto "${project.title}" y genera un análisis estratégico estructurado.

ARCHIVOS DISPONIBLES (${textFiles.length} total):
${fileListForPrompt}

INSTRUCCIONES:
- Tenés acceso multimodal: leés texto, ves imágenes y procesás PDFs nativamente.
- Basá tu análisis EXCLUSIVAMENTE en el contenido proporcionado.
- NO inventes información que no esté en los archivos.
- Si no hay info para un campo, escribí "Información no disponible en los archivos".

REGLA #0.5 ANTI-HALUCINACIÓN: si los archivos no contienen información sobre un campo, NO lo inventes. Indicá explícitamente la ausencia.

Respondé ÚNICAMENTE con JSON válido:
{
  "concept": "Qué es este proyecto según los archivos. Problema y solución. Max 2000 chars.",
  "targetMarket": "Público objetivo según los archivos. Max 2000 chars.",
  "metrics": "KPIs o métricas mencionadas. Max 2000 chars.",
  "actionPlan": "Próximos pasos descritos. Max 2000 chars.",
  "resources": "Recursos, tecnologías o herramientas mencionadas. Max 2000 chars.",
  "description": "Resumen ejecutivo. Max 2000 chars."
}`;

    let parsedGlobal: Record<string, string> = {};
    try {
      const result = await callGeminiMultimodal(
        "",
        analysisPrompt,
        parts,
        true,
        4096,
        0.3
      );
      parsedGlobal = JSON.parse(result.content);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      stats.reprocessErrors.push(`Multimodal global failed: ${msg}`);
      console.warn(`[REIMPORT] Multimodal global failed: ${msg}`);
    }

    const truncate = (str: string | undefined, max = 2000): string | null =>
      str ? (str.length > max ? str.slice(0, max) + "..." : str) : null;

    await prisma.project.update({
      where: { id: projectId },
      data: {
        ...(parsedGlobal.concept && { concept: truncate(parsedGlobal.concept) }),
        ...(parsedGlobal.targetMarket && { targetMarket: truncate(parsedGlobal.targetMarket) }),
        ...(parsedGlobal.metrics && { metrics: truncate(parsedGlobal.metrics) }),
        ...(parsedGlobal.actionPlan && { actionPlan: truncate(parsedGlobal.actionPlan) }),
        ...(parsedGlobal.resources && { resources: truncate(parsedGlobal.resources) }),
        ...(parsedGlobal.description && { description: truncate(parsedGlobal.description) }),
      },
    });

    // ─── 7. Per-file summaries (Convergencia v2) ───────────────────────────
    const textContentByName = new Map<string, string>();
    for (const part of parts) {
      if ("text" in part) {
        const m = (part.text as string).match(/--- Archivo: (.+?) ---\n([\s\S]*?)(?=\n--- Archivo:|$)/);
        if (m) textContentByName.set(m[1].trim(), m[2].trim());
      }
    }

    const pdfPartsOrdered = parts.filter(
      (p): p is { inlineData: { data: string; mimeType: string } } =>
        "inlineData" in p &&
        (p as { inlineData: { mimeType: string } }).inlineData.mimeType === "application/pdf"
    );
    const pdfPartByName = new Map<string, Part>();
    let pdfIdx = 0;
    for (const file of textFiles) {
      const isPdf = file.mimeType === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      if (isPdf && pdfPartsOrdered[pdfIdx]) {
        pdfPartByName.set(file.name, pdfPartsOrdered[pdfIdx] as Part);
        pdfIdx++;
      }
    }

    const projectContextStr = `Titulo: ${project.title}. ${parsedGlobal.concept ? `Concepto: ${String(parsedGlobal.concept).slice(0, 300)}.` : ""}`;

    const BATCH_SIZE = 4;
    for (let i = 0; i < textFiles.length; i += BATCH_SIZE) {
      const batch = textFiles.slice(i, i + BATCH_SIZE);
      const summaryResults = await Promise.all(
        batch.map(async (file) => {
          const fileType = inferFileType(file.name, file.mimeType);
          if (fileType === "image") return null;
          const isPdf =
            file.mimeType === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
          if (isPdf) {
            const pdfPart = pdfPartByName.get(file.name);
            if (pdfPart) return await summarizeDocumentMultimodal(file.name, pdfPart, projectContextStr);
            return null;
          }
          const textContent = textContentByName.get(file.name);
          if (!textContent) return null;
          return await summarizeDocument(file.name, textContent, projectContextStr);
        })
      );

      for (let j = 0; j < batch.length; j++) {
        const file = batch[j];
        const res = summaryResults[j];
        const fileType = inferFileType(file.name, file.mimeType);
        try {
          await prisma.driveDocSummary.upsert({
            where: {
              projectId_driveFileId: { projectId, driveFileId: file.id },
            },
            update: {
              fileName: file.name,
              fileType,
              ...(res?.summary && { summary: res.summary }),
              ...(res?.keyInsights && { keyInsights: res.keyInsights }),
              ...(res?.category !== undefined && { category: res.category }),
              ...(res?.wordCount !== undefined && { wordCount: res.wordCount }),
              unlinkedAt: null, // re-vincular si estaba huérfano de una corrida previa
            },
            create: {
              projectId,
              driveFileId: file.id,
              fileName: file.name,
              fileType,
              summary: res?.summary ?? `Documento importado: ${file.name}`,
              keyInsights: res?.keyInsights ?? [],
              category: res?.category ?? null,
              wordCount: res?.wordCount ?? null,
            },
          });
          stats.reprocessed++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          stats.reprocessErrors.push(`${file.name}: ${msg}`);
        }
      }
    }

    stats.durationMs = Date.now() - startTime;
    return NextResponse.json({ success: true, stats });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[REIMPORT] FATAL:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
