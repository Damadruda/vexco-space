import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// ─── Types ────────────────────────────────────────────────────────────────────

interface GeminiTask {
  title: string
  description: string
  priority: 'Must' | 'Should' | 'Could' | "Won't"
  effort: number
  expertSource: string
  status: 'Backlog' | 'Todo' | 'In Progress'
}

interface GeminiMilestone {
  title: string
  date: string
  description: string
}

interface GeminiOutput {
  analysis: string
  tasks: GeminiTask[]
  milestones: GeminiMilestone[]
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

// ─── Gemini Prompt ────────────────────────────────────────────────────────────

function buildPrompt(item: { rawContent: string; sourceTitle: string | null; sourceUrl: string | null; tags: string[] }): string {
  return `You are "The Closer" — a senior Agile PM Expert who synthesizes strategic analysis from 8 specialized AI agents:

1. Lean Strategist — validates the value proposition and problem-solution fit
2. Tech Futurist — evaluates technical feasibility and stack choices
3. Market Analyst — analyzes market size, trends, and competition
4. Risk Assessor — identifies critical risks and mitigation strategies
5. UX Visionary — designs the user experience and interaction model
6. Financial Expert — projects the financial model and unit economics
7. Growth Hacker — defines acquisition channels and growth loops
8. Operations Expert — plans the execution roadmap and team structure

IDEA TO ANALYZE:
Title: ${item.sourceTitle || 'Untitled idea'}
Content: ${item.rawContent}
${item.sourceUrl ? `Source: ${item.sourceUrl}` : ''}
${item.tags.length > 0 ? `Tags: ${item.tags.join(', ')}` : ''}

YOUR TASK:
Synthesize all 8 agents' perspectives and produce a rigorous strategic analysis with actionable deliverables.

REQUIRED OUTPUT (strict JSON — no markdown, no explanation, just the JSON object):
{
  "analysis": "A comprehensive 3-4 paragraph strategic synthesis covering: (1) problem/opportunity validation, (2) technical and market viability, (3) key risks and differentiators, (4) recommended path forward. Be specific, not generic.",
  "tasks": [
    {
      "title": "Specific actionable task title (max 80 chars)",
      "description": "Detailed description of what to do and why (2-3 sentences)",
      "priority": "Must|Should|Could|Won't",
      "effort": 1,
      "expertSource": "Name of the agent who proposed this task",
      "status": "Backlog|Todo|In Progress"
    }
  ],
  "milestones": [
    {
      "title": "Phase name (e.g. 'Discovery & Validation')",
      "date": "YYYY-MM-DD",
      "description": "What will be achieved by this milestone"
    }
  ]
}

CONSTRAINTS:
- Generate exactly 6-8 tasks covering different expert areas
- Generate exactly 3-4 milestones spanning the next 6 months
- Tasks marked "Must" should be in "Todo" status; others in "Backlog"
- effort is Fibonacci story points (1, 2, 3, 5, 8, 13)
- Be specific to the idea — no generic advice
- Respond ONLY with the JSON object, nothing else`
}

// ─── Endpoint ─────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const body = await request.json()
    const { inboxItemId } = body

    if (!inboxItemId) {
      return NextResponse.json({ error: 'inboxItemId is required' }, { status: 400 })
    }

    // Verify ownership
    const inboxItem = await prisma.inboxItem.findUnique({
      where: { id: inboxItemId },
    })

    if (!inboxItem || inboxItem.userId !== user.id) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    // If already analyzed, return existing data
    const existingAnalysis = await prisma.analysisResult.findUnique({
      where: { inboxItemId },
    })

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

