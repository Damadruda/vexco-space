// =============================================================================
// VEXCO-LAB ENGINE — CROSS-PORTFOLIO INTELLIGENCE
// Analyzes synergies across projects, channels, and prospects.
// Uses Gemini Pro for affinity scoring and meta-project proposals.
// =============================================================================

import { prisma } from "@/lib/db";
import { callLLM } from "@/lib/clients/llm";
import { z } from "zod";

// ─── Zod Schemas for Gemini Output Validation ────────────────────────────────

const AffinityPairSchema = z.object({
  projectAId: z.string(),
  projectBId: z.string(),
  audience: z.number().min(0).max(100),
  valueProp: z.number().min(0).max(100),
  channels: z.number().min(0).max(100),
  deliverables: z.number().min(0).max(100),
  overall: z.number().min(0).max(100),
  rationale: z.string(),
});

const MetaProjectProposalSchema = z.object({
  name: z.string(),
  narrative: z.string(),
  componentProjectIds: z.array(z.string()),
  roles: z.record(z.string(), z.enum(["anchor", "complement", "enabler"])).optional(),
  suggestedMilestones: z.array(z.object({
    title: z.string(),
    description: z.string().optional(),
    dependsOnProjectIds: z.array(z.string()).optional(),
  })),
  rationale: z.string(),
  clusterAvgScore: z.number(),
});

const ChannelRoutingSchema = z.object({
  channelId: z.string(),
  recommendedProjectIds: z.array(z.string()),
  rationale: z.string(),
  nextAction: z.string(),
});

const ProspectRoutingSchema = z.object({
  prospectId: z.string(),
  fits: z.array(z.object({
    projectId: z.string(),
    fitScore: z.number().min(0).max(100),
    rationale: z.string(),
  })),
  primaryProjectId: z.string(),
  nextAction: z.string(),
});

const CrossPortfolioOutputSchema = z.object({
  affinityMatrix: z.array(AffinityPairSchema),
  metaProjectProposals: z.array(MetaProjectProposalSchema),
  channelRouting: z.array(ChannelRoutingSchema),
  prospectRouting: z.array(ProspectRoutingSchema),
});

type CrossPortfolioOutput = z.infer<typeof CrossPortfolioOutputSchema>;

// ─── Main Analysis Function ──────────────────────────────────────────────────

