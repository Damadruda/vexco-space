import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { GoogleGenerativeAI } from '@google/generative-ai'
import Anthropic from '@anthropic-ai/sdk'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import {
  ENTERPRISE_AGENTS,
  AGILE_PM_SYSTEM_PROMPT,
  detectRoutingMode,
  getAgentsForMode,
  type AgentProfile,
} from '@/lib/agents-config'

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrchestrationTask {
  title: string
  description: string
  priority: 'Must' | 'Should' | 'Could' | "Won't"
  effort: number
  expertSource: string
  status: 'Backlog' | 'Todo' | 'In Progress'
}

interface OrchestrationMilestone {
  title: string
  date: string
  description: string
}

interface OrchestrationOutput {
  analysis: string
  tasks: OrchestrationTask[]
  milestones: OrchestrationMilestone[]
}

type IdeaItem = {
  rawContent: string
  sourceTitle: string | null
  sourceUrl: string | null
  tags: string[]
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

function mapPriority(p: string): string {
  const map: Record<string, string> = {
    Must: 'critical',
    Should: 'high',
    Could: 'medium',
    "Won't": 'low',
  }
  return map[p] ?? 'medium'
}

function mapStatus(s: string): string {
  const map: Record<string, string> = {
    Backlog: 'backlog',
    Todo: 'todo',
    'In Progress': 'in_progress',
  }
  return map[s] ?? 'backlog'
}

function getCurrentQuarter(): string {
  const month = new Date().getMonth() + 1
  if (month <= 3) return 'q1'
  if (month <= 6) return 'q2'
  if (month <= 9) return 'q3'
  return 'q4'
}

// ─── RAG: Knowledge Base Context Builder ──────────────────────────────────────

interface KnowledgeEntry {
  title: string
  summary: string | null
  category: string | null
  route: string | null
  tags: string[]
}

function buildKnowledgeContext(entries: KnowledgeEntry[]): string {
  if (entries.length === 0) {
    return '(No hay conocimiento guardado aún — usa tu criterio experto de vanguardia)'
  }

  const designEntries = entries.filter(
    (e) =>
      e.route === 'B' ||
      e.category?.toLowerCase().includes('design') ||
      e.category?.toLowerCase().includes('ux') ||
      e.category?.toLowerCase().includes('ui') ||
      e.tags.some((t) => ['design', 'ux', 'ui', 'trend', 'tendencia'].includes(t.toLowerCase()))
  )

  const devEntries = entries.filter(
    (e) =>
      e.route === 'C' ||
      e.category?.toLowerCase().includes('tech') ||
      e.category?.toLowerCase().includes('dev') ||
      e.category?.toLowerCase().includes('tool') ||
      e.tags.some((t) => ['tech', 'dev', 'tool', 'herramienta', 'stack'].includes(t.toLowerCase()))
  )

  const otherEntries = entries.filter(
    (e) => !designEntries.includes(e) && !devEntries.includes(e)
  )

  const fmt = (list: KnowledgeEntry[]) =>
    list.map((e) => `  · ${e.title}${e.summary ? ` — ${e.summary}` : ''}`).join('\n')

  const sections: string[] = []
  if (designEntries.length > 0)
    sections.push(`TENDENCIAS DE DISEÑO Y UX GUARDADAS:\n${fmt(designEntries)}`)
  if (devEntries.length > 0)
    sections.push(`HERRAMIENTAS Y ACELERADORES DEV GUARDADOS:\n${fmt(devEntries)}`)
  if (otherEntries.length > 0)
    sections.push(`OTROS CONOCIMIENTOS GUARDADOS:\n${fmt(otherEntries)}`)

  return sections.join('\n\n')
}

// ─── Phase A: Gemini 2.5 Flash — Enterprise Agents Debate ────────────────────

// Agent IDs that receive KB context as design inspiration (UX / Innovation)
const UX_AGENT_IDS = [5, 6] // Frictionless Workflow Designer, Innovation Architect
// Agent IDs that receive KB context as tech stack starting point
const TECH_AGENT_IDS = [1, 4] // Autonomous Strategist, Infrastructure Lead

function buildAgentRagDirective(agent: AgentProfile, knowledgeContext: string): string {
  if (UX_AGENT_IDS.includes(agent.id)) {
    return `
  CONTEXTO RAG — INSPIRACIÓN DE ESTILO Y DISEÑO DEL USUARIO:
  ${knowledgeContext}
  DIRECTIVA: Utiliza las tendencias guardadas arriba como tu inspiración principal y ADN de estilo. Si el contexto es escaso o poco relevante para este proyecto, amplía y evoluciona estas ideas usando tu vasto conocimiento en diseño de vanguardia (Bento UI, Glassmorphism, Spatial UI, Motion Design). OBLIGATORIO: Rechaza diseños corporativos genéricos y aburridos.`
  }
  if (TECH_AGENT_IDS.includes(agent.id)) {
    return `
  CONTEXTO RAG — ACELERADORES DE DESARROLLO DEL EQUIPO:
  ${knowledgeContext}
  DIRECTIVA: Toma los aceleradores de desarrollo guardados arriba como tu punto de partida. Si aplican al proyecto, intégralos de forma concreta. Si el contexto es escaso o existen herramientas más eficientes para este proyecto específico, usa tu criterio experto de IA para sugerir el mejor stack posible, complementando las preferencias conocidas del usuario.`
  }
  return ''
}

async function runGeminiAgents(
  item: IdeaItem,
  knowledgeContext: string,
  selectedAgents: AgentProfile[]
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY not set')

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: 2560,
    } as Parameters<typeof genAI.getGenerativeModel>[0]['generationConfig'],
  })

  const agentDescriptions = selectedAgents
    .map((a, i) => {
      const ragDirective = buildAgentRagDirective(a, knowledgeContext)
      return `${i + 1}. **${a.name}** (${a.role})
  Misión: ${a.systemPrompt}${ragDirective}`
    })
    .join('\n\n')

  const prompt = `Eres el facilitador de una sala de guerra estratégica (War Room). Los siguientes agentes especializados de VexCo deben debatir esta idea de negocio. Cada agente aporta su perspectiva única y complementaria — sin repetir lo que otro ya dijo.

IDEA A ANALIZAR:
Título: ${item.sourceTitle || 'Sin título'}
Contenido: ${item.rawContent}
${item.sourceUrl ? `Fuente: ${item.sourceUrl}` : ''}
${item.tags.length > 0 ? `Tags: ${item.tags.join(', ')}` : ''}

AGENTES SELECCIONADOS Y SUS DIRECTIVAS:
${agentDescriptions}

REGLAS DEL DEBATE:
- Cada agente habla en primera persona, con su voz única y opinionada.
- Sé específico y valiente: cita tecnologías, métricas, empresas reales, frameworks concretos.
- Escribe 3-4 párrafos sustanciales por agente. Cero genéricos. Cero filler.
- Los agentes con CONTEXTO RAG deben citar o referenciar explícitamente ese conocimiento en su análisis.
- Al final, incluye "SÍNTESIS DEL DEBATE" de 1 párrafo que integre los puntos de mayor consenso y los conflictos clave.

FORMATO DE RESPUESTA:
[NOMBRE DEL AGENTE — ROL]
<análisis del agente>

[SÍNTESIS DEL DEBATE]
<síntesis integradora>`

  const result = await model.generateContent(prompt)
  return result.response.text()
}