    // ── Gemini API call ──────────────────────────────────────────────────────

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      console.error('[ORCHESTRATOR] GEMINI_API_KEY not set — falling back to mock')
      return runMockOrchestrator(inboxItemId, user.id, startTime)
    }

    let geminiOutput: GeminiOutput

    try {
      const genAI = new GoogleGenerativeAI(apiKey)
      const model = genAI.getGenerativeModel({
        model: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.7,
          maxOutputTokens: 4096,
        } as Parameters<typeof genAI.getGenerativeModel>[0]['generationConfig'],
      })

      const prompt = buildPrompt({
        rawContent: inboxItem.rawContent,
        sourceTitle: inboxItem.sourceTitle,
        sourceUrl: inboxItem.sourceUrl,
        tags: inboxItem.tags,
      })

      const result = await model.generateContent(prompt)
      const rawText = result.response.text()

      console.log('[ORCHESTRATOR] Gemini raw response length:', rawText.length)
      geminiOutput = JSON.parse(rawText) as GeminiOutput
    } catch (geminiError) {
      console.error('[ORCHESTRATOR] Gemini error, falling back to mock:', geminiError)
      return runMockOrchestrator(inboxItemId, user.id, startTime)
    }

    // ── Persist results ──────────────────────────────────────────────────────

    const analysisResult = existingAnalysis
      ? existingAnalysis
      : await prisma.analysisResult.create({
          data: {
            inboxItemId,
            summary: geminiOutput.analysis,
            keyInsights: geminiOutput.tasks
              .filter((t) => t.priority === 'Must')
              .map((t) => t.title)
              .slice(0, 5),
            suggestedTags: inboxItem.tags,
            category: 'ai-generated',
            sentiment: 'positive',
            relevanceScore: 0.9,
            rawAiResponse: JSON.stringify(geminiOutput),
            modelUsed: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
            processingTimeMs: Date.now() - startTime,
          },
        })

    const agileTasks = await Promise.all(
      geminiOutput.tasks.map((task) =>
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
            assigneeId: user.id,
          },
        })
      )
    )

    const roadmapTimeline = await prisma.roadmapTimeline.create({
      data: {
        title: `${getCurrentQuarter().toUpperCase()} ${new Date().getFullYear()} · ${
          inboxItem.sourceTitle?.slice(0, 40) ?? 'Nuevo Roadmap'
        }`,
        description: geminiOutput.analysis.slice(0, 300) + '…',
        phase: getCurrentQuarter(),
        year: new Date().getFullYear(),
        status: 'planned',
        startDate: geminiOutput.milestones[0]?.date
          ? new Date(geminiOutput.milestones[0].date)
          : new Date(),
        endDate: geminiOutput.milestones[geminiOutput.milestones.length - 1]?.date
          ? new Date(
              geminiOutput.milestones[geminiOutput.milestones.length - 1].date
            )
          : new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000),
        milestones: geminiOutput.milestones.map((m) => ({
          name: m.title,
          date: m.date,
          description: m.description,
        })),
        ownerId: user.id,
        color: '#6366f1',
      },
    })

    await prisma.inboxItem.update({
      where: { id: inboxItemId },
      data: { status: 'analyzed' },
    })

    return NextResponse.json({
      success: true,
      cached: false,
      processingTimeMs: Date.now() - startTime,
      analysisResult,
      agileTasks,
      roadmapTimeline,
    })
  } catch (error) {
    console.error('[ORCHESTRATOR]', error)
    return NextResponse.json({ error: 'Orchestration failed' }, { status: 500 })
  }
}

// ─── Mock fallback (no API key / Gemini error) ─────────────────────────────────

async function runMockOrchestrator(inboxItemId: string, userId: string, startTime: number) {
  const existingAnalysis = await prisma.analysisResult.findUnique({ where: { inboxItemId } })

  const analysisResult = existingAnalysis ?? (await prisma.analysisResult.create({
    data: {
      inboxItemId,
      summary:
        'Alta viabilidad detectada (modo demo — configura GEMINI_API_KEY para análisis real). El concepto muestra diferenciadores claros en el mercado objetivo.',
      keyInsights: [
        'Mercado en crecimiento sostenido del 22% anual',
        'Competencia fragmentada con baja retención',
        'Ventana de entrada favorable en los próximos 6 meses',
      ],
      suggestedTags: ['validation-required', 'demo-mode'],
      category: 'technology',
      sentiment: 'positive',
      relevanceScore: 0.75,
      rawAiResponse: JSON.stringify({ mock: true }),
      modelUsed: 'mock-fallback',
      processingTimeMs: Date.now() - startTime,
    },
  }))

  const agileTasks = await Promise.all([
    prisma.agileTask.create({
      data: {
        title: '[Demo] Validar propuesta de valor con 5 usuarios target',
        description: 'Entrevistar usuarios potenciales para confirmar el problema.',
        status: 'todo', priority: 'critical', type: 'research', storyPoints: 3,
        labels: ['lean-strategist'], assigneeId: userId,
      },
    }),
    prisma.agileTask.create({
      data: {
        title: '[Demo] Construir landing page de captura',
        description: 'Landing para medir interés antes de construir el producto.',
        status: 'todo', priority: 'high', type: 'feature', storyPoints: 5,
        labels: ['growth-hacker'], assigneeId: userId,
      },
    }),
  ])

  const roadmapTimeline = await prisma.roadmapTimeline.create({
    data: {
      title: `${getCurrentQuarter().toUpperCase()} ${new Date().getFullYear()} · Demo Roadmap`,
      description: 'Roadmap generado en modo demo. Configura GEMINI_API_KEY para análisis real.',
      phase: getCurrentQuarter(),
      year: new Date().getFullYear(),
      status: 'planned',
      milestones: [
        { name: 'Entrevistas completadas', date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) },
        { name: 'MVP Beta', date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) },
      ],
      ownerId: userId,
      color: '#94a3b8',
    },
  })

  await prisma.inboxItem.update({ where: { id: inboxItemId }, data: { status: 'analyzed' } })

  return NextResponse.json({
    success: true,
    cached: false,
    demo: true,
    processingTimeMs: Date.now() - startTime,
    analysisResult,
    agileTasks,
    roadmapTimeline,
  })
}
