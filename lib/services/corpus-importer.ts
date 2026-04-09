// =============================================================================
// CORPUS IMPORTER — Incremental Drive import for Firm Corpus
// Processes documents in batches of 5, classifies with Gemini Flash,
// stores raw content + structured metadata per document.
// =============================================================================

import { prisma } from "@/lib/prisma";
import { callLLM } from "@/lib/clients/llm";
import { getFirmCorpus } from "./firm-corpus";
import type { CorpusDocumentType, CorpusOutcome } from "@prisma/client";

// ─── Types ───────────────────────────────────────────────────────────────────

interface DriveFileRef {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  webViewLink?: string;
  size?: string;
}

interface ClassificationResult {
  documentType: CorpusDocumentType;
  industry: string | null;
  geography: string | null;
  companySize: string | null;
  outcome: CorpusOutcome | null;
  extractedSummary: string;
  keyEntities: { companies: string[]; people: string[]; sectors: string[] };
}

// Gemini structured output schema for classification
const CLASSIFICATION_SCHEMA = {
  type: "object",
  properties: {
    documentType: {
      type: "string",
      enum: [
        "CASE_STUDY",
        "PROPOSAL_WON",
        "PROPOSAL_LOST",
        "PROPOSAL_DORMANT",
        "INDUSTRY_RESEARCH",
        "METHODOLOGY",
        "UNCLASSIFIED",
      ],
    },
    industry: { type: "string", nullable: true },
    geography: { type: "string", nullable: true },
    companySize: { type: "string", nullable: true },
    outcome: {
      type: "string",
      enum: ["WON", "LOST", "DORMANT", "IN_PROGRESS", "NA"],
      nullable: true,
    },
    extractedSummary: { type: "string" },
    keyEntities: {
      type: "object",
      properties: {
        companies: { type: "array", items: { type: "string" } },
        people: { type: "array", items: { type: "string" } },
        sectors: { type: "array", items: { type: "string" } },
      },
      required: ["companies", "people", "sectors"],
    },
  },
  required: ["documentType", "extractedSummary", "keyEntities"],
};

// ─── Sanitization ────────────────────────────────────────────────────────────

function sanitizeForPostgres(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .replace(/\x00/g, "")                            // null bytes
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F]/g, ""); // other problematic control chars
}

function sanitizeJson(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      result[key] = sanitizeForPostgres(value);
    } else if (Array.isArray(value)) {
      result[key] = value.map((v) => (typeof v === "string" ? sanitizeForPostgres(v) : v));
    } else {
      result[key] = value;
    }
  }
  return result;
}

function logSanitizationDelta(field: string, driveFileId: string, before: string | null | undefined, after: string) {
  const beforeLen = before?.length ?? 0;
  const afterLen = after.length;
  if (beforeLen !== afterLen) {
    console.warn(
      `[corpus-import] SANITIZED ${field} for ${driveFileId}: ${beforeLen} → ${afterLen} chars (removed ${beforeLen - afterLen} problematic bytes)`
    );
  }
}

// ─── Configuration ───────────────────────────────────────────────────────────

const BATCH_SIZE = 5;
const MAX_DEPTH = 10;
const MAX_RAW_CONTENT_BYTES = 1_000_000; // 1MB per document
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

