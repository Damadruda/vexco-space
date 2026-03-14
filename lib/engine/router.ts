// =============================================================================
// VEXCO-LAB ENGINE — ROUTER
// Dynamic routing from Supervisor to specialist agents.
// All agents currently use Gemini Flash (Sprint 4 adds Claude/Perplexity).
// =============================================================================

import { GoogleGenerativeAI } from "@google/generative-ai";
import { EXPERTS } from "@/components/expert-panel/experts-data";
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
  decisionHistory: Array<{ outcome: string; decision: string; agentSource: string }>
): Promise<AgentResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const expert = EXPERTS.find((e) => e.id === agentId);
  if (!expert) throw new Error(`Agent not found: ${agentId}`);

  const prompt = buildAgentPrompt(
    expert.persona,
    expert.focus,
    expert.name,
    projectMemory,
    supervisorPlan,
    decisionHistory
  );

  const startTime = Date.now();

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    generationConfig: { responseMimeType: "application/json" },
  });

  const result = await model.generateContent(prompt);
  const responseText = result.response.text();
  const elapsed = Date.now() - startTime;

  const cleaned = responseText.replace(/```json\n?|\n?```/g, "").trim();
  const output = JSON.parse(cleaned) as StructuredOutput;

  // Inject real processing time
  if (output.metadata) {
    output.metadata.processingTimeMs = elapsed;
  }

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
    // Plan review: supervisor just proposed a plan
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

  // Result review: agent delivered its analysis
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
