import { NextRequest, NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { getAgentConfig } from "@/lib/engine/agents";
import { callLLM } from "@/lib/clients/llm";
import { loadProjectMemory } from "@/lib/engine/supervisor";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ─── Types ────────────────────────────────────────────────────────────────────

interface AssignedAgent {
  agentId: string;
  mission: string;
  suggestedQuestion: string;
  priority: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Parse the <!-- AGENT_ASSIGNMENTS_JSON --> block from the strategist response. */
function parseAssignedAgents(content: string): {
  display: string;
  assignedAgents: AssignedAgent[];
} {
  const OPEN = "<!-- AGENT_ASSIGNMENTS_JSON -->";
  const CLOSE = "<!-- /AGENT_ASSIGNMENTS_JSON -->";
  const match = content.match(
    /<!-- AGENT_ASSIGNMENTS_JSON -->([\s\S]*?)<!-- \/AGENT_ASSIGNMENTS_JSON -->/
  );
  if (!match) return { display: content, assignedAgents: [] };

  let assignedAgents: AssignedAgent[] = [];
  try {
    assignedAgents = JSON.parse(match[1].trim()) as AssignedAgent[];
  } catch {
    // malformed JSON — return empty, do not crash
  }

  const display = content
    .replace(OPEN, "")
    .replace(CLOSE, "")
    .replace(match[1], "")
    .trim();

  return { display, assignedAgents };
}

/** Build enriched project context block from ProjectMemory. */
async function buildProjectContext(memory: Record<string, unknown>, projectId?: string): Promise<string> {
  const project = memory.project as Record<string, unknown>;
  const notes = (memory.recentNotes as Array<{ content: string; title?: string }>) ?? [];
  const ideas = (memory.recentIdeas as Array<{ title: string; description?: string }>) ?? [];
  const tasks = (memory.agileTasks as Array<{ title: string; status: string }>) ?? [];

  const noteLines = notes
    .slice(0, 5)
    .map((n) => `  - ${n.title ? `[${n.title}] ` : ""}${n.content.slice(0, 200)}`)
    .join("\n");

  const ideaLines = ideas
    .slice(0, 5)
    .map((i) => `  - ${i.title}${i.description ? `: ${i.description.slice(0, 120)}` : ""}`)
    .join("\n");

  const taskLines = tasks
    .slice(0, 8)
    .map((t) => `  - [${t.status.toUpperCase()}] ${t.title}`)
    .join("\n");

  // Inbox items vinculados a este proyecto
  let inboxLines = "";
  if (projectId) {
    try {
      const inboxItems = await prisma.inboxItem.findMany({
        where: { projectId },
        include: { analysis: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      });
      if (inboxItems.length > 0) {
        inboxLines = `- Items de Raindrop vinculados (${inboxItems.length}):\n` +
          inboxItems.map(item => {
            const title = item.sourceTitle || item.rawContent.slice(0, 60);
            const analysis = item.analysis;
            const summary = analysis?.summary ? ` — ${analysis.summary.slice(0, 150)}` : "";
            const relevance = analysis?.relevanceScore ? ` (${Math.round(analysis.relevanceScore * 100)}% relevancia)` : "";
            return `  - ${title}${summary}${relevance}`;
          }).join("\n");
      }
    } catch {
      // continue without inbox context
    }
  }

  return [
    "CONTEXTO DEL PROYECTO:",
    `- Nombre: ${project.title ?? "Sin título"}`,
    `- Descripción: ${project.description ?? "Sin descripción"}`,
    `- Status: ${project.status ?? "Desconocido"}`,
    `- Concepto: ${(project as Record<string, unknown>).concept ?? "No definido"}`,
    `- Mercado objetivo: ${(project as Record<string, unknown>).targetMarket ?? "No definido"}`,
    `- Modelo de negocio: ${(project as Record<string, unknown>).businessModel ?? "No definido"}`,
    notes.length > 0 ? `- Notas recientes (${notes.length}):\n${noteLines}` : "",
    ideas.length > 0 ? `- Ideas en pipeline (${ideas.length}):\n${ideaLines}` : "",
    tasks.length > 0 ? `- Tareas activas (${tasks.length}):\n${taskLines}` : "",
    inboxLines || "",
  ]
    .filter(Boolean)
    .join("\n");
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const userId = await getDefaultUserId();

    const body = await request.json();
    const { agentId, message, projectId, conversationHistory } = body as {
      agentId: string;
      message: string;
      projectId?: string;
      conversationHistory?: Array<{
        role: string;
        content: string;
        agentId?: string;
      }>;
    };

    if (!agentId || !message) {
      return NextResponse.json(
        { error: "agentId and message are required" },
        { status: 400 }
      );
    }

    const agentConfig = getAgentConfig(agentId);
    if (!agentConfig) {
      return NextResponse.json(
        { error: `Unknown agentId: ${agentId}` },
        { status: 400 }
      );
    }

    const isStrategist = agentId === "strategist";

    // ── Load project context ───────────────────────────────────────────────
    let projectContext = "";
    if (projectId) {
      try {
        const memory = await loadProjectMemory(projectId, userId);
        if (memory) {
          projectContext = await buildProjectContext(memory, projectId);
        }
      } catch {
        // continue without context
      }
    }

    // ── Build system prompt ────────────────────────────────────────────────
    const toneRules = isStrategist
      ? [
          "",
          "REGLAS DE TONO (obligatorias):",
          "Oraciones cortas e impactantes. Voz activa. Tono ejecutivo.",
          "Prohibido: 'sumérgete', 'tapiz', 'crucial', 'descubre', 'imperativo', 'sinergias'.",
          "Usa los headers ## exactos indicados en tu estructura. Usa - para bullets.",
        ]
      : [
          "",
          "REGLAS DE TONO (obligatorias):",
          "Oraciones cortas e impactantes. Voz activa. Tono ejecutivo.",
          "Prohibido: 'sumérgete', 'tapiz', 'crucial', 'descubre', 'imperativo', 'sinergias'.",
          "Usa los headers ## exactos indicados en tu estructura.",
          "Responde en español a menos que el usuario escriba en otro idioma.",
        ];

    // For the strategist: append JSON block instruction so we can parse assigned agents
    const strategistJsonInstruction = isStrategist
      ? `

AL FINAL de tu respuesta (después de ## VALIDACIÓN), añade EXACTAMENTE este bloque con los agentes que seleccionaste:

<!-- AGENT_ASSIGNMENTS_JSON -->
[
  {
    "agentId": "id-del-agente",
    "mission": "misión específica en 1 oración",
    "suggestedQuestion": "pregunta concreta que el usuario debe hacerle a este agente",
    "priority": 1
  }
]
<!-- /AGENT_ASSIGNMENTS_JSON -->

IDs de agente válidos: revenue, redteam, infrastructure.
Nombres: revenue = Revenue & Growth, redteam = Challenger, infrastructure = Product & Tech.
Selecciona 1-3 agentes. El strategist NO se asigna a sí mismo. Ordena por prioridad (1 = activar primero).`
      : "";

    const systemPrompt = [
      agentConfig.consultingDNA,
      agentConfig.geographicContext,
      agentConfig.domainInstructions,
      ...toneRules,
      strategistJsonInstruction,
    ]
      .filter(Boolean)
      .join("\n");

    let historyBlock = "";
    if (conversationHistory && conversationHistory.length > 0) {
      const recent = conversationHistory.slice(-6);
      historyBlock =
        "HISTORIAL RECIENTE DE ESTA CONVERSACIÓN:\n" +
        recent
          .map((m) => {
            const prefix = m.role === "user" ? "USUARIO" : `AGENTE (${m.agentId ?? "unknown"})`;
            return `${prefix}: ${m.content.substring(0, 800)}`;
          })
          .join("\n\n") +
        "\n\n---\nNUEVO MENSAJE DEL USUARIO:\n";
    }

    const userPrompt = projectContext
      ? `${projectContext}\n\n${historyBlock}${message}`
      : `${historyBlock}${message}`;

    // ── Call LLM ──────────────────────────────────────────────────────────
    const llmResponse = await callLLM({
      model: agentConfig.preferredLLM,
      systemPrompt,
      userPrompt,
      jsonMode: false,
      temperature: 0.7,
      maxTokens: 8192,
    });

    console.log(
      "[AGENT_CHAT] agentId:", agentId,
      "contentLength:", llmResponse.content.length,
      "model:", llmResponse.model,
      "ms:", llmResponse.processingTimeMs
    );

    // ── Parse assigned agents (strategist only) ───────────────────────────
    const { display, assignedAgents } = isStrategist
      ? parseAssignedAgents(llmResponse.content)
      : { display: llmResponse.content, assignedAgents: [] };

    return NextResponse.json({
      response: display,
      agentId: agentConfig.id,
      agentName: agentConfig.name,
      assignedAgents,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const errMsg = error instanceof Error ? error.message : String(error);
    const errStack = error instanceof Error ? error.stack?.substring(0, 300) : "";
    console.error("[AGENTS/CHAT] Error:", errMsg, errStack);
    return NextResponse.json(
      { error: `LLM error: ${errMsg}` },
      { status: 500 }
    );
  }
}
