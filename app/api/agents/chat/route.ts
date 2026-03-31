import { NextRequest, NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { getAgentConfig } from "@/lib/engine/agents";
import { loadProjectMemory } from "@/lib/engine/supervisor";
import { prisma } from "@/lib/db";
import { GoogleGenAI } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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

    // Items cross-project: trend y discovery de alta relevancia
    try {
      const crossItems = await prisma.inboxItem.findMany({
        where: {
          projectId: null,
          status: "processed",
          analysis: {
            category: { in: ["trend", "discovery"] },
            relevanceScore: { gte: 0.5 },
          },
        },
        include: { analysis: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      });
      if (crossItems.length > 0) {
        const crossLines = crossItems.map(item => {
          const title = item.sourceTitle || item.rawContent.slice(0, 60);
          const cat = item.analysis?.category ?? "unknown";
          const summary = item.analysis?.summary ? ` — ${item.analysis.summary.slice(0, 120)}` : "";
          return `  - [${cat}] ${title}${summary}`;
        }).join("\n");
        inboxLines += (inboxLines ? "\n" : "") +
          `- Conocimiento cross-project (${crossItems.length} items trend/discovery):\n${crossLines}`;
      }
    } catch {}
  }

  // Drive document summaries
  let driveLines = "";
  if (projectId) {
    try {
      const driveDocs = await prisma.driveDocSummary.findMany({
        where: { projectId },
        orderBy: { createdAt: "desc" },
        take: 15,
      });
      if (driveDocs.length > 0) {
        driveLines =
          `- Documentos de Drive vinculados (${driveDocs.length}):\n` +
          driveDocs
            .map((doc) => {
              const insights =
                doc.keyInsights.length > 0
                  ? ` | Insights: ${doc.keyInsights.slice(0, 2).join("; ")}`
                  : "";
              return `  - [${doc.fileType}] ${doc.fileName}: ${doc.summary.slice(0, 200)}${insights}`;
            })
            .join("\n");
      }
    } catch {
      // continue without drive context
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
    driveLines || "",
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

    // ── @mention cross-agent routing ────────────────────────────────────
    const VALID_AGENT_IDS = ["strategist", "revenue", "infrastructure", "redteam", "design"];
    const AGENT_ALIASES: Record<string, string> = {
      challenger: "redteam",
      "product": "infrastructure",
      "tech": "infrastructure",
      "growth": "revenue",
    };
    const mentionRegex = /@(\w+)/;
    const mentionMatch = message.match(mentionRegex);

    let effectiveAgentId = agentId;

    if (mentionMatch) {
      const mentionedRaw = mentionMatch[1].toLowerCase();
      const resolved = AGENT_ALIASES[mentionedRaw] ?? mentionedRaw;
      if (VALID_AGENT_IDS.includes(resolved)) {
        effectiveAgentId = resolved;
      }
    }

    const agentConfig = getAgentConfig(effectiveAgentId);
    if (!agentConfig) {
      return NextResponse.json(
        { error: `Unknown agentId: ${effectiveAgentId}` },
        { status: 400 }
      );
    }

    const isStrategist = effectiveAgentId === "strategist";

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

IDs de agente válidos: revenue, redteam, infrastructure, design.
Nombres: revenue = Revenue & Growth, redteam = Challenger, infrastructure = Product & Tech, design = Design & Experience.
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
      const maxMessages = isStrategist ? 10 : 6;
      const maxChars = isStrategist ? 2000 : 800;
      const recent = conversationHistory.slice(-maxMessages);
      historyBlock =
        "HISTORIAL RECIENTE DE ESTA CONVERSACIÓN:\n" +
        recent
          .map((m) => {
            const prefix = m.role === "user" ? "USUARIO" : `AGENTE (${m.agentId ?? "unknown"})`;
            return `${prefix}: ${m.content.substring(0, maxChars)}`;
          })
          .join("\n\n") +
        "\n\n---\nNUEVO MENSAJE DEL USUARIO:\n";
    }

    const userPrompt = projectContext
      ? `${projectContext}\n\n${historyBlock}${message}`
      : `${historyBlock}${message}`;

    // ── Streaming response via SSE ──────────────────────────────────────
    const encoder = new TextEncoder();
    const startTime = Date.now();

    const stream = new ReadableStream({
      async start(controller) {
        let fullText = "";

        const sendSSE = (data: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        try {
          const preferredLLM = agentConfig.preferredLLM;

          // ── Gemini streaming ────────────────────────────────────────
          if (preferredLLM === "gemini-pro" || preferredLLM === "gemini-flash") {
            const geminiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
            if (!geminiKey) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY no configurada");

            const ai = new GoogleGenAI({ apiKey: geminiKey });
            const modelName = preferredLLM === "gemini-pro"
              ? "gemini-3.1-pro-preview"
              : "gemini-3-flash-preview";

            const fullPrompt = systemPrompt
              ? `${systemPrompt}\n\n${userPrompt}`
              : userPrompt;

            const streamIter = await ai.models.generateContentStream({
              model: modelName,
              contents: fullPrompt,
              config: {
                maxOutputTokens: 8192,
                temperature: 0.7,
              },
            });

            for await (const chunk of streamIter) {
              const text = chunk.text || "";
              if (text) {
                fullText += text;
                sendSSE({ text, agentId: effectiveAgentId });
              }
            }

          // ── Claude streaming ────────────────────────────────────────
          } else if (preferredLLM === "claude-sonnet") {
            const anthropicKey = process.env.ANTHROPIC_API_KEY;

            if (!anthropicKey) {
              // Fallback to Gemini Flash streaming
              const geminiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
              if (!geminiKey) throw new Error("No LLM API key configured");

              console.warn("[AGENT_CHAT] ANTHROPIC_API_KEY missing — fallback to Gemini Flash stream");
              const ai = new GoogleGenAI({ apiKey: geminiKey });
              const fullPrompt = systemPrompt
                ? `${systemPrompt}\n\n${userPrompt}`
                : userPrompt;

              const streamIter = await ai.models.generateContentStream({
                model: "gemini-3-flash-preview",
                contents: fullPrompt,
                config: { maxOutputTokens: 8192, temperature: 0.7 },
              });

              for await (const chunk of streamIter) {
                const text = chunk.text || "";
                if (text) {
                  fullText += text;
                  sendSSE({ text, agentId: effectiveAgentId });
                }
              }
            } else {
              const client = new Anthropic({ apiKey: anthropicKey });

              const anthropicStream = client.messages.stream({
                model: "claude-sonnet-4-20250514",
                max_tokens: 8192,
                temperature: 0.7,
                system: systemPrompt,
                messages: [{ role: "user", content: userPrompt }],
              });

              for await (const event of anthropicStream) {
                if (
                  event.type === "content_block_delta" &&
                  event.delta.type === "text_delta"
                ) {
                  const text = event.delta.text;
                  if (text) {
                    fullText += text;
                    sendSSE({ text, agentId: effectiveAgentId });
                  }
                }
              }
            }
          } else {
            // Unknown model — should not happen, but fallback to non-streaming
            throw new Error(`Unsupported LLM for streaming: ${preferredLLM}`);
          }

          // ── Parse assigned agents after full stream (strategist only) ──
          const { display, assignedAgents } = isStrategist
            ? parseAssignedAgents(fullText)
            : { display: fullText, assignedAgents: [] };

          console.log(
            "[AGENT_CHAT] agentId:", agentId,
            "effectiveAgentId:", effectiveAgentId,
            "contentLength:", fullText.length,
            "model:", agentConfig.preferredLLM,
            "ms:", Date.now() - startTime
          );

          // ── Send done event with full response ─────────────────────
          sendSSE({
            done: true,
            agentId: effectiveAgentId,
            agentName: agentConfig.name,
            originalAgentId: agentId,
            fullText: display,
            assignedAgents,
          });

          controller.close();
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error("[AGENT_CHAT_STREAM] Error:", errMsg);
          sendSSE({ error: errMsg, agentId: effectiveAgentId });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
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
