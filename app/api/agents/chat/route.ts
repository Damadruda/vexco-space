import { NextRequest, NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { getAgentConfig } from "@/lib/engine/agents";
import { loadProjectMemory } from "@/lib/engine/supervisor";
import { prisma } from "@/lib/db";
import { GoogleGenAI } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";
import { matchInsightsForProject } from "@/lib/firm-insights/matcher";
import { classifyInsightSector } from "@/lib/firm-insights/sector-classifier";
import { decideResearch, researchSkill, inspirationSkill } from "@/lib/engine/skills";

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
        where: { projectId, unlinkedAt: null },
        orderBy: { createdAt: "desc" },
        take: 30,
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
              return `  - [${doc.fileType}] ${doc.fileName}: ${doc.summary.slice(0, 600)}${insights}`;
            })
            .join("\n");
      }
    } catch {
      // continue without drive context
    }
  }

  // FirmInsight: cross-project institutional knowledge — uses centralized matcher
  let firmInsightContext = "";
  if (projectId) {
    try {
      const userId = await getDefaultUserId();
      const matched = await matchInsightsForProject({ projectId, userId, topN: 10 });

      if (matched.length > 0) {
        const insightLines = matched.map((i) =>
          `  - [${i.insightType.toUpperCase()}${i.validatedByUser ? " ✓" : ""}] ${i.title}: ${i.content.slice(0, 600)}${i.sourceProject ? ` (de: ${i.sourceProject.title})` : ""}`
        ).join("\n");

        firmInsightContext = `\n- Conocimiento institucional de Vex&Co (${matched.length} insights relevantes):\n${insightLines}`;
      }
    } catch (err) {
      console.warn("[FIRM_INSIGHT_CONTEXT] Failed:", err);
    }
  }

  // Revenue Priority context
  let revenuePriorityContext = "";
  const rpScore = (project as Record<string, unknown>).revenueProximityScore as number | null;
  if (rpScore) {
    revenuePriorityContext = `\n- Revenue Priority: ${rpScore}/10 — ${(project as Record<string, unknown>).revenueProximityReason ?? "sin detalle"}`;
    const stepsToRev = (project as Record<string, unknown>).stepsToRevenue as number | null;
    if (stepsToRev) {
      revenuePriorityContext += `\n  Pasos para facturar: ${stepsToRev} — ${(project as Record<string, unknown>).stepsToRevenueDetail ?? ""}`;
    }
  }

  // ─── Project type detection (service vs product based on ProspectFit) ───
  // Si el proyecto tiene prospects vinculados, es un SERVICIO A CLIENTE y los agentes
  // deben razonar en ese marco (no en modo go-to-market de producto). Bloque directivo
  // que se inyecta al inicio del contexto para máxima visibilidad.
  let projectTypeBlock = "";
  if (projectId) {
    try {
      const prospectFits = await prisma.prospectFit.findMany({
        where: { projectId },
        include: {
          prospect: {
            select: {
              name: true,
              company: true,
              stage: true,
              status: true,
              estimatedDealValue: true,
              currency: true,
            },
          },
        },
        orderBy: [{ isPrimary: "desc" }, { fitScore: "desc" }],
        take: 5,
      });

      if (prospectFits.length > 0) {
        const prospectLines = prospectFits
          .map((pf) => {
            const p = pf.prospect;
            const companyPart = p.company ? ` (${p.company})` : "";
            const statusPart = p.status !== "ACTIVE" ? ` · status: ${p.status}` : "";
            const dealPart =
              p.estimatedDealValue && p.estimatedDealValue > 0
                ? ` · deal: ${p.estimatedDealValue.toLocaleString()} ${p.currency}`
                : "";
            const primaryMark = pf.isPrimary ? " [primary]" : "";
            return `  - ${p.name}${companyPart} — stage: ${p.stage} · fit: ${pf.fitScore}/100${dealPart}${statusPart}${primaryMark}`;
          })
          .join("\n");

        projectTypeBlock = `── TIPO DE PROYECTO (detección automática por ProspectFit) ──
CLASIFICACIÓN: SERVICIO PARA CLIENTE

Prospects vinculados (${prospectFits.length}):
${prospectLines}

IMPLICACIONES OPERATIVAS (obligatorias para todos los agentes):
- Revenue = factura al cliente por el servicio prestado. NO es monetización de producto en mercado abierto.
- Enfoca recomendaciones en: pricing del servicio, alcance del entregable, gestión de la relación cliente, upsell de servicios complementarios, cierre del prospect vinculado.
- Revenue Priority se mide por proximidad al cierre/facturación del cliente listado arriba, NO por adquisición de audiencia o lanzamiento público.
- NO apliques por defecto: TAM/SAM/SOM, growth loops de adquisición masiva, estrategia de contenido para audiencia amplia, captación de sponsors, sales funnel de producto, métricas de retención de usuarios.
- SÍ aplica: estructura de propuesta comercial, pricing tiered del servicio, entregables por fase, escalado de honorarios por alcance, riesgos de dependencia de un solo cliente.
- EXCEPCIÓN: si el usuario pide explícitamente escalar o productizar el servicio, aplica lógica híbrida (servicio actual → producto futuro). Aun así, el foco presente sigue siendo el cliente vinculado.
────────────────────────────────────────────────────────────`;
      }
    } catch {
      // continue without project type context — no rompas el flujo del agente
    }
  }

  // ─── REAL COUNTS BLOCK (Sprint K5.2 anti-hallucination) ───
  let verifiedCountsBlock = "";
  if (projectId) {
    try {
      const [
        driveDocsCount,
        warRoomMessagesCount,
        firmInsightsCount,
        agileTasksCount,
        inboxItemsLinkedCount,
      ] = await Promise.all([
        prisma.driveDocSummary.count({ where: { projectId, unlinkedAt: null } }),
        prisma.chatMessage.count({ where: { projectId } }),
        prisma.firmInsight.count({ where: { sourceProjectId: projectId, isActive: true } }),
        prisma.agileTask.count({ where: { projectId } }),
        prisma.inboxItem.count({ where: { projectId } }),
      ]);

      verifiedCountsBlock = `
─── DATOS VERIFICADOS (úsalos exactamente, no inventes otros) ───
- Archivos de Drive importados a este proyecto: ${driveDocsCount}
- Mensajes históricos en este War Room: ${warRoomMessagesCount}
- FirmInsights generados desde este proyecto: ${firmInsightsCount}
- Tareas en el Agile Board de este proyecto: ${agileTasksCount}
- Items del Inbox vinculados a este proyecto: ${inboxItemsLinkedCount}
─────────────────────────────────────────────────────────────`;
    } catch (e) {
      console.warn("[buildProjectContext] Failed to compute verified counts:", e);
    }
  }

  return [
    "CONTEXTO DEL PROYECTO:",
    projectTypeBlock || "",
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
    firmInsightContext || "",
    revenuePriorityContext || "",
    verifiedCountsBlock || "",
  ]
    .filter(Boolean)
    .join("\n");
}

