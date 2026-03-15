// =============================================================================
// VEXCO-LAB ENGINE — ROUTER
// Routes supervisor plans to specialist agents with LLM differentiation and skills.
// =============================================================================

import { EXPERTS } from "@/components/expert-panel/experts-data";
import { callLLM } from "@/lib/clients/llm";
import { getAgentConfig } from "./agents";
import { getRequiredSkills, researchSkill, inspirationSkill, crossValidationSkill } from "./skills";
import { buildAgentPrompt } from "./prompts";
import type {
  AgentResult,
  Checkpoint,
  CheckpointOption,
  SessionState,
  StructuredOutput,
  SupervisorPlan,
} from "./types";

// ─── Agents ───────────────────────────────────────────────────────────────────

export function getAvailableAgents() {
  return EXPERTS.map((e) => ({
    id: e.id,
    name: e.name,
    role: e.role,
    focus: e.focus,
  }));
}

// ─── routeToAgent ─────────────────────────────────────────────────────────────

export async function routeToAgent(
  agentId: string,
  projectMemory: Record<string, unknown>,
  supervisorPlan: SupervisorPlan,
  decisionHistory: Array<{ outcome: string; decision: string; agentSource: string }>,
  userId?: string
): Promise<AgentResult> {
  const expert = EXPERTS.find((e) => e.id === agentId);
  if (!expert) throw new Error(`Agent not found: ${agentId}`);

  const agentConfig = getAgentConfig(agentId);

  // ── 1. Determine required skills ───────────────────────────────────────────
  const requiredSkills = agentConfig
    ? getRequiredSkills(agentId, supervisorPlan)
    : [];

  // ── 2. Execute skills in parallel ──────────────────────────────────────────
  const skillResults = await Promise.all(
    requiredSkills.map((skill) => {
      if (skill === "research") {
        const query = `${supervisorPlan.proposedAction} — ${supervisorPlan.estimatedScope}`;
        return researchSkill(query);
      }
      if (skill === "inspiration" && userId) {
        const keywords = supervisorPlan.proposedAction
          .toLowerCase()
          .split(/[\s,]+/)
          .filter((w) => w.length > 4)
          .slice(0, 6);
        return inspirationSkill(userId, keywords);
      }
      if (skill === "cross-validation") {
        // Cross-validate with redteam for non-redteam agents
        const targetId = agentId === "redteam" ? "revenue" : "redteam";
        return crossValidationSkill(targetId, supervisorPlan.analysis, projectMemory);
      }
      return Promise.resolve(null);
    })
  );

  const skillData = skillResults
    .filter((r) => r !== null && r.data)
    .map((r) => r!.data);

  const skillsUsed = skillResults
    .filter((r) => r !== null && r.data)
    .map((r) => r!.skill);

  // ── 3. Build prompt ────────────────────────────────────────────────────────
  const systemPrompt = agentConfig
    ? [agentConfig.consultingDNA, agentConfig.geographicContext, agentConfig.domainInstructions].join("\n\n")
    : expert.persona;

  const userPrompt = buildAgentPrompt(
    expert.persona,
    expert.focus,
    expert.name,
    projectMemory,
    supervisorPlan,
    decisionHistory,
    agentConfig
      ? {
          consultingDNA: agentConfig.consultingDNA,
          geographicContext: agentConfig.geographicContext,
          domainInstructions: agentConfig.domainInstructions,
          agentName: agentConfig.name,
          outputType: agentConfig.outputType,
        }
      : undefined,
    skillData
  );

  // ── 4. Call LLM (with fallback) ────────────────────────────────────────────
  const startTime = Date.now();
  let llmResponse;

  try {
    llmResponse = await callLLM({
      model: agentConfig?.preferredLLM ?? "gemini-flash",
      systemPrompt,
      userPrompt,
      jsonMode: true,
      temperature: 0.7,
    });
  } catch (err) {
    console.warn(`[ROUTER] Primary LLM failed for ${agentId}, retrying with gemini-flash:`, err);
    llmResponse = await callLLM({
      model: "gemini-flash",
      systemPrompt,
      userPrompt,
      jsonMode: true,
      temperature: 0.7,
    });
  }

  const elapsed = Date.now() - startTime;

  // ── 5. Parse structured output ─────────────────────────────────────────────
  let output: StructuredOutput;
  try {
    const jsonMatch = llmResponse.content.match(/\{[\s\S]*\}/);
    output = JSON.parse(jsonMatch ? jsonMatch[0] : llmResponse.content) as StructuredOutput;
  } catch {
    throw new Error(`[ROUTER] Invalid JSON from ${agentId}: ${llmResponse.content.slice(0, 200)}`);
  }

  // ── 6. Inject real metadata ────────────────────────────────────────────────
  output.metadata = {
    model: llmResponse.model,
    processingTimeMs: elapsed,
    confidenceScore: output.metadata?.confidenceScore ?? 0.8,
    skillsUsed,
  };

  return {
    agentId: expert.id,
    agentName: expert.name,
    content: output,
    timestamp: new Date(),
  };
}

// ─── buildCheckpoint ─────────────────────────────────────────────────────────

export function buildCheckpoint(session: SessionState): Checkpoint {
  const agents = getAvailableAgents();

  if (session.phase === "awaiting_human" && session.supervisorPlan && !session.agentResult) {
    const redirectOptions: CheckpointOption[] = agents
      .filter((a) => a.id !== session.supervisorPlan!.targetAgentId)
      .map((a) => ({
        id: `redirect_${a.id}`,
        label: `Redirigir a ${a.name}`,
        action: "redirect" as const,
        targetAgentId: a.id,
      }));

    return {
      sessionId: session.id,
      phase: "plan_review",
      content: session.supervisorPlan,
      options: [
        { id: "approve", label: "Aprobar plan", action: "approve" },
        { id: "reject", label: "Rechazar y cerrar", action: "reject" },
        ...redirectOptions,
      ],
    };
  }

  const redirectOptions: CheckpointOption[] = agents
    .filter((a) => a.id !== session.currentAgentId)
    .map((a) => ({
      id: `redirect_${a.id}`,
      label: `Consultar a ${a.name}`,
      action: "redirect" as const,
      targetAgentId: a.id,
    }));

  return {
    sessionId: session.id,
    phase: "result_review",
    content: session.agentResult!,
    options: [
      { id: "approve", label: "Aprobar y guardar", action: "approve" },
      { id: "modify", label: "Pedir más detalle", action: "modify" },
      ...redirectOptions,
      { id: "reject", label: "Cerrar sesión", action: "reject" },
    ],
  };
}
