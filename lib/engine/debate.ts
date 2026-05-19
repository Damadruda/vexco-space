// =============================================================================
// VEXCO-LAB ENGINE — FULL DEBATE (3-Phase Async)
// Selecting agents → Phase 1 Analysis → Phase 2 Confrontation → Phase 3 Synthesis
// =============================================================================

import { randomUUID } from "crypto";
import { callLLM } from "@/lib/clients/llm";
import { routeToAgent } from "@/lib/engine/router";
import { getAgentConfig } from "@/lib/engine/agents";
import { loadProjectMemory } from "@/lib/engine/supervisor";
import { prisma } from "@/lib/db";
import type { AgentResult } from "@/lib/engine/types";

export type DebatePhase =
  | "selecting_agents"
  | "phase1_analysis"
  | "phase1_review"
  | "phase2_confrontation"
  | "phase2_review"
  | "phase3_synthesis"
  | "phase3_review"
  | "completed";

export interface DebateSession {
  id: string;
  projectId: string;
  userId: string;
  topic: string;
  phase: DebatePhase;
  selectedAgents: string[];
  phase1Results: AgentResult[];
  phase2Results: AgentResult[];
  synthesisResult: AgentResult | null;
  humanFeedback: string[];
  createdAt: Date;
}

// ─── In-memory store ──────────────────────────────────────────────────────────

const debateSessions = new Map<string, DebateSession>();

// ─── DB Persistence (fire-and-forget) ─────────────────────────────────────────

function persistDebate(session: DebateSession): void {
  prisma.warRoomSession
    .upsert({
      where: { id: session.id },
      create: {
        id: session.id,
        projectId: session.projectId,
        userId: session.userId,
        phase: `debate_${session.phase}`,
        supervisorPlan: { topic: session.topic, mode: "full_debate" } as Record<string, unknown>,
        agentResult: session as unknown as Record<string, unknown>,
        history: [],
      },
      update: {
        phase: `debate_${session.phase}`,
        agentResult: session as unknown as Record<string, unknown>,
        updatedAt: new Date(),
      },
    })
    .catch((err: unknown) => console.warn("[DEBATE] persist failed:", err));
}

// ─── Start Debate ─────────────────────────────────────────────────────────────

export async function startDebate(
  projectId: string,
  userId: string,
  topic: string
): Promise<DebateSession> {
  const memory = await loadProjectMemory(projectId, userId);

  const agentSelectionPrompt = `Eres el Autonomous Strategist de Vex&Co Lab.

REGLAS: Responde SOLO con JSON válido. Sin markdown. Sin texto extra.

Analiza este tema de debate: "${topic}"

Proyecto: ${(memory?.project as Record<string, unknown>)?.title ?? "Sin nombre"}
Descripción: ${(memory?.project as Record<string, unknown>)?.description ?? "Sin descripción"}

Selecciona los 3-4 agentes más relevantes para analizar este tema desde diferentes perspectivas.
Agentes disponibles: revenue, redteam, navigator, innovation, workflow, infrastructure, narrative

Devuelve SOLO este JSON:
{
  "selectedAgents": ["id1", "id2", "id3"],
  "reasoning": "por qué estos agentes para este tema específico"
}`;

  const response = await callLLM({
    tier: "T1",
    systemPrompt:
      "Eres un estratega que selecciona el panel de expertos óptimo para un debate.",
    userPrompt: agentSelectionPrompt,
    jsonMode: true,
    temperature: 0.3,
  });

  let selectedAgents = ["revenue", "redteam", "infrastructure"];
  try {
    const parsed = JSON.parse(response.content) as { selectedAgents?: string[] };
    if (Array.isArray(parsed.selectedAgents) && parsed.selectedAgents.length >= 2) {
      selectedAgents = parsed.selectedAgents.slice(0, 4);
    }
  } catch {
    // fallback to defaults
  }

  const session: DebateSession = {
    id: randomUUID(),
    projectId,
    userId,
    topic,
    phase: "selecting_agents",
    selectedAgents,
    phase1Results: [],
    phase2Results: [],
    synthesisResult: null,
    humanFeedback: [],
    createdAt: new Date(),
  };

  debateSessions.set(session.id, session);
  persistDebate(session);
  return session;
}

// ─── Phase 1: Independent Analysis ───────────────────────────────────────────