// ─── FirmInsight & Revenue Priority Parsers ──────────────────────────────────

async function extractAndSaveFirmInsights(
  responseText: string,
  projectId: string | undefined,
  agentId: string,
  userId: string
): Promise<void> {
  // Match [FIRM INSIGHT: tipo=X] followed by content until next section break
  // Section breaks: blank line, next [FIRM INSIGHT, bold header, markdown heading, or end of string
  const insightRegex = /\[FIRM INSIGHT:\s*tipo=(\w+)\]\s*(.+?)(?=\n\n|\n\[FIRM INSIGHT|\n\*\*[A-ZÁÉÍÓÚ]|\n#{1,3}\s|\n[A-ZÁÉÍÓÚ][A-ZÁÉÍÓÚ\s]{3,}(?:\n|:)|$)/gs;
  let match;
  let savedCount = 0;

  while ((match = insightRegex.exec(responseText)) !== null) {
    const insightType = match[1];
    let content = match[2].trim();

    // Truncate if too long (regex might have captured too much)
    if (content.length > 1000) {
      // Find first sentence boundary after 100 chars
      const sentenceEnd = content.indexOf(".", 100);
      if (sentenceEnd > 0) content = content.slice(0, sentenceEnd + 1);
    }

    if (content.length < 10) continue;

    try {
      // Generate a clean title from first ~8 words
      const title = content
        .replace(/\*\*/g, "")
        .split(/\s+/)
        .slice(0, 8)
        .join(" ");

      // Extract meaningful tags (words > 4 chars, no common words)
      const stopWords = new Set(["sobre", "entre", "desde", "hasta", "cuando", "donde", "porque", "tiene", "están", "puede", "como", "para", "este", "esta", "estos", "estas", "todos"]);
      const tags = content
        .toLowerCase()
        .replace(/[^a-záéíóúñü\s]/g, " ")
        .split(/\s+/)
        .filter(w => w.length > 4 && !stopWords.has(w))
        .filter((v, i, a) => a.indexOf(v) === i) // unique
        .slice(0, 10);

      const created = await prisma.firmInsight.create({
        data: {
          title,
          content,
          insightType,
          tags,
          sourceProjectId: projectId ?? null,
          sourceAgentId: agentId,
          confidence: 30,
          validatedByUser: false,
          isActive: true,
          ownerId: userId,
        },
      });

      // Auto-classify NAICS sector (fire-and-forget)
      classifyInsightSector({
        title: created.title,
        content: created.content,
        functionalDomain: null,
      })
        .then((res) => {
          if (res.naicsSector || res.confidence > 0) {
            return prisma.firmInsight.update({
              where: { id: created.id },
              data: {
                naicsSector: res.naicsSector,
                naicsSectorConfidence: res.confidence,
              },
            });
          }
        })
        .catch((err) => console.warn("[INSIGHT_NAICS_HOOK]", err));

      savedCount++;
    } catch (err) {
      console.error("[FIRM_INSIGHT] Failed to save:", err);
    }
  }

  if (savedCount > 0) {
    console.log(`[FIRM_INSIGHT] Saved ${savedCount} insights from ${agentId} for project ${projectId}`);
  }
}

async function extractAndSaveRevenuePriority(
  responseText: string,
  projectId: string | undefined,
  agentId: string
): Promise<void> {
  if (!projectId || agentId !== "strategist") return;

  // Match REVENUE PRIORITY section with flexible header format:
  // Handles: "## REVENUE PRIORITY", "**REVENUE PRIORITY**", "REVENUE PRIORITY"
  const rpMatch = responseText.match(
    /(?:#{1,3}\s*|\*\*)?REVENUE\s+PRIORITY\*?\*?\s*\n([\s\S]*?)(?=\n(?:#{1,3}\s|\*\*[A-ZÁÉÍÓÚ]|VALIDACI[OÓ]N|NEXT\s+ACTION)|$)/i
  );

  if (!rpMatch) {
    console.log("[REVENUE_PRIORITY] No REVENUE PRIORITY section found in response");
    return;
  }

  const rpBlock = rpMatch[1];

  // Extract score — handles "Score: 2/10" with bullets (-, *, •) or without
  const scoreMatch = rpBlock.match(/Score:\s*(\d+)(?:\s*\/\s*10)?/i);
  if (!scoreMatch) {
    console.log("[REVENUE_PRIORITY] Score not found in block:", rpBlock.slice(0, 100));
    return;
  }
  const score = parseInt(scoreMatch[1]);

  // Extract steps — handles "Pasos para facturar: 6"
  const stepsMatch = rpBlock.match(/Pasos\s+para\s+facturar:\s*(\d+)/i);
  const steps = stepsMatch ? parseInt(stepsMatch[1]) : null;

  // Extract detail — handles "Detalle: 1. ..."
  const detailMatch = rpBlock.match(/Detalle:\s*([\s\S]*?)(?=\n\s*[-•*]\s*Fecha|\n\s*[-•*]\s*Razonamiento|$)/i);
  const detail = detailMatch?.[1]?.trim() ?? null;

  // Extract date
  const dateMatch = rpBlock.match(/Fecha\s+estimada[^:]*:\s*(.+?)(?:\n|$)/i);

  // Extract reasoning
  const reasonMatch = rpBlock.match(/Razonamiento:\s*([\s\S]*?)(?=\n\s*[-•*]\s*[A-Z]|\n\n|$)/i);

  console.log(`[REVENUE_PRIORITY] Extracted — score: ${score}, steps: ${steps}, detail: ${detail?.slice(0, 60)}...`);

  try {
    await prisma.project.update({
      where: { id: projectId },
      data: {
        revenueProximityScore: Math.min(10, Math.max(1, score)),
        stepsToRevenue: steps,
        stepsToRevenueDetail: detail,
        revenueProximityReason: reasonMatch?.[1]?.trim() ?? null,
        estimatedRevenueDate: (() => {
          const raw = dateMatch?.[1]?.trim();
          if (!raw) return null;
          if (/indefini|no\s+definid|sin\s+fecha|n\/a/i.test(raw)) return null;
          const parsed = new Date(raw);
          return isNaN(parsed.getTime()) ? null : parsed;
        })(),
        revenueLastAssessedAt: new Date(),
        revenueLastAssessedBy: agentId,
      },
    });
    console.log(`[REVENUE_PRIORITY] Saved to project ${projectId}: ${score}/10, ${steps} steps`);
  } catch (err) {
    console.error("[REVENUE_PRIORITY] Failed to save:", err);
  }
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

    // For the strategist: append JSON block instruction so we can parse assigned agents.
    // IMPORTANTE: el bloque JSON debe ir DESPUÉS del marcador <!-- INTERNAL --> para que
    // el sanitizer de export lo excluya del PDF/DOCX/PPTX (ver sanitizeForDocument en
    // components/expert-panel/consultants-thread.tsx).
    const strategistJsonInstruction = isStrategist
      ? `

AL FINAL de tu respuesta (después de ## VALIDACIÓN), estructura tu output así:

1. Termina tu entregable normalmente (última sección que vea el usuario).
2. Emite en una línea aparte el marcador: <!-- INTERNAL -->
3. Inmediatamente después del marcador, añade EXACTAMENTE este bloque con los agentes que seleccionaste:

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
Selecciona 1-3 agentes. El strategist NO se asigna a sí mismo. Ordena por prioridad (1 = activar primero).

El marcador <!-- INTERNAL --> es OBLIGATORIO cuando emitas el bloque de agent assignments: sin él, el JSON aparecerá en el documento exportado del cliente.`
      : "";

    const cognitiveContract = `CONTRATO COGNITIVO (marco operativo — aplica por encima de tu ADN):

Sos un socio senior, no un buscador ni un resumen de documentos. Razoná con toda tu capacidad: traé frameworks, analogías, criterio de mercado y órdenes de magnitud que no estén en el contexto. El contexto que recibís (datos del proyecto, del cliente, corpus, research) es tu ANCLA y tu fuente de hechos — no el techo de lo que podés pensar.

Dos registros, siempre etiquetados:
- HECHO VERIFICADO — lo que está en tu contexto. Exacto. Nunca fabriques un hecho del cliente.
- ESTIMACIÓN / CRITERIO — tu razonamiento, benchmarks, analogías, órdenes de magnitud. Permitido y valioso. Etiquetado, nunca disfrazado de hecho.

ORIENTACIÓN A ENTREGABLE: cada respuesta apunta a producir un artefacto concreto (diagnóstico accionable, plan, propuesta, pricing, brief). Hacé las preguntas mínimas que conducen a ese entregable; no preguntes para postergar. Si podés producir una primera versión con supuestos etiquetados, hacelo y avanzá.`;

    const systemPrompt = [
      cognitiveContract,
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

    let userPrompt = projectContext
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
          // ── S2: pre-fetch loop (research Perplexity + Raindrop) antes de streamear ──
          let prefetchBlocks = "";
          try {
            const decision = await decideResearch(message, (projectContext ?? "").slice(0, 1500));
            const tasks: Promise<{ data: string }>[] = [];
            if (decision.needsResearch && decision.query) {
              sendSSE({ status: "researching", label: `Investigando: ${decision.query}` });
              tasks.push(researchSkill(decision.query));
            }
            const kw = message.toLowerCase().split(/[\s,.\-_/]+/).filter((w) => w.length > 4).slice(0, 6);
            if (agentConfig.usesRaindrop && kw.length > 0) {
              if (!decision.needsResearch) sendSSE({ status: "researching", label: "Consultando referencias…" });
              tasks.push(inspirationSkill(userId, kw));
            }
            if (tasks.length > 0) {
              const results = await Promise.all(tasks);
              prefetchBlocks = results.map((r) => r.data).filter(Boolean).join("\n\n");
            }
          } catch (prefetchErr) {
            console.warn("[AGENT_CHAT] prefetch loop failed, continuing without:", prefetchErr);
          }
          if (prefetchBlocks) {
            userPrompt = `${prefetchBlocks}\n\n${userPrompt}`;
          }

          // Resolve tier → provider + modelId
          const { resolveTierModel, MODEL_IDS, supportsSamplingParams } = await import("@/lib/clients/llm");
          const tier = agentConfig.tier ?? "T3";
          const escalated = agentConfig.escalated ?? false;
          const resolved = resolveTierModel(tier, { escalated });

          // ── Gemini streaming ────────────────────────────────────────
          if (resolved.provider === "gemini") {
            const geminiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
            if (!geminiKey) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY no configurada");

            const ai = new GoogleGenAI({ apiKey: geminiKey });
            const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${userPrompt}` : userPrompt;

            const streamIter = await ai.models.generateContentStream({
              model: resolved.modelId,
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
          } else if (resolved.provider === "anthropic") {
            const anthropicKey = process.env.ANTHROPIC_API_KEY;

            if (!anthropicKey) {
              // Fallback to Gemini Flash streaming
              console.warn("[AGENT_CHAT] ANTHROPIC_API_KEY missing — fallback to Gemini Flash stream");
              const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY! });
              const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${userPrompt}` : userPrompt;

              const streamIter = await ai.models.generateContentStream({
                model: MODEL_IDS.geminiT1,
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

              // Enable prompt caching when system prompt is long enough (>= 4000 chars)
              const useCaching = systemPrompt.length >= 4000;
              const systemParam = useCaching
                ? [
                    {
                      type: "text" as const,
                      text: systemPrompt,
                      cache_control: { type: "ephemeral" as const },
                    },
                  ]
                : systemPrompt;

              const streamParams: Anthropic.Messages.MessageStreamParams = {
                model: resolved.modelId,
                max_tokens: 8192,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                system: systemParam as any,
                messages: [{ role: "user", content: userPrompt }],
              };
              if (supportsSamplingParams(resolved.modelId)) {
                streamParams.temperature = 0.7;
              }
              const anthropicStream = client.messages.stream(streamParams);

              for await (const event of anthropicStream) {
                if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
                  const text = event.delta.text;
                  if (text) {
                    fullText += text;
                    sendSSE({ text, agentId: effectiveAgentId });
                  }
                }
              }
            }
          } else {
            throw new Error(`Unsupported LLM provider: ${resolved.provider}`);
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

          // ── Extract FirmInsights & Revenue Priority (fire-and-forget) ──
          console.log(`[AGENT_CHAT] Post-stream extraction — agentId: ${effectiveAgentId}, projectId: ${projectId}, responseLength: ${fullText.length}`);
          console.log(`[AGENT_CHAT] Response contains REVENUE PRIORITY: ${fullText.includes("REVENUE PRIORITY")}`);
          console.log(`[AGENT_CHAT] Response contains [FIRM INSIGHT: ${fullText.includes("[FIRM INSIGHT:")}`);

          try {
            await Promise.all([
              extractAndSaveFirmInsights(fullText, projectId, effectiveAgentId, userId),
              extractAndSaveRevenuePriority(fullText, projectId, effectiveAgentId),
            ]);
          } catch (err) {
            console.error("[EXTRACTION] FirmInsight/RevenuePriority save error:", err);
          }

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