export async function analyzeCrossPortfolio(opts: {
  triggeredBy: string;
}): Promise<{ analysisId: string; status: "completed" | "failed"; errorMessage?: string }> {
  // 1. Load verified context from DB
  const [projects, channels, prospects] = await Promise.all([
    prisma.project.findMany({
      where: { isArchived: false },
      include: {
        firmInsights: { take: 5, orderBy: { createdAt: "desc" } },
        driveDocSummaries: { select: { id: true } },
        channelLinks: { include: { channel: true } },
        prospectFits: { include: { prospect: true } },
      },
    }),
    prisma.channel.findMany({
      include: { channelProjects: true },
    }),
    prisma.prospect.findMany({
      include: { fits: true },
    }),
  ]);

  console.log("[CROSS-PORTFOLIO] Verified counts:", {
    projects: projects.length,
    channels: channels.length,
    prospects: prospects.length,
  });

  if (projects.length < 2) {
    return {
      analysisId: "",
      status: "failed",
      errorMessage: "Se necesitan al menos 2 proyectos activos para el analisis cross-portfolio.",
    };
  }

  // 2. Create running analysis record
  const analysis = await prisma.crossPortfolioAnalysis.create({
    data: {
      status: "running",
      agentVersion: "gemini-pro-sprint-m",
      affinityMatrix: [],
      metaProjectProposals: [],
      channelRouting: [],
      prospectRouting: [],
      triggeredBy: opts.triggeredBy,
    },
  });

  try {
    // 3. Build project context for prompt
    const projectContext = projects.map((p) => ({
      id: p.id,
      name: p.title,
      description: p.description || "Sin descripcion",
      trackType: p.trackType,
      revenueProximityScore: p.revenueProximityScore,
      stepsToRevenue: p.stepsToRevenue,
      valueProposition: p.valueProposition || null,
      targetMarket: p.targetMarket || null,
      businessModel: p.businessModel || null,
      driveDocsCount: p.driveDocSummaries.length,
      firmInsights: p.firmInsights.map((fi) => ({
        title: fi.title,
        type: fi.insightType,
        domain: fi.domain,
      })),
      existingChannels: p.channelLinks.map((cl) => cl.channel.name),
    }));

    const channelContext = channels.map((ch) => ({
      id: ch.id,
      name: ch.name,
      type: ch.type,
      relationshipStage: ch.relationshipStage,
      linkedProjectCount: ch.channelProjects.length,
    }));

    const prospectContext = prospects.map((pr) => ({
      id: pr.id,
      name: pr.name,
      company: pr.company,
      stage: pr.stage,
      estimatedDealValue: pr.estimatedDealValue,
      existingFitsCount: pr.fits.length,
    }));

    const validProjectIds = new Set(projects.map((p) => p.id));
    const validChannelIds = new Set(channels.map((c) => c.id));
    const validProspectIds = new Set(prospects.map((p) => p.id));

    // 4. Build prompt
    const systemPrompt = `Eres el motor de inteligencia cross-portfolio de Vex&Co Lab.
Analizas sinergias estructurales entre vehiculos de monetizacion.

REGLA #0.5 — ANTI-ALUCINACION (CRITICO):
Solo puedes referenciar entidades cuyos IDs aparecen en la lista proporcionada.
Cualquier ID que inventes invalida toda la corrida.
No inventes nombres de proyectos, canales ni prospects.

Devuelve SOLO JSON valido. Sin markdown, sin texto extra.`;

    const userPrompt = `PROYECTOS ACTIVOS (${projects.length}):
${JSON.stringify(projectContext, null, 2)}

CANALES (${channels.length}):
${channels.length > 0 ? JSON.stringify(channelContext, null, 2) : "No hay canales registrados. channelRouting debe ser array vacio."}

PROSPECTS (${prospects.length}):
${prospects.length > 0 ? JSON.stringify(prospectContext, null, 2) : "No hay prospects registrados. prospectRouting debe ser array vacio."}

INSTRUCCIONES:
Genera un JSON con estos 4 bloques:

1. "affinityMatrix": Para cada par de proyectos (combinaciones, no permutaciones), scorea 4 ejes (0-100):
   - audience: superposicion de segmento objetivo
   - valueProp: complementariedad de propuesta de valor
   - channels: canales de distribucion compartidos o sinergicos
   - deliverables: entregables que se potencian mutuamente
   - overall: promedio ponderado (audience 30%, valueProp 30%, channels 20%, deliverables 20%)
   - rationale: 1-2 oraciones explicando la relacion

2. "metaProjectProposals": Clusters de proyectos con overall promedio >= 70 Y que comparten al menos audiencia o canales. Cada propuesta:
   - name: nombre tentativo del programa
   - narrative: 3-5 oraciones de narrativa unificada
   - componentProjectIds: IDs de los proyectos del cluster
   - roles: objeto { projectId: "anchor"|"complement"|"enabler" }
   - suggestedMilestones: 3-5 hitos del meta-nivel con title, description, dependsOnProjectIds
   - rationale: por que estos proyectos forman un programa
   - clusterAvgScore: promedio del overall de los pares dentro del cluster

3. "channelRouting": Para cada canal, mapea a 1+ proyectos recomendados con rationale y nextAction.
   Si no hay canales, devuelve array vacio [].

4. "prospectRouting": Para cada prospect, mapea a 1+ proyectos con fitScore (0-100) y rationale.
   Marca primaryProjectId al de mayor fit. Si no hay prospects, devuelve array vacio [].

RECUERDA: Solo usa IDs de la lista. Cualquier ID inventado = corrida invalida.`;

    // 5. Call Gemini Pro
    const llmResponse = await callLLM({
      model: "gemini-pro",
      systemPrompt,
      userPrompt,
      jsonMode: true,
      temperature: 0.4,
    });

    // 6. Parse and validate with Zod
    let parsed: CrossPortfolioOutput;
    try {
      const jsonMatch = llmResponse.content.match(/\{[\s\S]*\}/);
      const raw = JSON.parse(jsonMatch ? jsonMatch[0] : llmResponse.content);
      parsed = CrossPortfolioOutputSchema.parse(raw);
    } catch (zodErr) {
      const errMsg = zodErr instanceof z.ZodError
        ? zodErr.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ")
        : String(zodErr);

      await prisma.crossPortfolioAnalysis.update({
        where: { id: analysis.id },
        data: { status: "failed", errorMessage: `Zod validation failed: ${errMsg}` },
      });
      return { analysisId: analysis.id, status: "failed", errorMessage: errMsg };
    }

    // 7. Verify referential integrity
    const invalidIds: string[] = [];

    for (const pair of parsed.affinityMatrix) {
      if (!validProjectIds.has(pair.projectAId)) invalidIds.push(pair.projectAId);
      if (!validProjectIds.has(pair.projectBId)) invalidIds.push(pair.projectBId);
    }
    for (const proposal of parsed.metaProjectProposals) {
      for (const pid of proposal.componentProjectIds) {
        if (!validProjectIds.has(pid)) invalidIds.push(pid);
      }
      for (const ms of proposal.suggestedMilestones) {
        for (const depId of ms.dependsOnProjectIds ?? []) {
          if (!validProjectIds.has(depId)) invalidIds.push(depId);
        }
      }
    }
    for (const cr of parsed.channelRouting) {
      if (!validChannelIds.has(cr.channelId)) invalidIds.push(cr.channelId);
      for (const pid of cr.recommendedProjectIds) {
        if (!validProjectIds.has(pid)) invalidIds.push(pid);
      }
    }
    for (const pr of parsed.prospectRouting) {
      if (!validProspectIds.has(pr.prospectId)) invalidIds.push(pr.prospectId);
      if (!validProjectIds.has(pr.primaryProjectId)) invalidIds.push(pr.primaryProjectId);
      for (const fit of pr.fits) {
        if (!validProjectIds.has(fit.projectId)) invalidIds.push(fit.projectId);
      }
    }

    if (invalidIds.length > 0) {
      const errMsg = `IDs inventados detectados: ${[...new Set(invalidIds)].join(", ")}`;
      await prisma.crossPortfolioAnalysis.update({
        where: { id: analysis.id },
        data: { status: "failed", errorMessage: errMsg },
      });
      return { analysisId: analysis.id, status: "failed", errorMessage: errMsg };
    }

    // 8. Persist completed result
    await prisma.crossPortfolioAnalysis.update({
      where: { id: analysis.id },
      data: {
        status: "completed",
        completedAt: new Date(),
        affinityMatrix: parsed.affinityMatrix as unknown as Record<string, unknown>[],
        metaProjectProposals: parsed.metaProjectProposals as unknown as Record<string, unknown>[],
        channelRouting: parsed.channelRouting as unknown as Record<string, unknown>[],
        prospectRouting: parsed.prospectRouting as unknown as Record<string, unknown>[],
      },
    });

    return { analysisId: analysis.id, status: "completed" };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await prisma.crossPortfolioAnalysis.update({
      where: { id: analysis.id },
      data: { status: "failed", errorMessage: errMsg },
    });
    return { analysisId: analysis.id, status: "failed", errorMessage: errMsg };
  }
}