// ─── Phase B: Perplexity — Real-Time Market Research ─────────────────────────

async function runPerplexityResearch(geminiAnalysis: string, item: IdeaItem): Promise<string> {
  const apiKey = process.env.PERPLEXITY_API_KEY
  if (!apiKey) throw new Error('PERPLEXITY_API_KEY not set')

  const res = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'sonar',
      messages: [
        {
          role: 'system',
          content:
            'Eres un analista de mercado B2B con acceso a datos en tiempo real. Proporciona insights específicos y basados en datos: números actuales, nombres de empresas y hechos de mercado verificables.',
        },
        {
          role: 'user',
          content: `Basado en este análisis estratégico, realiza un informe de investigación de mercado B2B en tiempo real:

IDEA: ${item.sourceTitle || item.rawContent.slice(0, 200)}

CONTEXTO ESTRATÉGICO (debate de agentes expertos):
${geminiAnalysis.slice(0, 1500)}

Tu investigación debe cubrir:
1. Tamaño de mercado actual y tasa de crecimiento (con números específicos y fuentes)
2. Top 3-5 competidores directos (estado actual, funding y diferenciadores)
3. Viabilidad B2B: quiénes son los compradores, ticket promedio y ciclo de venta
4. Tendencias de mercado recientes (últimos 6-12 meses) que validen o cuestionen esta idea
5. Barreras de entrada y riesgos regulatorios o macro en este espacio

Sé específico. Cita empresas reales y datos concretos. Evita afirmaciones vagas.`,
        },
      ],
      max_tokens: 1500,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Perplexity API error ${res.status}: ${err}`)
  }

  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ''
}

// ─── Phase C: Claude 3.5 Sonnet — Agile PM Synthesis ─────────────────────────

async function runClaudeAgilepm(
  item: IdeaItem,
  geminiDebate: string,
  perplexityResearch: string
): Promise<OrchestrationOutput> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

  const anthropic = new Anthropic({ apiKey })

  const userMessage = `IDEA ORIGINAL:
Título: ${item.sourceTitle || 'Sin título'}
Contenido: ${item.rawContent}
${item.sourceUrl ? `Fuente: ${item.sourceUrl}` : ''}
${item.tags.length > 0 ? `Tags: ${item.tags.join(', ')}` : ''}

---
DEBATE ESTRATÉGICO DE AGENTES (Gemini 2.5 Flash):
${geminiDebate}

---
INVESTIGACIÓN DE MERCADO B2B EN TIEMPO REAL (Perplexity Sonar):
${perplexityResearch || '(No disponible — genera el plan con el contexto existente)'}

---
Sintetiza todo lo anterior y genera el plan de acción ejecutable en JSON estricto.`

  const message = await anthropic.messages.create({
    model: 'claude-3-haiku-20240307',
    max_tokens: 4096,
    system: AGILE_PM_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  })

  const rawText = message.content
    .filter((block) => block.type === 'text')
    .map((block) => (block as { type: 'text'; text: string }).text)
    .join('')

  // Strip markdown code fences if Claude wraps the JSON
  const jsonText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()

  const output = JSON.parse(jsonText) as OrchestrationOutput
  console.log('[ORCHESTRATOR] Claude Agile PM — tasks:', output.tasks?.length)
  return output
}

// ─── Persist Results ──────────────────────────────────────────────────────────

async function persistResults(
  inboxItemId: string,
  userId: string,
  output: OrchestrationOutput,
  modelChain: string,
  startTime: number,
  inboxItem: { tags: string[]; sourceTitle: string | null }
) {
  const analysisResult = await prisma.analysisResult.create({
    data: {
      inboxItemId,
      summary: output.analysis,
      keyInsights: output.tasks
        .filter((t) => t.priority === 'Must')
        .map((t) => t.title)
        .slice(0, 5),
      suggestedTags: inboxItem.tags,
      category: 'ai-generated',
      sentiment: 'positive',
      relevanceScore: 0.95,
      rawAiResponse: JSON.stringify(output),
      modelUsed: modelChain,
      processingTimeMs: Date.now() - startTime,
    },
  })

  const agileTasks = await Promise.all(
    output.tasks.map((task) =>
      prisma.agileTask.create({
        data: {
          title: task.title,
          description: task.description,
          status: mapStatus(task.status),
          priority: mapPriority(task.priority),
          type: 'task',
          storyPoints: task.effort ?? 3,
          labels: [
            task.expertSource
              .toLowerCase()
              .replace(/\s+/g, '-')
              .replace(/[^a-z0-9-]/g, ''),
          ],
          assigneeId: userId,
        },
      })
    )
  )

  const roadmapTimeline = await prisma.roadmapTimeline.create({
    data: {
      title: `${getCurrentQuarter().toUpperCase()} ${new Date().getFullYear()} · ${
        inboxItem.sourceTitle?.slice(0, 40) ?? 'Nuevo Roadmap'
      }`,
      description: output.analysis.slice(0, 300) + '…',
      phase: getCurrentQuarter(),
      year: new Date().getFullYear(),
      status: 'planned',
      startDate: output.milestones[0]?.date
        ? new Date(output.milestones[0].date)
        : new Date(),
      endDate: output.milestones[output.milestones.length - 1]?.date
        ? new Date(output.milestones[output.milestones.length - 1].date)
        : new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000),
      milestones: output.milestones.map((m) => ({
        name: m.title,
        date: m.date,
        description: m.description,
      })),
      ownerId: userId,
      color: '#6366f1',
    },
  })

  await prisma.inboxItem.update({
    where: { id: inboxItemId },
    data: { status: 'validated' },
  })

  return { analysisResult, agileTasks, roadmapTimeline }
}

// ─── Endpoint ─────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { inboxItemId } = await request.json()
    if (!inboxItemId) {
      return NextResponse.json({ error: 'inboxItemId is required' }, { status: 400 })
    }

    const inboxItem = await prisma.inboxItem.findUnique({ where: { id: inboxItemId } })
    if (!inboxItem || inboxItem.userId !== user.id) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    // Return cached analysis if already validated
    const existingAnalysis = await prisma.analysisResult.findUnique({ where: { inboxItemId } })
    if (existingAnalysis && (inboxItem.status === 'analyzed' || inboxItem.status === 'validated')) {
      const existingTasks = await prisma.agileTask.findMany({
        where: { assigneeId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 10,
      })
      return NextResponse.json({
        success: true,
        cached: true,
        processingTimeMs: Date.now() - startTime,
        analysisResult: existingAnalysis,
        agileTasks: existingTasks,
        roadmapTimeline: null,
      })
    }

    const ideaItem: IdeaItem = {
      rawContent: inboxItem.rawContent,
      sourceTitle: inboxItem.sourceTitle,
      sourceUrl: inboxItem.sourceUrl,
      tags: inboxItem.tags,
    }

    // ── Routing: detect mode and select agents ────────────────────────────────

    const routingMode = detectRoutingMode(ideaItem.rawContent, ideaItem.tags)
    const selectedAgents = getAgentsForMode(routingMode)
    console.log(
      `[ORCHESTRATOR] Routing mode: ${routingMode} — agents selected: ${selectedAgents.map((a) => a.name).join(', ')}`
    )

    // ── RAG: Build Knowledge Base context ─────────────────────────────────────

    let knowledgeContext =
      '(No hay conocimiento guardado aún — usa tu criterio experto de vanguardia)'
    try {
      const knowledgeEntries = await prisma.knowledgeBase.findMany({
        where: { authorId: user.id, status: 'active' },
        select: { title: true, summary: true, category: true, route: true, tags: true },
        orderBy: { updatedAt: 'desc' },
        take: 30,
      })
      knowledgeContext = buildKnowledgeContext(knowledgeEntries)
      console.log('[ORCHESTRATOR] RAG: loaded', knowledgeEntries.length, 'knowledge entries')
    } catch (err) {
      console.warn('[ORCHESTRATOR] RAG query failed, continuing without context:', err)
    }

    // ── Phase A: Gemini 2.5 Flash — Enterprise Agents Debate ─────────────────

    let geminiDebate = ''
    if (process.env.GEMINI_API_KEY) {
      try {
        console.log(
          `[ORCHESTRATOR] Phase A: Gemini agents debating (${selectedAgents.length} agents, mode: ${routingMode})...`
        )
        geminiDebate = await runGeminiAgents(ideaItem, knowledgeContext, selectedAgents)
        console.log('[ORCHESTRATOR] Phase A complete — length:', geminiDebate.length)
      } catch (err) {
        console.warn('[ORCHESTRATOR] Phase A (Gemini) failed, continuing without it:', err)
      }
    } else {
      console.warn('[ORCHESTRATOR] Phase A: GEMINI_API_KEY not set, skipping')
    }

    // ── Phase B: Perplexity — Market Research ─────────────────────────────────

    let perplexityResearch = ''
    if (process.env.PERPLEXITY_API_KEY) {
      try {
        console.log('[ORCHESTRATOR] Phase B: Perplexity market research...')
        perplexityResearch = await runPerplexityResearch(geminiDebate, ideaItem)
        console.log('[ORCHESTRATOR] Phase B complete — length:', perplexityResearch.length)
      } catch (err) {
        console.warn('[ORCHESTRATOR] Phase B (Perplexity) failed, continuing without it:', err)
      }
    } else {
      console.warn('[ORCHESTRATOR] Phase B: PERPLEXITY_API_KEY not set, skipping')
    }

    // ── Phase C: Claude 3.5 Sonnet — Agile PM Synthesis ──────────────────────

    console.log('[ORCHESTRATOR] Phase C: Claude 3.5 Sonnet synthesizing structured plan...')
    const finalOutput = await runClaudeAgilepm(ideaItem, geminiDebate, perplexityResearch)
    console.log('[ORCHESTRATOR] Phase C complete — tasks:', finalOutput.tasks.length)

    // ── Persist & return ──────────────────────────────────────────────────────

    const pipelineSteps = [
      ...(geminiDebate ? [`gemini-agents-${routingMode}`] : []),
      ...(perplexityResearch ? ['perplexity-sonar'] : []),
      'claude-3.5-sonnet-agile-pm',
    ]

    const modelChain = [
      ...(geminiDebate ? [process.env.GEMINI_MODEL ?? 'gemini-2.5-flash'] : []),
      ...(perplexityResearch ? ['sonar'] : []),
      'claude-3-haiku-20240307',
    ].join(' → ')

    const { analysisResult, agileTasks, roadmapTimeline } = await persistResults(
      inboxItemId,
      user.id,
      finalOutput,
      modelChain,
      startTime,
      { tags: inboxItem.tags, sourceTitle: inboxItem.sourceTitle }
    )

    return NextResponse.json({
      success: true,
      cached: false,
      pipeline: pipelineSteps,
      modelChain,
      routingMode,
      agentsUsed: selectedAgents.map((a) => a.name),
      processingTimeMs: Date.now() - startTime,
      analysisResult,
      agileTasks,
      roadmapTimeline,
    })
  } catch (error) {
    console.error('[ORCHESTRATOR]', error)
    const message = error instanceof Error ? error.message : 'Orchestration failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
