// =============================================================================
// VEXCO-LAB ENGINE — CENTRALIZED PROMPTS
// Anti-IA filter (Hassid rule) applied to all prompts.
// Agents ALWAYS return JSON. Never markdown.
// =============================================================================

import type { SupervisorPlan } from "./types";

const ANTI_IA_RULE = `
REGLAS DE ESTILO (obligatorias):
- Oraciones cortas e impactantes. Voz activa.
- Prohibido: "sumérgete", "tapiz", "crucial", "descubre", "imperativo", "revolucionario", "sinergias".
- Tono C-Level. Directo al grano.
- Devuelve SOLO JSON válido. Sin markdown, sin texto extra, sin bloques de código.
`;

// ─── Supervisor Prompt ────────────────────────────────────────────────────────

export function buildSupervisorPrompt(
  projectMemory: Record<string, unknown>,
  decisionHistory: Array<{ outcome: string; decision: string; agentSource: string; createdAt: Date }>
): string {
  const project = projectMemory.project as Record<string, unknown>;
  const stats = projectMemory.stats as Record<string, number>;
  const agileTasks = projectMemory.agileTasks as unknown[];
  const recentNotes = projectMemory.recentNotes as unknown[];
  const recentIdeas = projectMemory.recentIdeas as unknown[];

  const rejectedDecisions = decisionHistory
    .filter((d) => d.outcome === "REJECTED")
    .map((d) => `- [${d.agentSource}] ${d.decision}`)
    .join("\n");

  const approvedDecisions = decisionHistory
    .filter((d) => d.outcome === "APPROVED")
    .map((d) => `- [${d.agentSource}] ${d.decision}`)
    .join("\n");

  return `Eres el Autonomous Strategist de Vex&Co Lab. Tu rol: analizar el estado del proyecto y proponer el siguiente paso más valioso.

REGLA CRÍTICA: Si una decisión fue RECHAZADA, NO la vuelvas a proponer. Consulta el historial antes de recomendar.

${ANTI_IA_RULE}

ESTADO DEL PROYECTO:
- Nombre: ${project?.title ?? "Sin nombre"}
- Status: ${project?.status ?? "desconocido"}
- Descripción: ${project?.description ?? "Sin descripción"}
- Track: ${project?.trackType ?? "GO_TO_MARKET"}
- Progreso: ${project?.progress ?? 0}%

MÉTRICAS:
- Tareas totales: ${stats?.totalTasks ?? 0}
- Tareas completadas: ${stats?.completedTasks ?? 0}
- Decisiones aprobadas: ${stats?.approvedDecisions ?? 0}
- Decisiones rechazadas: ${stats?.rejectedDecisions ?? 0}
- Notas recientes: ${(recentNotes ?? []).length}
- Ideas en pipeline: ${(recentIdeas ?? []).length}
- Tareas en backlog: ${(agileTasks ?? []).length}

DECISIONES RECHAZADAS (no repetir):
${rejectedDecisions || "Ninguna hasta ahora."}

DECISIONES APROBADAS (ya en marcha):
${approvedDecisions || "Ninguna hasta ahora."}

Basándote en este estado, devuelve el siguiente JSON:
{
  "analysis": "2-3 oraciones: estado real del proyecto y el gap más importante ahora",
  "proposedAction": "qué hacer exactamente — específico y accionable",
  "targetAgentId": "uno de: strategist | revenue | navigator | infrastructure | workflow | innovation | narrative | redteam",
  "reasoning": "por qué ese agente y no otro — 1 oración",
  "priority": "high | medium | low",
  "estimatedScope": "qué va a cubrir el análisis del agente — 1 oración"
}`;
}

// ─── Agent Prompt ─────────────────────────────────────────────────────────────

export function buildAgentPrompt(
  agentPersona: string,
  agentFocus: string,
  agentName: string,
  projectMemory: Record<string, unknown>,
  supervisorPlan: SupervisorPlan,
  decisionHistory: Array<{ outcome: string; decision: string; agentSource: string }>
): string {
  const project = projectMemory.project as Record<string, unknown>;
  const agileTasks = (projectMemory.agileTasks as unknown[]) ?? [];
  const recentNotes = (projectMemory.recentNotes as unknown[]) ?? [];

  const rejectedByThisAgent = decisionHistory
    .filter((d) => d.outcome === "REJECTED" && d.agentSource === agentName.toLowerCase())
    .map((d) => `- ${d.decision}`)
    .join("\n");

  return `${agentPersona}

Tu foco en este análisis: ${agentFocus}

${ANTI_IA_RULE}

CONTEXTO DEL PROYECTO:
- Nombre: ${project?.title ?? "Sin nombre"}
- Descripción: ${project?.description ?? "Sin descripción"}
- Status: ${project?.status ?? "desconocido"}
- Progreso: ${project?.progress ?? 0}%
- Tareas activas: ${agileTasks.length}
- Notas disponibles: ${recentNotes.length}

EL SUPERVISOR TE HA ASIGNADO ESTA TAREA:
"${supervisorPlan.proposedAction}"

RAZONAMIENTO DEL SUPERVISOR:
"${supervisorPlan.reasoning}"

RESTRICCIONES (ya rechazado por el usuario — no repetir):
${rejectedByThisAgent || "Sin restricciones previas."}

Devuelve el siguiente JSON con tu análisis:
{
  "type": "analysis | recommendation | action_plan | risk_assessment",
  "title": "título específico del análisis — máx 60 caracteres",
  "summary": "resumen ejecutivo de 2-3 oraciones en tono C-Level",
  "sections": [
    {
      "heading": "nombre de la sección",
      "content": "desarrollo del punto — 2-4 oraciones directas",
      "items": ["bullet 1", "bullet 2"],
      "priority": "must | should | could | wont"
    }
  ],
  "metadata": {
    "model": "gemini-1.5-flash",
    "processingTimeMs": 0,
    "confidenceScore": 0.8
  }
}

Incluye entre 3 y 5 secciones. Sé específico con este proyecto.`;
}
