// =============================================================================
// CORPUS IMPORTER — Orchestrator for Firm Corpus pipeline
// M.2a-PLUS: Split A (Flash metadata) + B (Pro comprehension) + file routing
// =============================================================================

import { prisma } from "@/lib/prisma";
import mammoth from "mammoth";
import { getFirmCorpus } from "./firm-corpus";
import { routeFile } from "@/lib/firm-corpus/file-router";
import { runStageA } from "@/lib/firm-corpus/stage-a-classifier";
import { runStageB } from "@/lib/firm-corpus/stage-b-comprehension";
import { persistDocument, persistOperationalSource, sanitizeForPostgres } from "@/lib/firm-corpus/persist";

// ─── Types ───────────────────────────────────────────────────────────────────

interface DriveFileRef {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  webViewLink?: string;
  size?: string;
}

// ─── Configuration ───────────────────────────────────────────────────────────

const BATCH_SIZE = 3; // Reduced from 5: Pro calls are heavier than Flash
const MAX_DEPTH = 10;
const SUPPORTED_MIME_TYPES = new Set([
  "application/vnd.google-apps.document",
  "application/vnd.google-apps.spreadsheet",
  "application/vnd.google-apps.presentation",
  "application/pdf",
  "text/plain",
  "text/html",
  "text/csv",
  "text/markdown",
  "application/json",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);
const TEXT_EXTENSIONS = new Set([
  ".md", ".txt", ".json", ".html", ".csv", ".markdown", ".docx", ".pdf",
  ".xlsx", ".xls", ".tsv",
]);

function isProcessableFile(file: DriveFileRef): boolean {
  if (file.mimeType === "application/vnd.google-apps.folder") return false;
  if (SUPPORTED_MIME_TYPES.has(file.mimeType)) return true;
  const ext = file.name.toLowerCase().match(/\.[^.]+$/)?.[0];
  return ext ? TEXT_EXTENSIONS.has(ext) : false;
}

// ─── Drive API Helpers ───────────────────────────────────────────────────────

async function listFolderRecursively(
  folderId: string,
  accessToken: string,
  depth = 0
): Promise<DriveFileRef[]> {
  if (depth > MAX_DEPTH) return [];

  const query = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  const fields = encodeURIComponent(
    "files(id,name,mimeType,modifiedTime,webViewLink,size),nextPageToken"
  );

  let allItems: DriveFileRef[] = [];
  let pageToken = "";

  do {
    const tokenParam = pageToken ? `&pageToken=${pageToken}` : "";
    const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}&pageSize=1000${tokenParam}`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      console.error(`[corpus-import] Error listing folder ${folderId}: HTTP ${response.status}`);
      return allItems;
    }

    const data = await response.json();
    const items: DriveFileRef[] = data.files || [];
    pageToken = data.nextPageToken || "";

    const folders = items.filter((i) => i.mimeType === "application/vnd.google-apps.folder");
    const files = items.filter((i) => i.mimeType !== "application/vnd.google-apps.folder");
    allItems = allItems.concat(files);

    for (const folder of folders) {
      const subFiles = await listFolderRecursively(folder.id, accessToken, depth + 1);
      allItems = allItems.concat(subFiles);
    }
  } while (pageToken);

  return allItems;
}

// Binary file extensions that need special handling (not plain text)
const BINARY_EXTENSIONS = new Set(["docx", "doc", "xlsx", "xls", "pptx"]);

function getFileExtension(fileName: string): string {
  return (fileName.toLowerCase().match(/\.([^.]+)$/)?.[1] || "");
}

export async function extractFileContent(
  file: DriveFileRef,
  accessToken: string
): Promise<string> {
  // Google Workspace files: export as text directly
  if (file.mimeType.includes("google-apps")) {
    let exportUrl: string;
    if (file.mimeType.includes("spreadsheet")) {
      exportUrl = `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=text/csv`;
    } else if (file.mimeType.includes("presentation")) {
      exportUrl = `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=text/plain`;
    } else {
      exportUrl = `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=text/plain`;
    }

    const response = await fetch(exportUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${file.name}`);
    return response.text();
  }

  const ext = getFileExtension(file.name);
  const downloadUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;

  // Binary files: download as arraybuffer
  if (BINARY_EXTENSIONS.has(ext) || file.mimeType.includes("officedocument") || file.mimeType === "application/msword") {
    const response = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${file.name}`);

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // DOCX: use mammoth for text extraction
    if (ext === "docx" || file.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      const result = await mammoth.extractRawText({ buffer });
      const text = result.value?.trim() ?? "";
      if (!text || text.length < 10) {
        throw new Error(`DOCX extraction returned empty or minimal content (${text.length} chars)`);
      }
      console.log(`[extract-content] DOCX ${file.name}: extracted ${text.length} chars via mammoth`);
      return sanitizeForPostgres(text);
    }

    // DOC (legacy): attempt as UTF-8, likely partial
    if (ext === "doc" || file.mimeType === "application/msword") {
      console.warn(`[extract-content] Legacy .doc format for ${file.name}, attempting UTF-8 decode (may be partial)`);
      return sanitizeForPostgres(buffer.toString("utf-8"));
    }

    // Other binary Office formats: fall back to UTF-8 (xlsx/pptx — these should be routed to operational by file-router)
    console.warn(`[extract-content] Binary format ${ext} for ${file.name}, falling back to UTF-8`);
    return sanitizeForPostgres(buffer.toString("utf-8"));
  }

  // Text files (pdf, md, txt, html, json, csv, etc): download as text
  const response = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${file.name}`);
  return response.text();
}

