// =============================================================================
// FirmInsight matcher unico — politica hibrida con filtro NAICS.
// Reemplaza la logica duplicada en agents/chat/route.ts y firm-insights/relevant.
// =============================================================================

import { prisma } from "@/lib/db";
import { isSectorTrusted } from "./naics";

export interface MatcherInput {
  projectId: string;
  userId: string;
  topN?: number;
}

export interface MatchedInsight {
  id: string;
  title: string;
  content: string;
  insightType: string;
  tags: string[];
  validatedByUser: boolean;
  confidence: number;
  sourceProject: { id: string; title: string } | null;
}

function extractKeywords(texts: Array<string | null | undefined>): string[] {
  const keywords: string[] = [];
  texts
    .filter((t): t is string => Boolean(t))
    .forEach((text) => {
      text
        .toLowerCase()
        .split(/[\s,.\-_/]+/)
        .filter((w) => w.length > 3)
        .forEach((w) => {
          if (!keywords.includes(w)) keywords.push(w);
        });
    });
  return keywords;
}

export async function matchInsightsForProject(
  input: MatcherInput
): Promise<MatchedInsight[]> {
  const { projectId, userId, topN = 10 } = input;

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    select: {
      id: true,
      title: true,
      description: true,
      concept: true,
      targetMarket: true,
      tags: true,
      naicsSector: true,
      naicsSectorConfidence: true,
      naicsSectorReviewed: true,
    },
  });
  if (!project) return [];

  const projectSectorTrusted = isSectorTrusted(
    project.naicsSector,
    project.naicsSectorConfidence,
    project.naicsSectorReviewed
  );

  const projectKeywords = extractKeywords([
    project.title,
    project.description,
    project.concept,
    project.targetMarket,
    ...(project.tags ?? []),
  ]);

  // Pull bigger pool than necesario para tener material despues del filtro.
  const pool = await prisma.firmInsight.findMany({
    where: {
      isActive: true,
      ownerId: userId,
      sourceProjectId: { not: projectId },
    },
    include: { sourceProject: { select: { id: true, title: true } } },
    orderBy: [{ confidence: "desc" }, { updatedAt: "desc" }],
    take: 60,
  });

  const sectorFiltered = pool.filter((insight) => {
    const insightSectorTrusted = isSectorTrusted(
      insight.naicsSector,
      insight.naicsSectorConfidence,
      insight.naicsSectorReviewed
    );

    // Politica hibrida:
    // 1. Project sin sector confiable → todo pasa el filtro sectorial (cae a keyword).
    if (!projectSectorTrusted) return true;
    // 2. Project con sector confiable + insight sin sector confiable → tratado como transversal, pasa.
    if (!insightSectorTrusted) return true;
    // 3. Ambos confiables → AND estricto.
    return project.naicsSector === insight.naicsSector;
  });

  const keywordMatched = sectorFiltered.filter((insight) => {
    const insightText = `${insight.title} ${insight.content} ${insight.functionalDomain ?? ""} ${(insight.tags ?? []).join(" ")}`.toLowerCase();
    return projectKeywords.some((kw) => insightText.includes(kw));
  });

  return keywordMatched.slice(0, topN).map((i) => ({
    id: i.id,
    title: i.title,
    content: i.content,
    insightType: i.insightType,
    tags: i.tags,
    validatedByUser: i.validatedByUser,
    confidence: i.confidence,
    sourceProject: i.sourceProject
      ? { id: i.sourceProject.id, title: i.sourceProject.title }
      : null,
  }));
}
