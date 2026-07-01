import { prisma } from "@/lib/db";
import { ProposalSourceType, ProposalTargetType } from "@prisma/client";
import type { StageBResult } from "./stage-b-analyzer";

interface InboxItemLike {
  id: string;
  userId: string;
  tags: string[];
  sourceTitle: string | null;
  sourceUrl: string | null;
}

// Crea/actualiza una LabProposal desde un recurso del Inbox.
// Idempotente por (INBOX_RESOURCE, sourceRef=item.id). No resucita decisiones ya tomadas.
// No re-throw: un fallo de propuesta nunca rompe el análisis del recurso.
export async function upsertLabProposalFromResource(
  item: InboxItemLike,
  stageB: StageBResult
): Promise<void> {
  try {
    const manualLab = item.tags.some(
      (t) => t.toLowerCase() === "lab" || t.toLowerCase() === "#lab"
    );
    const shouldPropose = stageB.labRelevant === true || manualLab;
    if (!shouldPropose) return;

    const existing = await prisma.labProposal.findFirst({
      where: {
        sourceType: ProposalSourceType.INBOX_RESOURCE,
        sourceRef: item.id,
        ownerId: item.userId,
      },
    });
    // Respeta accept/reject/apply de Diego: si ya no está PENDING, no la tocamos.
    if (existing && existing.status !== "PENDING") return;

    const rawTarget = stageB.labTargetType;
    const targetType =
      rawTarget && rawTarget in ProposalTargetType
        ? ProposalTargetType[rawTarget as keyof typeof ProposalTargetType]
        : ProposalTargetType.CORPUS;

    const title = `[Inbox] ${(item.sourceTitle ?? "Recurso").slice(0, 90)}`;
    const rationaleBase =
      stageB.labRationale?.trim() || "Recurso marcado como relevante para el Lab.";
    const rationale =
      manualLab && stageB.labRelevant !== true
        ? `[override manual #lab] ${rationaleBase}`
        : rationaleBase;
    const proposedChange =
      stageB.labProposedChange?.trim() || "Evaluar adopción del recurso en el Lab.";

    const data = {
      sourceType: ProposalSourceType.INBOX_RESOURCE,
      sourceRef: item.id,
      targetType,
      title,
      rationale,
      proposedChange,
      epistemicRegister: "ESTIMACIÓN / CRITERIO",
      evidence: {
        sourceUrl: item.sourceUrl,
        summary: stageB.summary,
        capability: stageB.capability ?? null,
      },
      confidence: manualLab ? 70 : 50,
      ownerId: item.userId,
    };

    if (existing) {
      await prisma.labProposal.update({ where: { id: existing.id }, data });
    } else {
      await prisma.labProposal.create({ data });
    }
  } catch (e) {
    console.error(
      "[LAB_PROPOSAL_FROM_RESOURCE]",
      e instanceof Error ? e.message : String(e)
    );
  }
}
