// =============================================================================
// PERSIST — Transactional persistence for corpus pipeline
// =============================================================================

import { prisma } from "@/lib/prisma";
import type { StageAResult } from "./stage-a-classifier";
import type { StageBResult } from "./stage-b-comprehension";
import type { CorpusDocumentType, CorpusOutcome, Provenance, OperationalSourceKind } from "@prisma/client";

// ─── Sanitization (carried over from M.2a hotfix) ───────────────────────────

export function sanitizeForPostgres(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .replace(/\x00/g, "")
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F]/g, "");
}

function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ─── Map Stage A types to existing Prisma enums ─────────────────────────────

function mapDocumentType(stageA: string): CorpusDocumentType {
  const map: Record<string, CorpusDocumentType> = {
    CASE_STUDY: "CASE_STUDY",
    RESEARCH: "INDUSTRY_RESEARCH",
    METHODOLOGY: "METHODOLOGY",
    UNCLASSIFIED: "UNCLASSIFIED",
  };
  return map[stageA] || "UNCLASSIFIED";
}

function mapOutcome(stageA: string | null): CorpusOutcome | null {
  if (!stageA || stageA === "NA") return null;
  const map: Record<string, CorpusOutcome> = {
    WON: "WON",
    LOST: "LOST",
    PAUSED: "DORMANT",
  };
  return map[stageA] || null;
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface DriveFileRef {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
}

// ─── Persist Document ────────────────────────────────────────────────────────

export async function persistDocument(
  driveFile: DriveFileRef,
  rawContent: string,
  stageA: StageAResult,
  stageB: StageBResult,
  corpusId: string
) {
  const safeRaw = sanitizeForPostgres(rawContent);
  const safeSummary = sanitizeForPostgres(stageB.extractedSummary);
  const safeReasoning = sanitizeForPostgres(stageB.provenanceReasoning);
  const safeFileName = sanitizeForPostgres(driveFile.name);
  const safeIndustry = stageA.industry ? sanitizeForPostgres(stageA.industry) : null;
  const safeGeography = stageA.geography ? sanitizeForPostgres(stageA.geography) : null;
  const driveFileUrl = driveFile.webViewLink || `https://drive.google.com/file/d/${driveFile.id}/view`;

  // Sanitize keyEntities
  const safeEntities = stageB.keyEntities.map((e) => ({
    name: sanitizeForPostgres(e.name),
    type: e.type,
  }));

  // Truncate raw content at 1MB
  const MAX_RAW = 1_000_000;
  const storedContent = Buffer.byteLength(safeRaw, "utf-8") > MAX_RAW
    ? safeRaw.substring(0, MAX_RAW) + "\n[... content truncated at 1MB ...]"
    : safeRaw;

  // Nota: no incluimos `archived` aquí. Create usa el default false del schema;
  // update preserva la curación humana previa (reprocess no debe desarchivar).
  const docData = {
    driveFileName: safeFileName,
    driveFileUrl,
    mimeType: driveFile.mimeType,
    documentType: mapDocumentType(stageA.documentType),
    industry: safeIndustry,
    geography: safeGeography,
    outcome: mapOutcome(stageA.outcome),
    provenance: stageB.provenance as Provenance,
    extractedSummary: safeSummary,
    keyEntities: safeEntities,
    rawContent: storedContent,
    embeddingStatus: "PENDING" as const,
    lastProcessedAt: new Date(),
    processingError: null,
  };

  return prisma.$transaction(async (tx) => {
    // 1. Upsert document
    let doc;
    try {
      doc = await tx.corpusDocument.upsert({
        where: { driveFileId: driveFile.id },
        create: { corpusId, driveFileId: driveFile.id, ...docData },
        update: docData,
      });
    } catch (upsertError: unknown) {
      const msg = upsertError instanceof Error ? upsertError.message : String(upsertError);
      if (msg.includes("22021") || msg.includes("invalid byte sequence")) {
        console.warn(`[corpus-persist] Encoding error for ${driveFile.name}, retrying without rawContent`);
        doc = await tx.corpusDocument.upsert({
          where: { driveFileId: driveFile.id },
          create: {
            corpusId,
            driveFileId: driveFile.id,
            ...docData,
            rawContent: "",
            processingError: "Content extraction had encoding issues, metadata preserved",
          },
          update: {
            ...docData,
            rawContent: "",
            processingError: "Content extraction had encoding issues, metadata preserved",
          },
        });
      } else {
        throw upsertError;
      }
    }

    // 2. Upsert frameworks for detections with confidence >= 0.7
    for (const fw of stageB.detectedFrameworks) {
      if (fw.confidence < 0.7) continue;

      const slug = slugify(fw.name);
      if (!slug) continue;

      const safeName = sanitizeForPostgres(fw.name);
      const safeOriginSource = sanitizeForPostgres(fw.originSource) || "Unknown";
      const safeOriginAuthor = fw.originAuthor ? sanitizeForPostgres(fw.originAuthor) : null;
      const safeHint = fw.componentsHint ? sanitizeForPostgres(fw.componentsHint) : `Framework detectado en: ${safeFileName}`;

      const safeAppContext = fw.applicationContext ? sanitizeForPostgres(fw.applicationContext) : null;
      const lifecycle = fw.lifecycleStage || "EXTERNAL";

      const framework = await tx.framework.upsert({
        where: { slug },
        create: {
          name: safeName,
          slug,
          originSource: safeOriginSource,
          originAuthor: safeOriginAuthor,
          lifecycleStage: lifecycle,
          originalDescription: safeHint,
          ...(safeAppContext ? { currentVexcoVariant: safeAppContext } : {}),
        },
        update: {}, // Don't overwrite future manual edits
      });

      await tx.frameworkSourceDocument.upsert({
        where: {
          frameworkId_documentId: {
            frameworkId: framework.id,
            documentId: doc.id,
          },
        },
        create: {
          frameworkId: framework.id,
          documentId: doc.id,
          confidence: fw.confidence,
        },
        update: {
          confidence: fw.confidence,
        },
      });
    }

    return doc;
  });
}

// ─── Persist Operational Source ───────────────────────────────────────────────

export async function persistOperationalSource(
  driveFile: DriveFileRef,
  detectedKind: OperationalSourceKind
) {
  return prisma.operationalSource.upsert({
    where: { driveFileId: driveFile.id },
    create: {
      driveFileId: driveFile.id,
      driveFileName: sanitizeForPostgres(driveFile.name),
      driveFileMimeType: driveFile.mimeType,
      detectedKind,
      status: "PENDING",
    },
    update: {
      lastSeenAt: new Date(),
      driveFileName: sanitizeForPostgres(driveFile.name),
    },
  });
}