export async function executePhase1(session: DebateSession): Promise<DebateSession> {
  session.phase = "phase1_analysis";
  debateSessions.set(session.id, session);

  const memory = await loadProjectMemory(session.projectId, session.userId);
  const decisions = await prisma.decisionLog.findMany({
    where: { projectId: session.projectId },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const settled = await Promise.allSettled(
    session.selectedAgents.map(async (agentId) => {
      const supervisorPlan = {
        analysis: `Debate sobre: ${session.topic}`,
        proposedAction: `Analiza independientemente este tema desde tu perspectiva: "${session.topic}"`,
        targetAgentId: agentId,
        reasoning: "Full Debate — análisis independiente fase 1",
        priority: "high" as const,
        estimatedScope: `Análisis especializado de "${session.topic}"`,
      };

      return routeToAgent(
        agentId,
        memory ?? {},
        supervisorPlan,
        decisions,
        session.userId
      );
    })
  );

  const results: AgentResult[] = [];
  settled.forEach((result, i) => {
    if (result.status === "fulfilled") {
      results.push(result.value);
    } else {
      console.warn(`[DEBATE] Phase 1 agent ${session.selectedAgents[i]} failed:`, result.reason);
    }
  });

  session.phase1Results = results;
  session.phase = "phase1_review";
  debateSessions.set(session.id, session);
  persistDebate(session);
  return session;
}

// ─── Phase 2: Confrontation ───────────────────────────────────────────────────

export async function executePhase2(session: DebateSession): Promise<DebateSession> {
  session.phase = "phase2_confrontation";
  debateSessions.set(session.id, session);

  const memory = await loadProjectMemory(session.projectId, session.userId);
  const decisions = await prisma.decisionLog.findMany({
    where: { projectId: session.projectId },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const otherOpinionsSummary = session.phase1Results
    .map(
      (r) =>
        `**${r.agentName}**: ${r.content.summary}\n${r.content.sections
          .map((s) => `- ${s.heading}: ${s.content}`)
          .join("\n")}`
    )
    .join("\n\n---\n\n");

  const humanDirective = session.humanFeedback.length > 0
    ? `\n\nDIRECTRIZ DEL USUARIO: "${session.humanFeedback.join(". ")}"\nTu confrontación DEBE centrarse en responder a esta directriz específica.`
    : "";

  const confrontationSettled = await Promise.allSettled(
    session.selectedAgents.map(async (agentId) => {
      const myResult = session.phase1Results.find((r) => r.agentId === agentId);
      const agentConfig = getAgentConfig(agentId);

      const supervisorPlan = {
        analysis: `Fase 2 del debate: "${session.topic}"${humanDirective}`,
        proposedAction: `CONFRONTACIÓN: Ya hiciste tu análisis independiente. Ahora revisa lo que dijeron tus colegas (en CONTEXTO DEL DEBATE) y:
1. Señala dónde coincides y por qué
2. Señala dónde discrepas con argumentos concretos
3. Identifica puntos ciegos que nadie mencionó
${session.humanFeedback.length > 0 ? `4. Responde directamente a la directriz del usuario: "${session.humanFeedback.join(". ")}"` : ""}
NO repitas tu análisis general. Esto es una confrontación de ideas, no un análisis nuevo.`,
        targetAgentId: agentId,
        reasoning: "Full Debate — confrontación fase 2. Debes REFERENCIAR los análisis de tus colegas por nombre.",
        priority: "high" as const,
        estimatedScope: `Revisión crítica desde perspectiva de ${agentConfig?.name ?? agentId}`,
      };

      const enhancedMemory = {
        ...memory,
        debateContext: {
          topic: session.topic,
          myPreviousAnalysis: myResult?.content.summary ?? "",
          otherAgentsAnalyses: otherOpinionsSummary,
          humanFeedback: session.humanFeedback.join("\n"),
        },
      };

      return routeToAgent(
        agentId,
        enhancedMemory as Record<string, unknown>,
        supervisorPlan,
        decisions,
        session.userId
      );
    })
  );

  const confrontationResults: AgentResult[] = [];
  confrontationSettled.forEach((result, i) => {
    if (result.status === "fulfilled") {
      confrontationResults.push(result.value);
    } else {
      console.warn(`[DEBATE] Phase 2 agent ${session.selectedAgents[i]} failed:`, result.reason);
    }
  });

  const redTeamPlan = {
    analysis: `Stress test del debate completo sobre: "${session.topic}"${humanDirective}`,
    proposedAction: `STRESS TEST: Lee TODOS los análisis de tus colegas (en CONTEXTO DEL DEBATE) y:
1. Identifica los 3 supuestos más peligrosos que todos asumen sin cuestionar
2. Señala datos faltantes que invalidan las conclusiones
3. Describe el peor escenario realista si se ejecuta el plan propuesto
${session.humanFeedback.length > 0 ? `4. Evalúa críticamente la directriz del usuario: "${session.humanFeedback.join(". ")}"` : ""}
Sé brutal. Tu trabajo es destruir los supuestos débiles antes de que el mercado lo haga.`,
    targetAgentId: "redteam",
    reasoning: "Full Debate — Red Team. Debes cuestionar TODO, incluyendo los puntos de consenso.",
    priority: "high" as const,
    estimatedScope: "Stress test integral del debate",
  };

  const redTeamMemory = {
    ...memory,
    debateContext: {
      topic: session.topic,
      allAnalyses: otherOpinionsSummary,
      humanFeedback: session.humanFeedback.join("\n"),
    },
  };

  const redTeamResult = await routeToAgent(
    "redteam",
    redTeamMemory as Record<string, unknown>,
    redTeamPlan,
    decisions,
    session.userId
  );

  session.phase2Results = [...confrontationResults, redTeamResult];
  session.phase = "phase2_review";
  debateSessions.set(session.id, session);
  persistDebate(session);
  return session;
}

// ─── Phase 3: Synthesis ───────────────────────────────────────────────────────

export async function executePhase3(
  session: DebateSession,
  humanFeedback: string
): Promise<DebateSession> {
  if (humanFeedback) session.humanFeedback.push(humanFeedback);
  session.phase = "phase3_synthesis";
  debateSessions.set(session.id, session);

  const memory = await loadProjectMemory(session.projectId, session.userId);
  const decisions = await prisma.decisionLog.findMany({
    where: { projectId: session.projectId },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const phase1Summary = session.phase1Results
    .map((r) => `**${r.agentName}** (análisis): ${r.content.summary}`)
    .join("\n");

  const phase2Summary = session.phase2Results
    .map((r) => `**${r.agentName}** (confrontación): ${r.content.summary}`)
    .join("\n");

  const redTeamResult = session.phase2Results.find((r) => r.agentId === "redteam");

  const synthesisPlan = {
    analysis: `Debate completo sobre "${session.topic}" — síntesis final`,
    proposedAction: `SÍNTESIS ESTRATÉGICA: Tienes acceso a todo el debate (análisis + confrontación + Red Team) en CONTEXTO DEL DEBATE. Genera:
1. Los 3 consensos principales con nivel de confianza
2. Los 2-3 desacuerdos irresueltos y cuál es más probable correcto
3. Recomendaciones MoSCoW (Must/Should/Could/Won't) accionables
4. Decisiones que el usuario debe tomar AHORA vs las que puede postergar
${session.humanFeedback.length > 0 ? `5. Respuesta directa a la directriz del usuario: "${session.humanFeedback.join(". ")}"` : ""}
Prioriza lo accionable sobre lo teórico.`,
    targetAgentId: "strategist",
    reasoning: "Full Debate — síntesis final. Integra TODOS los puntos de vista del debate.",
    priority: "high" as const,
    estimatedScope: "Síntesis estratégica consolidada con MoSCoW",
  };

  const synthesisMemory = {
    ...memory,
    debateContext: {
      topic: session.topic,
      phase1Summary,
      phase2Summary,
      redTeamFindings: redTeamResult?.content.summary ?? "",
      humanFeedback: session.humanFeedback.join("\n"),
    },
  };

  // Synthesis is high-stakes consolidation → escalate to Opus
  const synthesisResult = await routeToAgent(
    "strategist",
    synthesisMemory as Record<string, unknown>,
    synthesisPlan,
    decisions,
    session.userId,
    { tier: "T3", escalated: true }
  );

  session.synthesisResult = synthesisResult;
  session.phase = "phase3_review";
  debateSessions.set(session.id, session);
  persistDebate(session);
  return session;
}

// ─── Getters (with DB fallback for serverless) ────────────────────────────────

export async function getDebateSession(sessionId: string): Promise<DebateSession | null> {
  // 1. Check in-memory first
  const inMemory = debateSessions.get(sessionId);
  if (inMemory) return inMemory;

  // 2. Fallback to DB
  try {
    const dbSession = await prisma.warRoomSession.findUnique({
      where: { id: sessionId },
    });
    if (!dbSession || !dbSession.phase?.startsWith("debate_")) return null;

    // Reconstruct DebateSession from DB
    const stored = dbSession.agentResult as unknown as DebateSession;
    if (!stored || !stored.id) return null;

    // Re-hydrate into memory for subsequent calls in this invocation
    debateSessions.set(stored.id, stored);
    return stored;
  } catch (err) {
    console.error("[DEBATE] DB fallback failed:", err);
    return null;
  }
}

export async function getDebateByProject(projectId: string): Promise<DebateSession | null> {
  // 1. Check in-memory first
  for (const session of debateSessions.values()) {
    if (session.projectId === projectId && session.phase !== "completed") {
      return session;
    }
  }

  // 2. Fallback to DB
  try {
    const dbSession = await prisma.warRoomSession.findFirst({
      where: {
        projectId,
        phase: { startsWith: "debate_", not: "debate_completed" },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!dbSession) return null;

    const stored = dbSession.agentResult as unknown as DebateSession;
    if (!stored || !stored.id) return null;

    debateSessions.set(stored.id, stored);
    return stored;
  } catch (err) {
    console.error("[DEBATE] DB fallback (by project) failed:", err);
    return null;
  }
}