// ─── Instantiate MetaProject from Proposal ───────────────────────────────────

export async function instantiateMetaProjectFromProposal(args: {
  analysisId: string;
  proposalIndex: number;
  overrides?: { name?: string; narrative?: string };
  ownerId: string;
}): Promise<{ metaProjectId: string }> {
  const analysis = await prisma.crossPortfolioAnalysis.findUnique({
    where: { id: args.analysisId },
  });

  if (!analysis || analysis.status !== "completed") {
    throw new Error("Analisis no encontrado o no completado");
  }

  const proposals = analysis.metaProjectProposals as unknown as Array<{
    name: string;
    narrative: string;
    componentProjectIds: string[];
    roles?: Record<string, string>;
    suggestedMilestones: Array<{
      title: string;
      description?: string;
      dependsOnProjectIds?: string[];
    }>;
    clusterAvgScore: number;
  }>;

  const proposal = proposals[args.proposalIndex];
  if (!proposal) {
    throw new Error(`Propuesta index ${args.proposalIndex} no encontrada`);
  }

  // Extract affinity snapshot for this cluster's pairs
  const matrix = analysis.affinityMatrix as unknown as Array<{
    projectAId: string;
    projectBId: string;
    overall: number;
  }>;
  const clusterIds = new Set(proposal.componentProjectIds);
  const affinitySnapshot = matrix.filter(
    (pair) => clusterIds.has(pair.projectAId) && clusterIds.has(pair.projectBId)
  );

  const metaProject = await prisma.metaProject.create({
    data: {
      name: args.overrides?.name || proposal.name,
      narrative: args.overrides?.narrative || proposal.narrative,
      status: "active",
      affinitySnapshot: affinitySnapshot,
      revenueScore: null,
      ownerId: args.ownerId,
      components: {
        create: proposal.componentProjectIds.map((pid) => ({
          projectId: pid,
          role: proposal.roles?.[pid] || "complement",
        })),
      },
      milestones: {
        create: proposal.suggestedMilestones.map((ms) => ({
          title: ms.title,
          description: ms.description || null,
          status: "pending",
          dependsOnProjectIds: ms.dependsOnProjectIds || [],
        })),
      },
    },
  });

  return { metaProjectId: metaProject.id };
}

