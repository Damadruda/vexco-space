// =============================================================================
// VEXCO-LAB ENGINE — SUPERVISOR (Autonomous Strategist)
// Uses Gemini Flash for project analysis and agent routing.
// Reads ProjectMemory directly via Prisma (no HTTP round-trip).
// =============================================================================

import { GoogleGenAI } from "@google/genai";
import { prisma } from "@/lib/db";
import { buildSupervisorPrompt } from "./prompts";
import type { SupervisorPlan } from "./types";

const FALLBACK_PLAN: SupervisorPlan = {
  analysis: "No hay datos suficientes para analizar el proyecto.",
  proposedAction: "Añade una descripción, notas o tareas al proyecto antes de continuar.",
  targetAgentId: "strategist",
  reasoning: "El Strategist necesita contexto mínimo para operar.",
  priority: "low",
  estimatedScope: "Revisión inicial del proyecto.",
};

// ─── ProjectMemory loader (direct Prisma, no HTTP) ────────────────────────────

export async function loadProjectMemory(
  projectId: string,
  userId: string
): Promise<Record<string, unknown> | null> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
  });

  if (!project) return null;

  const [decisions, agileTasks, roadmap, conceptInsights, recentNotes, recentIdeas] =
    await Promise.all([
      prisma.decisionLog.findMany({
        where: { projectId },
        orderBy: { createdAt: "desc" },
      }),
      prisma.agileTask.findMany({
        where: { projectId },
        orderBy: { createdAt: "asc" },
      }),
      prisma.roadmapTimeline.findMany({
        where: { projectId },
        orderBy: { year: "asc" },
      }),
      prisma.conceptInsight.findMany({
        where: { projectId },
        orderBy: { createdAt: "desc" },
      }),
      prisma.note.findMany({
        where: { projectId },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.idea.findMany({
        where: { projectId },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

  return {
    project,
    decisions,
    agileTasks,
    roadmap,
    conceptInsights,
    recentNotes,
    recentIdeas,
    stats: {
      totalTasks: agileTasks.length,
      completedTasks: agileTasks.filter((t) => t.status === "done").length,
      approvedDecisions: decisions.filter((d) => d.outcome === "APPROVED").length,
      rejectedDecisions: decisions.filter((d) => d.outcome === "REJECTED").length,
    },
  };
}

// ─── Supervisor.analyze ───────────────────────────────────────────────────────

export async function supervisorAnalyze(
  projectId: string,
  userId: string,
  additionalContext?: string
): Promise<SupervisorPlan> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    console.error("[SUPERVISOR] GOOGLE_GENERATIVE_AI_API_KEY not set");
    return FALLBACK_PLAN;
  }

  const memory = await loadProjectMemory(projectId, userId);
  if (!memory) {
    return {
      ...FALLBACK_PLAN,
      analysis: "Proyecto no encontrado o sin acceso.",
    };
  }

  const decisions = memory.decisions as Array<{
    outcome: string;
    decision: string;
    agentSource: string;
    createdAt: Date;
  }>;

  // Check if project has meaningful data
  const hasData =
    (memory.project as Record<string, unknown>)?.description ||
    (memory.agileTasks as unknown[]).length > 0 ||
    (memory.recentNotes as unknown[]).length > 0 ||
    (memory.recentIdeas as unknown[]).length > 0;

  if (!hasData) {
    return FALLBACK_PLAN;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    const isNewProject = decisions.length === 0;
    let prompt = buildSupervisorPrompt(memory, decisions, isNewProject);
    if (additionalContext) {
      prompt += `\n\nCONTEXTO ADICIONAL DEL USUARIO:\n"${additionalContext}"`;
    }

    const result = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: prompt,
      config: { responseMimeType: "application/json" },
    });
    const responseText = result.text || "";

    const cleaned = responseText.replace(/```json\n?|\n?```/g, "").trim();
    const plan = JSON.parse(cleaned) as SupervisorPlan;

    // Validate required fields
    if (!plan.analysis || !plan.proposedAction || !plan.targetAgentId) {
      throw new Error("Incomplete SupervisorPlan from Gemini");
    }

    return plan;
  } catch (error) {
    console.error("[SUPERVISOR] Gemini error:", error);
    return {
      ...FALLBACK_PLAN,
      analysis: "Error al analizar el proyecto. Revisa tu clave GOOGLE_GENERATIVE_AI_API_KEY.",
    };
  }
}
