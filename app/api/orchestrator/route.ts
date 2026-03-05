import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { GoogleGenerativeAI } from '@google/generative-ai'
import Anthropic from '@anthropic-ai/sdk'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

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

// ─── Phase A: Gemini Multi-Agent Debate (RAG-Enhanced, optional) ──────────────

async function runGeminiAgents(item: IdeaItem, knowledgeContext: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY not set')

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: 2048,
    } as Parameters<typeof genAI.getGenerativeModel>[0]['generationConfig'],
  })

  const prompt = `You are facilitating a strategic debate between 3 specialized AI experts analyzing a business idea. Each expert provides their unique perspective.

IDEA TO ANALYZE:
Title: ${item.sourceTitle || 'Untitled idea'}
Content: ${item.rawContent}
${item.sourceUrl ? `Source: ${item.sourceUrl}` : ''}
${item.tags.length > 0 ? `Tags: ${item.tags.join(', ')}` : ''}

---
USER'S KNOWLEDGE BASE (style DNA & preferred tools):
${knowledgeContext}
---

Provide a detailed analysis from each expert's perspective:

1. LEAN STRATEGIST: Evaluate the value proposition, problem-solution fit, and customer segment. Is the problem real and urgent? What is the minimum viable solution?

2. TECH FUTURIST: Take the saved development accelerators from the USER'S KNOWLEDGE BASE above as your starting point. Suggest the best possible technology stack, complementing the user's known preferences.

3. CREATIVE UX/UI & TREND ARCHITECT: Use the design trends from the USER'S KNOWLEDGE BASE as your primary inspiration. Push for bold, opinionated, delightful experiences that users will remember.

Write a rich, detailed debate (3-4 paragraphs per expert). Be specific and avoid generic advice.`

  const result = await model.generateContent(prompt)
  return result.response.text()
}

// ─── Phase B: Perplexity Real-Time Market Research (optional) ─────────────────

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
            'You are a market research analyst with access to real-time data. Provide specific, data-driven insights with current numbers, company names, and market facts.',
        },
        {
          role: 'user',
          content: `Based on this strategic analysis of a business idea, perform a real-time market research report:

IDEA: ${item.sourceTitle || item.rawContent.slice(0, 200)}

STRATEGIC CONTEXT FROM EXPERT AGENTS:
${geminiAnalysis.slice(0, 1500)}

Your research must cover:
1. Current market size and growth rate (with specific numbers and sources)
2. Top 3-5 direct competitors (with their current status, funding, and differentiators)
3. B2B viability: who are the buyers, what is the typical deal size, and sales cycle
4. Recent market trends (last 6-12 months) that validate or challenge this idea
5. Regulatory or macro risks in this space

Be specific, cite real companies and data points. Avoid vague statements.`,
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

// ─── Phase C: Claude Arquitecto VexCo — Structured Output via tool_use ────────

const ORCHESTRATION_TOOL: Anthropic.Tool = {
  name: 'generate_action_plan',
  description: 'Genera el plan de acción ejecutable estructurado para el proyecto analizado',
  input_schema: {
    type: 'object' as const,
    properties: {
      analysis: {
        type: 'string',
        description:
          'Síntesis estratégica de 3-4 párrafos: validación del problema, viabilidad técnica/mercado, riesgos y path recomendado. Integra toda la información disponible.',
      },
      tasks: {
        type: 'array',
        description: 'Entre 6 y 8 tareas técnicas concretas y accionables',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Título de la tarea (máx 80 caracteres)' },
            description: {
              type: 'string',
              description: 'Qué hacer y por qué, en 2-3 frases concretas',
            },
            priority: {
              type: 'string',
              enum: ['Must', 'Should', 'Could', "Won't"],
            },
            effort: {
              type: 'number',
              description: 'Story points en Fibonacci: 1, 2, 3, 5, 8 ó 13',
            },
            expertSource: {
              type: 'string',
              description: 'Área o rol responsable (ej. Arquitectura, Backend, Frontend, DevOps)',
            },
            status: {
              type: 'string',
              enum: ['Backlog', 'Todo', 'In Progress'],
              description: "Las tareas Must van a Todo, el resto a Backlog",
            },
          },
          required: ['title', 'description', 'priority', 'effort', 'expertSource', 'status'],
        },
        minItems: 6,
        maxItems: 8,
      },
      milestones: {
        type: 'array',
        description: 'Entre 3 y 4 hitos que abarquen los próximos 6 meses',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Nombre de la fase (ej. MVP Alpha)' },
            date: { type: 'string', description: 'Fecha en formato YYYY-MM-DD' },
            description: { type: 'string', description: 'Qué se logra en este hito' },
          },
          required: ['title', 'date', 'description'],
        },
        minItems: 3,
        maxItems: 4,
      },
    },
    required: ['analysis', 'tasks', 'milestones'],
  },
}

