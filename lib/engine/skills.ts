// =============================================================================
// VEXCO-LAB ENGINE — SHARED SKILLS
// Transversal capabilities any agent can invoke.
// Skills are tools, not LLM assignments.
// =============================================================================

import { callLLM } from "@/lib/clients/llm";
import { getInspirationContext } from "./inspiration";
import { getAgentConfig } from "./agents";
import type { SupervisorPlan } from "./types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SkillResult {
  skill: string;
  data: string;
  sources?: string[];
  processingTimeMs: number;
}

// ─── Skill 0: Research decision (triage T1 — decide, no genera narrativa) ─────
export interface ResearchDecision {
  needsResearch: boolean;
  query: string;
  rationale: string;
}

export async function decideResearch(
  message: string,
  contextSlice: string
): Promise<ResearchDecision> {
  const system = `Sos un triage de research. Decidís si una consulta necesita DATOS EXTERNOS Y ACTUALES del mundo real (datos de mercado, regulación vigente, benchmarks del sector, competidores, cifras públicas) que NO estén ya en el contexto disponible. NO necesitan research: pedidos de reformular o editar texto, razonamiento sobre los datos propios del proyecto, opiniones, estructura o pricing que se deduce del caso. Si necesita research, armá UNA query de búsqueda enfocada (orientá a España/Latam cuando aplique). Respondé SOLO JSON válido, sin markdown.`;
  const user = `CONTEXTO DISPONIBLE (parcial):\n${contextSlice || "(vacío)"}\n\nCONSULTA DEL USUARIO:\n${message}\n\nDevolvé JSON: {"needsResearch": boolean, "query": string, "rationale": string}. Si needsResearch es false, query = "".`;
  try {
    const res = await callLLM({
      model: "gemini-flash",
      systemPrompt: system,
      userPrompt: user,
      jsonMode: true,
      temperature: 0.1,
    });
    const parsed = JSON.parse(res.content.replace(/```json\n?|\n?```/g, "").trim());
    return {
      needsResearch: !!parsed.needsResearch,
      query: typeof parsed.query === "string" ? parsed.query : "",
      rationale: typeof parsed.rationale === "string" ? parsed.rationale : "",
    };
  } catch (err) {
    console.warn("[SKILLS] decideResearch failed, defaulting to no research:", err);
    return { needsResearch: false, query: "", rationale: "decision failed" };
  }
}

// ─── Skill 1: Research via Perplexity ────────────────────────────────────────

export async function researchSkill(query: string): Promise<SkillResult> {
  const startTime = Date.now();

  const hasPerplexity = !!process.env.PERPLEXITY_API_KEY;

  const system = `Eres un analista de mercado especializado en España y Latinoamérica. Tus respuestas son directas, basadas en datos y sin adornos.`;

  const user = `Investiga con datos reales y actualizados: ${query}.
Incluye fuentes cuando estén disponibles. Prioriza datos de mercados España y Latam cuando sea relevante.
NO inventes estadísticas. Si no tienes datos recientes, indícalo claramente.`;

  try {
    const response = await callLLM({
      model: "perplexity-sonar",
      systemPrompt: system,
      userPrompt: user,
      jsonMode: false,
      temperature: 0.3,
    });

    const prefix = hasPerplexity
      ? "DATOS DE INVESTIGACIÓN [CLAIM EXTERNO — AFIRMADO POR LA FUENTE, SIN VERIFICAR] (Perplexity Sonar):"
      : "DATOS DE INVESTIGACIÓN [CLAIM EXTERNO — AFIRMADO POR LA FUENTE, SIN VERIFICAR] (sin Perplexity — datos no verificados en tiempo real):";

    return {
      skill: "research",
      data: `${prefix}\n${response.content}`,
      processingTimeMs: Date.now() - startTime,
    };
  } catch (err) {
    console.warn("[SKILLS] researchSkill failed, returning empty:", err);
    return {
      skill: "research",
      data: "",
      processingTimeMs: Date.now() - startTime,
    };
  }
}

// ─── Skill 2: Inspiration via Raindrop ───────────────────────────────────────

export async function inspirationSkill(
  userId: string,
  keywords: string[]
): Promise<SkillResult> {
  const startTime = Date.now();

  try {
    const context = await getInspirationContext(userId, keywords);
    return {
      skill: "inspiration",
      data: context,
      processingTimeMs: Date.now() - startTime,
    };
  } catch (err) {
    console.warn("[SKILLS] inspirationSkill failed, returning empty:", err);
    return {
      skill: "inspiration",
      data: "",
      processingTimeMs: Date.now() - startTime,
    };
  }
}

// ─── Skill 3: Cross-validation with another agent ────────────────────────────

export async function crossValidationSkill(
  agentId: string,
  content: string,
  projectMemory: Record<string, unknown>
): Promise<SkillResult> {
  const startTime = Date.now();

  const agent = getAgentConfig(agentId);
  if (!agent) {
    return {
      skill: "cross-validation",
      data: "",
      processingTimeMs: Date.now() - startTime,
    };
  }

  const project = projectMemory.project as Record<string, unknown>;

  const system = `${agent.consultingDNA}\n\n${agent.geographicContext}\n\n${agent.domainInstructions}`;

  const user = `Proyecto: ${project?.title ?? "Sin nombre"}

Revisa críticamente este análisis desde tu perspectiva de ${agent.role}.
Señala debilidades específicas, supuestos incorrectos y mejoras concretas.
Sé directo. Sin adornos.

ANÁLISIS A REVISAR:
${content}`;

  try {
    const response = await callLLM({
      model: agent.preferredLLM,
      systemPrompt: system,
      userPrompt: user,
      jsonMode: false,
      temperature: 0.5,
      maxTokens: 1024,
    });

    return {
      skill: "cross-validation",
      data: `REVISIÓN CRÍTICA (${agent.name}):\n${response.content}`,
      processingTimeMs: Date.now() - startTime,
    };
  } catch (err) {
    console.warn("[SKILLS] crossValidationSkill failed, returning empty:", err);
    return {
      skill: "cross-validation",
      data: "",
      processingTimeMs: Date.now() - startTime,
    };
  }
}

// ─── getRequiredSkills ────────────────────────────────────────────────────────

export function getRequiredSkills(
  agentId: string,
  supervisorPlan: SupervisorPlan
): string[] {
  const agent = getAgentConfig(agentId);
  if (!agent) return [];

  const planText = [
    supervisorPlan.proposedAction,
    supervisorPlan.analysis,
    supervisorPlan.estimatedScope,
  ]
    .join(" ")
    .toLowerCase();

  const skills: string[] = [];

  // Research: market data, competition, TAM, pricing, regulatory info
  const needsResearch = /mercado|datos|competencia|tam|pricing|precio|regulaci|internacion|investig/.test(planText);
  if (needsResearch && agent.skills.includes("research")) {
    skills.push("research");
  }

  // Inspiration: always if agent has usesRaindrop
  if (agent.usesRaindrop && agent.skills.includes("inspiration")) {
    skills.push("inspiration");
  }

  // Cross-validation: when plan asks to validate, review, or stress test
  const needsValidation = /valid|revis|stress test|critic|debilidad/.test(planText);
  if (needsValidation && agent.skills.includes("cross-validation")) {
    skills.push("cross-validation");
  }

  return skills;
}
