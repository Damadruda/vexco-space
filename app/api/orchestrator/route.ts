import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// ─── Mock Orchestrator ────────────────────────────────────────────────────────
// Sprint 3: Generates mock analysis data for UI testing.
// Sprint 4 will replace this with real Gemini SDK calls.

export async function POST(request: NextRequest) {
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

    // Check if already analyzed
    const existing = await prisma.analysisResult.findUnique({
      where: { inboxItemId },
    })

    const startTime = Date.now()

    // ── 1. Mock AnalysisResult ──────────────────────────────────────────────
    const analysisResult = existing
      ? existing
      : await prisma.analysisResult.create({
          data: {
            inboxItemId,
            summary:
              'Alta viabilidad detectada. El concepto muestra diferenciadores claros en el mercado objetivo. Se recomienda avanzar a fase de validación con usuarios reales antes de construir el MVP.',
            keyInsights: [
              'Mercado objetivo en crecimiento sostenido del 22% anual',
              'Competencia fragmentada con baja retención de usuarios',
              'Oportunidad de posicionamiento como solución integrada',
              'Ventana de entrada favorable en los próximos 6 meses',
            ],
            suggestedTags: ['b2b', 'saas', 'automation', 'validation-required'],
            category: 'technology',
            sentiment: 'positive',
            relevanceScore: 0.87,
            rawAiResponse: JSON.stringify({ mock: true, agents: 8, confidence: 0.87 }),
            modelUsed: 'mock-orchestrator-v1',
            processingTimeMs: Date.now() - startTime,
          },
        })

    // ── 2. Mock AgileTask x3 ────────────────────────────────────────────────
    const agileTasks = await Promise.all([
      prisma.agileTask.create({
        data: {
          title: 'Validar propuesta de valor con 5 usuarios target',
          description:
            'Entrevistar a 5 usuarios potenciales para confirmar el problema y la solución propuesta. Documentar pain points y willingness to pay.',
          status: 'todo',
          priority: 'critical',
          type: 'research',
          storyPoints: 3,
          labels: ['lean-strategist', 'validation'],
          assigneeId: user.id,
        },
      }),
      prisma.agileTask.create({
        data: {
          title: 'Construir landing page de captura de interés',
          description:
            'Crear una landing page para medir el interés real del mercado objetivo antes de construir el producto completo.',
          status: 'todo',
          priority: 'high',
          type: 'feature',
          storyPoints: 5,
          labels: ['growth-hacker', 'mvp'],
          assigneeId: user.id,
        },
      }),
      prisma.agileTask.create({
        data: {
          title: 'Análisis competitivo del ecosistema',
          description:
            'Mapear los 10 competidores directos e indirectos. Identificar diferenciadores clave y posibles moats del producto.',
          status: 'backlog',
          priority: 'medium',
          type: 'research',
          storyPoints: 2,
          labels: ['market-analyst', 'research'],
          assigneeId: user.id,
        },
      }),
    ])

    // ── 3. Mock RoadmapTimeline ─────────────────────────────────────────────
    const roadmapTimeline = await prisma.roadmapTimeline.create({
      data: {
        title: 'Q2 2026 · Validación y MVP',
        description:
          'Fase de validación de hipótesis de mercado y construcción del Minimum Viable Product.',
        phase: 'q2',
        year: 2026,
        status: 'planned',
        startDate: new Date('2026-04-01'),
        endDate: new Date('2026-06-30'),
        milestones: [
          { name: 'Entrevistas de usuario completadas', date: '2026-04-30' },
          { name: 'Landing page live + métricas', date: '2026-05-15' },
          { name: 'MVP Beta con 10 early adopters', date: '2026-06-30' },
        ],
        ownerId: user.id,
        color: '#6366f1',
      },
    })

    // ── 4. Update InboxItem status → "analyzed" ─────────────────────────────
    await prisma.inboxItem.update({
      where: { id: inboxItemId },
      data: { status: 'analyzed' },
    })

    return NextResponse.json({
      success: true,
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
