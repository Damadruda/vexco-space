// =============================================================================
// FIRM CORPUS — Singleton helper + query utilities
// Single point of access: all code uses getFirmCorpus(), never prisma.firmCorpus.create()
// =============================================================================

import { prisma } from "@/lib/prisma";
import type { FirmCorpus, CorpusDocument, CorpusDocumentType } from "@prisma/client";

// ─── Singleton Access ────────────────────────────────────────────────────────

export async function getFirmCorpus(): Promise<FirmCorpus> {
  const existing = await prisma.firmCorpus.findFirst({
    where: { singleton: true },
  });
  if (existing) return existing;

  return prisma.firmCorpus.create({
    data: {
      name: "Vex&Co Firm Corpus",
      singleton: true,
    },
  });
}

// ─── Document Queries ────────────────────────────────────────────────────────

export interface CorpusDocumentFilters {
  documentType?: CorpusDocumentType;
  industry?: string;
  outcome?: string;
  provenance?: string;
  archived?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
}

export async function getCorpusDocuments(filters: CorpusDocumentFilters = {}) {
  const corpus = await getFirmCorpus();
  const { documentType, industry, outcome, provenance, archived = false, search, page = 1, pageSize = 50 } = filters;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { corpusId: corpus.id, archived };

  if (documentType) where.documentType = documentType;
  if (industry) where.industry = industry;
  if (outcome) where.outcome = outcome;
  if (provenance) where.provenance = provenance;
  if (search) {
    where.OR = [
      { driveFileName: { contains: search, mode: "insensitive" } },
      { extractedSummary: { contains: search, mode: "insensitive" } },
    ];
  }

  const [documents, total] = await Promise.all([
    prisma.corpusDocument.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.corpusDocument.count({ where }),
  ]);

  return { documents, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

// ─── Stats ───────────────────────────────────────────────────────────────────

export async function getCorpusStats() {
  const corpus = await getFirmCorpus();

  const [total, failedCount, byType, byOutcome] = await Promise.all([
    prisma.corpusDocument.count({ where: { corpusId: corpus.id } }),
    prisma.corpusDocument.count({ where: { corpusId: corpus.id, processingError: { not: null } } }),
    prisma.corpusDocument.groupBy({
      by: ["documentType"],
      where: { corpusId: corpus.id },
      _count: true,
    }),
    prisma.corpusDocument.groupBy({
      by: ["outcome"],
      where: { corpusId: corpus.id },
      _count: true,
    }),
  ]);

  return {
    total,
    failedCount,
    byType: byType.map((g) => ({ type: g.documentType, count: g._count })),
    byOutcome: byOutcome.map((g) => ({ outcome: g.outcome, count: g._count })),
    lastSyncedAt: corpus.lastSyncedAt,
    syncStatus: corpus.syncStatus,
    syncProgress: corpus.syncProgress,
    driveFolderId: corpus.driveFolderId,
    driveFolderUrl: corpus.driveFolderUrl,
  };
}

// ─── Update Corpus Config ────────────────────────────────────────────────────

export async function updateCorpusConfig(data: {
  driveFolderId?: string;
  driveFolderUrl?: string;
  description?: string;
}) {
  const corpus = await getFirmCorpus();
  return prisma.firmCorpus.update({
    where: { id: corpus.id },
    data,
  });
}