async function extractFileContent(
  file: DriveFileRef,
  accessToken: string
): Promise<string> {
  let exportUrl: string;

  if (file.mimeType.includes("google-apps")) {
    if (file.mimeType.includes("spreadsheet")) {
      exportUrl = `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=text/csv`;
    } else if (file.mimeType.includes("presentation")) {
      exportUrl = `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=text/plain`;
    } else {
      exportUrl = `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=text/plain`;
    }
  } else {
    exportUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;
  }

  const response = await fetch(exportUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${file.name}`);
  }

  const text = await response.text();
  return text;
}

// ─── Classification ──────────────────────────────────────────────────────────

async function classifyDocument(
  fileName: string,
  rawContent: string
): Promise<ClassificationResult> {
  // Truncate content for classification (keep full raw stored separately)
  const contentForLLM = rawContent.length > 15000
    ? rawContent.substring(0, 15000) + "\n[... content truncated for classification ...]"
    : rawContent;

  const response = await callLLM({
    model: "gemini-flash",
    systemPrompt: `You are a consulting firm document classifier for Vex&Co, a strategic consulting firm operating in Spain and Latin America.
Classify the following document and extract structured metadata.

Rules:
- documentType: Choose the most specific type. Use UNCLASSIFIED only if truly ambiguous.
- CASE_STUDY: Completed client engagements with results/outcomes described
- PROPOSAL_WON/LOST/DORMANT: Sales proposals with clear outcome indicators
- INDUSTRY_RESEARCH: Market studies, sector analyses, trend reports
- METHODOLOGY: Internal frameworks, processes, templates, playbooks
- industry: The primary industry (e.g., "Technology", "Healthcare", "Financial Services"). Null if not specific.
- geography: Country or region focus (e.g., "Spain", "LATAM", "Colombia"). Null if not specific.
- companySize: Target company size if mentioned (e.g., "SMB", "Enterprise", "Startup"). Null if not mentioned.
- outcome: WON/LOST/DORMANT/IN_PROGRESS for proposals/cases. NA for research/methodology.
- extractedSummary: Max 500 words. Distill the most relevant strategic insights — do NOT just compress the text.
- keyEntities: Extract mentioned companies, people names, and business sectors.`,
    userPrompt: `File: ${fileName}\n\nContent:\n${contentForLLM}`,
    jsonMode: true,
    responseSchema: CLASSIFICATION_SCHEMA,
    maxTokens: 2048,
    temperature: 0.3,
  });

  const parsed = JSON.parse(response.content);
  return {
    documentType: parsed.documentType || "UNCLASSIFIED",
    industry: parsed.industry || null,
    geography: parsed.geography || null,
    companySize: parsed.companySize || null,
    outcome: parsed.outcome || null,
    extractedSummary: parsed.extractedSummary || "",
    keyEntities: parsed.keyEntities || { companies: [], people: [], sectors: [] },
  };
}

// ─── Main Import Function ────────────────────────────────────────────────────

export async function importCorpusFromDrive(
  driveFolderId: string,
  accessToken: string,
  mode: "full" | "incremental" = "incremental"
): Promise<{ processed: number; skipped: number; failed: number; total: number }> {
  const corpus = await getFirmCorpus();

  // Update sync status
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

  try {
    // Step 1: List all files recursively
    console.log(`[corpus-import] Scanning folder ${driveFolderId} recursively...`);
    const allFiles = await listFolderRecursively(driveFolderId, accessToken);
    const processableFiles = allFiles.filter(isProcessableFile);
    const totalFiles = processableFiles.length;
    console.log(`[corpus-import] Found ${allFiles.length} total files, ${totalFiles} processable`);

    await prisma.firmCorpus.update({
      where: { id: corpus.id },
      data: { syncProgress: { processed: 0, total: totalFiles, currentBatch: 0 } },
    });

    // Step 2: Filter for incremental mode
    let filesToProcess: DriveFileRef[];
    if (mode === "full") {
      // Clean slate: delete all existing documents for fresh re-import
      const deleted = await prisma.corpusDocument.deleteMany({ where: { corpusId: corpus.id } });
      console.log(`[corpus-import] Full mode: deleted ${deleted.count} existing documents`);
      filesToProcess = processableFiles;
    } else {
      // Check which files need processing
      const existingDocs = await prisma.corpusDocument.findMany({
        where: { corpusId: corpus.id },
        select: { driveFileId: true, lastProcessedAt: true },
      });
      const existingMap = new Map(
        existingDocs.map((d) => [d.driveFileId, d.lastProcessedAt])
      );

      filesToProcess = processableFiles.filter((file) => {
        const lastProcessed = existingMap.get(file.id);
        if (!lastProcessed) return true; // New file
        const modifiedTime = new Date(file.modifiedTime);
        return modifiedTime > lastProcessed; // Modified since last processing
      });

      skipped = totalFiles - filesToProcess.length;
      console.log(
        `[corpus-import] Incremental: ${filesToProcess.length} to process, ${skipped} up-to-date`
      );
    }

    // Step 3: Process in batches of 5
    const totalBatches = Math.ceil(filesToProcess.length / BATCH_SIZE);

    for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
      const batchStart = batchIdx * BATCH_SIZE;
      const batch = filesToProcess.slice(batchStart, batchStart + BATCH_SIZE);
      console.log(
        `[corpus-import] Processing batch ${batchIdx + 1}/${totalBatches} (${batch.length} files)`
      );

      const batchResults = await Promise.allSettled(
        batch.map(async (file) => {
          try {
            // Extract content
            const rawContentUnsafe = await extractFileContent(file, accessToken);

            // Sanitize raw content for Postgres
            const rawContent = sanitizeForPostgres(rawContentUnsafe);
            logSanitizationDelta("rawContent", file.id, rawContentUnsafe, rawContent);

            // Truncate raw content if too large
            let storedContent = rawContent;
            if (Buffer.byteLength(rawContent, "utf-8") > MAX_RAW_CONTENT_BYTES) {
              storedContent =
                rawContent.substring(0, MAX_RAW_CONTENT_BYTES) +
                "\n[... content truncated at 1MB ...]";
              console.warn(
                `[corpus-import] WARNING: ${file.name} exceeds 1MB, truncated for storage`
              );
            }

            // Classify with Gemini Flash
            const classification = await classifyDocument(file.name, rawContent);

            // Sanitize all LLM output strings
            const safeSummary = sanitizeForPostgres(classification.extractedSummary);
            logSanitizationDelta("extractedSummary", file.id, classification.extractedSummary, safeSummary);
            const safeIndustry = classification.industry ? sanitizeForPostgres(classification.industry) : null;
            const safeGeography = classification.geography ? sanitizeForPostgres(classification.geography) : null;
            const safeCompanySize = classification.companySize ? sanitizeForPostgres(classification.companySize) : null;
            const safeEntities = sanitizeJson(classification.keyEntities as unknown as Record<string, unknown>);
            const safeFileName = sanitizeForPostgres(file.name);
            const driveFileUrl = file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`;

            const upsertData = {
              documentType: classification.documentType as CorpusDocumentType,
              industry: safeIndustry,
              geography: safeGeography,
              companySize: safeCompanySize,
              outcome: classification.outcome as CorpusOutcome | null,
              extractedSummary: safeSummary,
              keyEntities: safeEntities,
              rawContent: storedContent,
              embeddingStatus: "PENDING" as const,
              lastProcessedAt: new Date(),
              processingError: null,
            };

            // Fault-tolerant upsert: try with rawContent, fallback without
            try {
              await prisma.corpusDocument.upsert({
                where: { driveFileId: file.id },
                create: {
                  corpusId: corpus.id,
                  driveFileId: file.id,
                  driveFileName: safeFileName,
                  driveFileUrl,
                  mimeType: file.mimeType,
                  ...upsertData,
                },
                update: {
                  driveFileName: safeFileName,
                  driveFileUrl,
                  mimeType: file.mimeType,
                  ...upsertData,
                },
              });
            } catch (upsertError: unknown) {
              const upsertMsg = upsertError instanceof Error ? upsertError.message : String(upsertError);
              const isEncodingError = upsertMsg.includes("22021") || upsertMsg.includes("invalid byte sequence");

              if (isEncodingError) {
                console.warn(`[corpus-import] Encoding error for ${file.name}, retrying without rawContent — metadata preserved`);
                await prisma.corpusDocument.upsert({
                  where: { driveFileId: file.id },
                  create: {
                    corpusId: corpus.id,
                    driveFileId: file.id,
                    driveFileName: safeFileName,
                    driveFileUrl,
                    mimeType: file.mimeType,
                    ...upsertData,
                    rawContent: "",
                    processingError: "Content extraction had encoding issues, metadata preserved",
                  },
                  update: {
                    driveFileName: safeFileName,
                    driveFileUrl,
                    mimeType: file.mimeType,
                    ...upsertData,
                    rawContent: "",
                    processingError: "Content extraction had encoding issues, metadata preserved",
                  },
                });
              } else {
                throw upsertError; // Re-throw non-encoding errors
              }
            }

            return { success: true, fileName: file.name };
          } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            const safeMsg = sanitizeForPostgres(msg);
            console.error(`[corpus-import] FAILED: ${file.name} — ${safeMsg}`);

            // Save error but don't abort
            await prisma.corpusDocument
              .upsert({
                where: { driveFileId: file.id },
                create: {
                  corpusId: corpus.id,
                  driveFileId: file.id,
                  driveFileName: sanitizeForPostgres(file.name),
                  driveFileUrl:
                    file.webViewLink ||
                    `https://drive.google.com/file/d/${file.id}/view`,
                  mimeType: file.mimeType,
                  processingError: safeMsg,
                  embeddingStatus: "FAILED",
                  lastProcessedAt: new Date(),
                },
                update: {
                  processingError: safeMsg,
                  embeddingStatus: "FAILED",
                  lastProcessedAt: new Date(),
                },
              })
              .catch((e: unknown) =>
                console.error(`[corpus-import] Could not save error for ${file.name}:`, e)
              );

            return { success: false, fileName: file.name, error: safeMsg };
          }
        })
      );

      // Count results
      for (const result of batchResults) {
        if (result.status === "fulfilled" && result.value.success) {
          processed++;
        } else {
          failed++;
        }
      }

      // Update progress after each batch
      await prisma.firmCorpus.update({
        where: { id: corpus.id },
        data: {
          syncProgress: {
            processed: processed + skipped,
            total: totalFiles,
            currentBatch: batchIdx + 1,
          },
          lastSyncedAt: new Date(),
        },
      });

      console.log(
        `[corpus-import] Batch ${batchIdx + 1} complete: ${processed} processed, ${failed} failed`
      );
    }

    // Final status update
    await prisma.firmCorpus.update({
      where: { id: corpus.id },
      data: {
        syncStatus: "completed",
        syncProgress: {
          processed: processed + skipped,
          total: totalFiles,
          currentBatch: totalBatches,
        },
        lastSyncedAt: new Date(),
      },
    });

    console.log(
      `[corpus-import] COMPLETE: ${processed} processed, ${skipped} skipped, ${failed} failed out of ${totalFiles}`
    );

    return { processed, skipped, failed, total: totalFiles };
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