// ─── Apply Channel Routing ───────────────────────────────────────────────────

export async function applyChannelRouting(args: {
  analysisId: string;
  routingIndex: number;
}): Promise<{ created: number; updated: number }> {
  const analysis = await prisma.crossPortfolioAnalysis.findUnique({
    where: { id: args.analysisId },
  });

  if (!analysis || analysis.status !== "completed") {
    throw new Error("Analisis no encontrado o no completado");
  }

  const routings = analysis.channelRouting as unknown as Array<{
    channelId: string;
    recommendedProjectIds: string[];
    rationale: string;
  }>;

  const routing = routings[args.routingIndex];
  if (!routing) {
    throw new Error(`Routing index ${args.routingIndex} no encontrado`);
  }

  let created = 0;
  let updated = 0;

  for (const projectId of routing.recommendedProjectIds) {
    const existing = await prisma.channelProject.findUnique({
      where: { channelId_projectId: { channelId: routing.channelId, projectId } },
    });

    if (existing) {
      await prisma.channelProject.update({
        where: { id: existing.id },
        data: {
          fitRationale: routing.rationale,
          activationStatus: "proposed",
          lastTouchAt: new Date(),
        },
      });
      updated++;
    } else {
      await prisma.channelProject.create({
        data: {
          channelId: routing.channelId,
          projectId,
          fitRationale: routing.rationale,
          activationStatus: "proposed",
          lastTouchAt: new Date(),
        },
      });
      created++;
    }
  }

  return { created, updated };
}

// ─── Apply Prospect Routing ──────────────────────────────────────────────────

export async function applyProspectRouting(args: {
  analysisId: string;
  routingIndex: number;
}): Promise<{ created: number; updated: number }> {
  const analysis = await prisma.crossPortfolioAnalysis.findUnique({
    where: { id: args.analysisId },
  });

  if (!analysis || analysis.status !== "completed") {
    throw new Error("Analisis no encontrado o no completado");
  }

  const routings = analysis.prospectRouting as unknown as Array<{
    prospectId: string;
    fits: Array<{ projectId: string; fitScore: number; rationale: string }>;
    primaryProjectId: string;
  }>;

  const routing = routings[args.routingIndex];
  if (!routing) {
    throw new Error(`Routing index ${args.routingIndex} no encontrado`);
  }

  let created = 0;
  let updated = 0;

  for (const fit of routing.fits) {
    const existing = await prisma.prospectFit.findUnique({
      where: { prospectId_projectId: { prospectId: routing.prospectId, projectId: fit.projectId } },
    });

    const isPrimary = fit.projectId === routing.primaryProjectId;

    if (existing) {
      await prisma.prospectFit.update({
        where: { id: existing.id },
        data: {
          fitScore: fit.fitScore,
          rationale: fit.rationale,
          isPrimary,
        },
      });
      updated++;
    } else {
      await prisma.prospectFit.create({
        data: {
          prospectId: routing.prospectId,
          projectId: fit.projectId,
          fitScore: fit.fitScore,
          rationale: fit.rationale,
          isPrimary,
        },
      });
      created++;
    }
  }

  return { created, updated };
}
