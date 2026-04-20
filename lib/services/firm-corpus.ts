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
  reviewed?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
}

export async function getCorpusDocuments(filters: CorpusDocumentFilters = {}) {
  const corpus = await getFirmCorpus();
  const { documentType, industry, outcome, provenance, archived = false, reviewed, search, page = 1, pageSize = 50 } = filters;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { corpusId: corpus.id, archived };

  if (documentType) where.documentType = documentType;
  if (industry) where.industry = industry;
  if (outcome) where.outcome = outcome;
  if (provenance) where.provenance = provenance;
  if (reviewed === true) where.reviewedAt = { not: null };
  else if (reviewed === false) where.reviewedAt = null;
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

  // Base where: documentos activos del corpus (no archivados)
  const activeWhere = { corpusId: corpus.id, archived: false };

  const [total, archivedCount, failedCount, byType, byOutcome] = await Promise.all([
    prisma.corpusDocument.count({ where: activeWhere }),
    prisma.corpusDocument.count({ where: { corpusId: corpus.id, archived: true } }),
    prisma.corpusDocument.count({ where: { ...activeWhere, processingError: { not: null } } }),
    prisma.corpusDocument.groupBy({
      by: ["documentType"],
      where: activeWhere,
      _count: true,
    }),
    prisma.corpusDocument.groupBy({
      by: ["outcome"],
      where: activeWhere,
      _count: true,
    }),
  ]);

  return {
    total,
    archivedCount,
    failedCount,
    byType: byType.map((g) => ({ type: g.documentType, count: g._count })),
    byOutcome: byOutcome.map((g) => ({ outcome: g.outcome, count: g._count })),
  };
}

// ─── Update Corpus Config ────────────────────────────────────────────────────

export async function updateCorpusConfig(data: {
  description?: string;
}) {
  const corpus = await getFirmCorpus();
  return prisma.firmCorpus.update({
    where: { id: corpus.id },
    data,
  });
}