// ─── Main Import Function ────────────────────────────────────────────────────

export async function importCorpusFromDrive(
  driveFolderId: string,
  accessToken: string,
  mode: "full" | "incremental" = "incremental"
): Promise<{ processed: number; skipped: number; failed: number; operational: number; total: number }> {
  const corpus = await getFirmCorpus();

  await prisma.firmCorpus.update({
    where: { id: corpus.id },
    data: {
      syncStatus: "running",
      syncProgress: { processed: 0, total: 0, currentBatch: 0 },
      driveFolderId,
    },
  });

  let processed = 0;
  let skipped = 0;
  let failed = 0;
  let operational = 0;

  try {
    console.log(`[corpus-import] Scanning folder ${driveFolderId} recursively...`);
    const allFiles = await listFolderRecursively(driveFolderId, accessToken);
    const processableFiles = allFiles.filter(isProcessableFile);
    const totalFiles = processableFiles.length;
    console.log(`[corpus-import] Found ${allFiles.length} total files, ${totalFiles} processable`);

    await prisma.firmCorpus.update({
      where: { id: corpus.id },
      data: { syncProgress: { processed: 0, total: totalFiles, currentBatch: 0 } },
    });

    // Clean slate for full mode
    if (mode === "full") {
      const [delDocs, delOps, delFSD, delFW] = await Promise.all([
        prisma.corpusDocument.deleteMany({ where: { corpusId: corpus.id } }),
        prisma.operationalSource.deleteMany({}),
        prisma.frameworkSourceDocument.deleteMany({}),
        prisma.framework.deleteMany({}),
      ]);
      console.log(`[corpus-import] Full mode: deleted ${delDocs.count} docs, ${delOps.count} ops, ${delFSD.count} framework links, ${delFW.count} frameworks`);
    }

    // Filter for incremental mode
    let filesToProcess: DriveFileRef[];
    if (mode === "full") {
      filesToProcess = processableFiles;
    } else {
      const existingDocs = await prisma.corpusDocument.findMany({
        where: { corpusId: corpus.id },
        select: { driveFileId: true, lastProcessedAt: true },
      });
      const existingOps = await prisma.operationalSource.findMany({
        select: { driveFileId: true, lastSeenAt: true },
      });
      const existingMap = new Map<string, Date | null>();
      existingDocs.forEach((d) => existingMap.set(d.driveFileId, d.lastProcessedAt));
      existingOps.forEach((o) => existingMap.set(o.driveFileId, o.lastSeenAt));

      filesToProcess = processableFiles.filter((file) => {
        const lastProcessed = existingMap.get(file.id);
        if (!lastProcessed) return true;
        return new Date(file.modifiedTime) > lastProcessed;
      });

      skipped = totalFiles - filesToProcess.length;
      console.log(`[corpus-import] Incremental: ${filesToProcess.length} to process, ${skipped} up-to-date`);
    }

    // Process in batches
    const totalBatches = Math.ceil(filesToProcess.length / BATCH_SIZE);

    for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
      const batchStart = batchIdx * BATCH_SIZE;
      const batch = filesToProcess.slice(batchStart, batchStart + BATCH_SIZE);
      console.log(`[corpus-import] Processing batch ${batchIdx + 1}/${totalBatches} (${batch.length} files)`);

      // Process sequentially within batch to avoid Pro rate limits
      for (const file of batch) {
        try {
          const routing = routeFile(file.name, file.mimeType);

          if (routing.kind === "operational") {
            await persistOperationalSource(file, routing.detectedKind);
            console.log(`[corpus-import] OPERATIONAL ${file.name} -> ${routing.detectedKind}`);
            operational++;
            continue;
          }

          // Narrative pipeline
          const rawContentUnsafe = await extractFileContent(file, accessToken);
          const rawContent = sanitizeForPostgres(rawContentUnsafe);

          const beforeLen = rawContentUnsafe.length;
          const afterLen = rawContent.length;
          if (beforeLen !== afterLen) {
            console.warn(`[corpus-import] SANITIZED rawContent for ${file.id}: ${beforeLen} -> ${afterLen} chars`);
          }

          // Stage A: Flash classification
          let stageA;
          try {
            stageA = await runStageA(rawContent, file.name);
          } catch (stageAError: unknown) {
            const msg = stageAError instanceof Error ? stageAError.message : String(stageAError);
            console.error(`[corpus-import] STAGE_A_FAIL ${file.name}: ${msg}`);
            stageA = { documentType: "UNCLASSIFIED" as const, industry: null, geography: null, outcome: null };
          }

          // Stage B: Pro comprehension
          let stageB;
          try {
            stageB = await runStageB(rawContent, file.name, stageA);
          } catch (stageBError: unknown) {
            const msg = stageBError instanceof Error ? stageBError.message : String(stageBError);
            console.error(`[corpus-import] STAGE_B_FAIL ${file.name}: ${msg}`);
            // Persist with Stage A only + error
            await prisma.corpusDocument.upsert({
              where: { driveFileId: file.id },
              create: {
                corpusId: corpus.id,
                driveFileId: file.id,
                driveFileName: sanitizeForPostgres(file.name),
                driveFileUrl: file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`,
                mimeType: file.mimeType,
                processingError: sanitizeForPostgres(`Stage B failed: ${msg}`),
                embeddingStatus: "FAILED",
                lastProcessedAt: new Date(),
              },
              update: {
                processingError: sanitizeForPostgres(`Stage B failed: ${msg}`),
                embeddingStatus: "FAILED",
                lastProcessedAt: new Date(),
              },
            }).catch(() => {});
            failed++;
            continue;
          }

          await persistDocument(file, rawContent, stageA, stageB, corpus.id);
          console.log(`[corpus-import] NARRATIVE ${file.name} -> ${stageA.documentType} / ${stageB.provenance} / ${stageB.detectedFrameworks.length} frameworks`);
          processed++;
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error);
          console.error(`[corpus-import] FAILED ${file.name}: ${sanitizeForPostgres(msg)}`);

          await prisma.corpusDocument.upsert({
            where: { driveFileId: file.id },
            create: {
              corpusId: corpus.id,
              driveFileId: file.id,
              driveFileName: sanitizeForPostgres(file.name),
              driveFileUrl: file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`,
              mimeType: file.mimeType,
              processingError: sanitizeForPostgres(msg),
              embeddingStatus: "FAILED",
              lastProcessedAt: new Date(),
            },
            update: {
              processingError: sanitizeForPostgres(msg),
              embeddingStatus: "FAILED",
              lastProcessedAt: new Date(),
            },
          }).catch(() => {});

          failed++;
        }
      }

      // Update progress after each batch
      await prisma.firmCorpus.update({
        where: { id: corpus.id },
        data: {
          syncProgress: {
            processed: processed + operational + skipped,
            total: totalFiles,
            currentBatch: batchIdx + 1,
          },
          lastSyncedAt: new Date(),
        },
      });

      console.log(`[corpus-import] Batch ${batchIdx + 1} complete: ${processed} narrative, ${operational} operational, ${failed} failed`);
    }

    await prisma.firmCorpus.update({
      where: { id: corpus.id },
      data: {
        syncStatus: "completed",
        syncProgress: { processed: processed + operational + skipped, total: totalFiles, currentBatch: totalBatches },
        lastSyncedAt: new Date(),
      },
    });

    console.log(`[corpus-import] COMPLETE: ${processed} narrative, ${operational} operational, ${skipped} skipped, ${failed} failed out of ${totalFiles}`);
    return { processed, skipped, failed, operational, total: totalFiles };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[corpus-import] FATAL ERROR: ${msg}`);

    await prisma.firmCorpus.update({
      where: { id: corpus.id },
      data: {
        syncStatus: "failed",
        syncProgress: { processed, total: 0, currentBatch: 0, error: msg },
      },
    });

    throw error;
  }
}