async function runClaudeArquitecto(
  item: IdeaItem,
  geminiAnalysis: string,
  perplexityResearch: string,
  knowledgeContext: string
): Promise<OrchestrationOutput> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY no configurada — integración AI real requerida')

  const anthropic = new Anthropic({ apiKey })

  const systemPrompt = `Eres el Arquitecto de Software de VexCo. Analiza la idea. Si detectas que es un proyecto para un cliente (ej. menciona marcas como Enprotech o automatizaciones B2B), IGNORA las fases de validación de mercado o PMF. Devuelve directamente tareas técnicas reales: Arquitectura, Stack, Endpoints, Base de Datos y Despliegue.

BASE DE CONOCIMIENTO DEL EQUIPO (contexto RAG):
${knowledgeContext}`

  const userMessage = `IDEA A ANALIZAR:
Título: ${item.sourceTitle || 'Sin título'}
Contenido: ${item.rawContent}
${item.sourceUrl ? `Fuente: ${item.sourceUrl}` : ''}
${item.tags.length > 0 ? `Tags: ${item.tags.join(', ')}` : ''}
${
  geminiAnalysis
    ? `
---
DEBATE DE EXPERTOS (Gemini Multi-Agent):
${geminiAnalysis}
`
    : ''
}${
  perplexityResearch
    ? `
---
INVESTIGACIÓN DE MERCADO EN TIEMPO REAL (Perplexity):
${perplexityResearch}
`
    : ''
}
---
Genera el plan de acción ejecutable llamando a la herramienta generate_action_plan.`

  const response = await anthropic.messages.create({
    model: 'claude-3-haiku-20240307',
    max_tokens: 4096,
    system: systemPrompt,
    tools: [ORCHESTRATION_TOOL],
    tool_choice: { type: 'tool', name: 'generate_action_plan' },
    messages: [{ role: 'user', content: userMessage }],
  })

  const toolUseBlock = response.content.find((block) => block.type === 'tool_use')
  if (!toolUseBlock || toolUseBlock.type !== 'tool_use') {
    throw new Error('Claude no devolvió un bloque tool_use válido')
  }

  const output = toolUseBlock.input as OrchestrationOutput
  console.log('[ORCHESTRATOR] Claude tool_use — tasks:', output.tasks?.length)
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
    data: { status: 'analyzed' },
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
    if (existingAnalysis && inboxItem.status === 'analyzed') {
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

    // ── RAG: Build Knowledge Base context ────────────────────────────────────

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

    // ── Phase A: Gemini Agents Debate (optional) ──────────────────────────────

    let geminiAnalysis = ''
    if (process.env.GEMINI_API_KEY) {
      try {
        console.log('[ORCHESTRATOR] Phase A: Gemini agents debating...')
        geminiAnalysis = await runGeminiAgents(ideaItem, knowledgeContext)
        console.log('[ORCHESTRATOR] Phase A complete — length:', geminiAnalysis.length)
      } catch (err) {
        console.warn('[ORCHESTRATOR] Phase A (Gemini) failed, continuing without it:', err)
      }
    } else {
      console.warn('[ORCHESTRATOR] Phase A: GEMINI_API_KEY not set, skipping')
    }

    // ── Phase B: Perplexity Market Research (optional) ────────────────────────

    let perplexityResearch = ''
    if (process.env.PERPLEXITY_API_KEY) {
      try {
        console.log('[ORCHESTRATOR] Phase B: Perplexity market research...')
        perplexityResearch = await runPerplexityResearch(geminiAnalysis, ideaItem)
        console.log('[ORCHESTRATOR] Phase B complete — length:', perplexityResearch.length)
      } catch (err) {
        console.warn('[ORCHESTRATOR] Phase B (Perplexity) failed, continuing without it:', err)
      }
    } else {
      console.warn('[ORCHESTRATOR] Phase B: PERPLEXITY_API_KEY not set, skipping')
    }

    // ── Phase C: Claude Arquitecto VexCo (required) ───────────────────────────

    console.log('[ORCHESTRATOR] Phase C: Claude Arquitecto generating structured plan...')
    const finalOutput = await runClaudeArquitecto(
      ideaItem,
      geminiAnalysis,
      perplexityResearch,
      knowledgeContext
    )
    console.log('[ORCHESTRATOR] Phase C complete — tasks:', finalOutput.tasks.length)

    // ── Persist & return ──────────────────────────────────────────────────────

    const pipelineSteps = [
      ...(geminiAnalysis ? ['gemini-agents'] : []),
      ...(perplexityResearch ? ['perplexity-research'] : []),
      'claude-arquitecto-vexco',
    ]

    const modelChain = [
      ...(geminiAnalysis ? [process.env.GEMINI_MODEL ?? 'gemini-2.5-flash'] : []),
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
