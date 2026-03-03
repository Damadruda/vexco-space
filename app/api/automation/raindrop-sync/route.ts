import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { fetchAllRaindropBookmarks } from '@/lib/clients/raindrop'
import { extractContentWithJina } from '@/lib/clients/jina'

// ─── Types ────────────────────────────────────────────────────────────────────

type TriageRoute = 'A' | 'B' | 'C' | 'D'

interface TriageResult {
  route: TriageRoute
  title: string
  summary: string
  suggestedTags: string[]
}

interface BookmarkResult {
  url: string
  title: string
  route: TriageRoute
  persisted: boolean
  error?: string
}

// ─── Gemini Triage ────────────────────────────────────────────────────────────

function buildTriagePrompt(title: string, content: string, url: string): string {
  return `You are a "Strategic Content Classifier" for an entrepreneur's intelligence system.

CONTENT TO CLASSIFY:
Title: ${title}
URL: ${url}
Content (first 3000 chars):
${content.slice(0, 3000)}

YOUR TASK:
Classify this content into exactly ONE route:
- A: Proyecto/Idea — Content describing a specific business opportunity, product idea, or actionable concept to build
- B: Tendencia Conocida — Industry trend, market movement, or relevant technology update worth tracking
- C: Descubrimiento — Surprising insight, contrarian finding, or niche knowledge not widely known
- D: Ruido — Generic news, social media noise, low-signal content, or irrelevant material

REQUIRED OUTPUT (strict JSON — no markdown, no explanation):
{
  "route": "A",
  "title": "Concise title extracted from content (max 80 chars)",
  "summary": "Two-sentence summary capturing the core insight and why it matters",
  "suggestedTags": ["tag1", "tag2", "tag3"]
}

RULES:
- suggestedTags only needed for routes B and C (max 4 tags, lowercase, kebab-case)
- For route A and D, suggestedTags can be []
- Be precise: prefer D over A/B/C when in doubt
- Respond ONLY with the JSON object`
}

async function runGeminiTriage(
  title: string,
  content: string,
  url: string
): Promise<TriageResult> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    // Fallback: classify as B if no API key
    return {
      route: 'B',
      title: title.slice(0, 80),
      summary: 'Clasificación automática desactivada — configura GEMINI_API_KEY.',
      suggestedTags: ['no-triage'],
    }
  }

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.3,
      maxOutputTokens: 512,
    } as Parameters<typeof genAI.getGenerativeModel>[0]['generationConfig'],
  })

  const result = await model.generateContent(buildTriagePrompt(title, content, url))
  const raw = result.response.text()
  const parsed = JSON.parse(raw) as TriageResult

  // Sanitise route
  if (!['A', 'B', 'C', 'D'].includes(parsed.route)) {
    parsed.route = 'D'
  }

  return parsed
}

// ─── Persistencia Dinámica ────────────────────────────────────────────────────

async function persistTriage(
  triage: TriageResult,
  bookmark: { link: string; tags: string[] },
  userId: string
): Promise<void> {
  const { route, title, summary, suggestedTags } = triage

  if (route === 'A') {
    // Ruta A → InboxItem con status 'raw'
    await prisma.inboxItem.create({
      data: {
        type: 'link',
        rawContent: summary,
        sourceUrl: bookmark.link,
        sourceTitle: title,
        status: 'pending',
        tags: bookmark.tags,
        userId,
      },
    })
  } else if (route === 'B') {
    // Ruta B → KnowledgeBase 'active' (Tendencia Conocida)
    await prisma.knowledgeBase.create({
      data: {
        title,
        content: summary,
        contentType: 'markdown',
        status: 'active',
        route: 'B',
        summary,
        tags: suggestedTags,
        sourceUrl: bookmark.link,
        authorId: userId,
      },
    })
  } else if (route === 'C') {
    // Ruta C → KnowledgeBase 'pending_review' (Cuarentena)
    await prisma.knowledgeBase.create({
      data: {
        title,
        content: summary,
        contentType: 'markdown',
        status: 'pending_review',
        route: 'C',
        summary,
        tags: suggestedTags,
        sourceUrl: bookmark.link,
        authorId: userId,
      },
    })
  }
  // Route D → ignorar, no persiste nada
}

// ─── Endpoint ─────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { userPreferences: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const raindropToken = user.userPreferences?.raindropToken
    if (!raindropToken) {
      return NextResponse.json(
        { error: 'Raindrop token not configured. Go to Settings.' },
        { status: 400 }
      )
    }

    const jinaApiKey = user.userPreferences?.jinaApiKey ?? undefined
    const lastSync = user.userPreferences?.raindropLastSync ?? undefined

    // Log start
    const log = await prisma.automationLog.create({
      data: {
        jobName: 'raindrop_sync_v2',
        status: 'started',
        triggeredBy: 'manual',
        userId: user.id,
      },
    })

    const startTime = Date.now()

    try {
      // ── Paso A: Fetch Raindrop ────────────────────────────────────────────
      console.log('[SYNC] Fetching Raindrop bookmarks...')
      const bookmarks = await fetchAllRaindropBookmarks(raindropToken, {
        lastSyncAt: lastSync,
      })
      console.log(`[SYNC] Fetched ${bookmarks.length} bookmarks`)

      const results: BookmarkResult[] = []
      const routeCounts = { A: 0, B: 0, C: 0, D: 0 }

      // Process bookmarks with concurrency control (max 3 parallel)
      const CONCURRENCY = 3
      for (let i = 0; i < bookmarks.length; i += CONCURRENCY) {
        const batch = bookmarks.slice(i, i + CONCURRENCY)

        await Promise.all(
          batch.map(async (bookmark) => {
            const bookmarkResult: BookmarkResult = {
              url: bookmark.link,
              title: bookmark.title,
              route: 'D',
              persisted: false,
            }

            try {
              // ── Paso B: Expansión con Jina ──────────────────────────────
              let extractedContent = bookmark.excerpt || bookmark.title
              let extractedTitle = bookmark.title

              try {
                const jinaData = await extractContentWithJina(bookmark.link, jinaApiKey)
                extractedContent = jinaData.content || jinaData.description || extractedContent
                extractedTitle = jinaData.title || extractedTitle
              } catch (jinaErr) {
                console.warn(`[SYNC] Jina failed for ${bookmark.link}:`, jinaErr)
                // Continue with Raindrop excerpt as fallback
              }

              // ── Paso C: AI Triage con Gemini ───────────────────────────
              const triage = await runGeminiTriage(
                extractedTitle,
                extractedContent,
                bookmark.link
              )

              bookmarkResult.route = triage.route
              bookmarkResult.title = triage.title

              // ── Persistencia Dinámica ───────────────────────────────────
              await persistTriage(triage, bookmark, user.id)

              bookmarkResult.persisted = triage.route !== 'D'
              routeCounts[triage.route]++
            } catch (err) {
              bookmarkResult.error = err instanceof Error ? err.message : 'Unknown error'
              console.error(`[SYNC] Error processing ${bookmark.link}:`, err)
            }

            results.push(bookmarkResult)
          })
        )

        // Rate limit between batches
        if (i + CONCURRENCY < bookmarks.length) {
          await new Promise((resolve) => setTimeout(resolve, 300))
        }
      }

      // Update last sync timestamp
      await prisma.userPreferences.update({
        where: { userId: user.id },
        data: { raindropLastSync: new Date() },
      })

      const failed = results.filter((r) => r.error).length
      const persisted = results.filter((r) => r.persisted).length

      // Update log
      await prisma.automationLog.update({
        where: { id: log.id },
        data: {
          status: failed > 0 ? 'partial' : 'success',
          itemsProcessed: persisted,
          itemsFailed: failed,
          durationMs: Date.now() - startTime,
          completedAt: new Date(),
          metadata: { routeCounts, total: bookmarks.length },
        },
      })

      return NextResponse.json({
        success: true,
        total: bookmarks.length,
        persisted,
        failed,
        routes: routeCounts,
        durationMs: Date.now() - startTime,
        message: `Procesados ${bookmarks.length} bookmarks — A:${routeCounts.A} | B:${routeCounts.B} | C:${routeCounts.C} | D:${routeCounts.D} descartados`,
      })
    } catch (syncError) {
      await prisma.automationLog.update({
        where: { id: log.id },
        data: {
          status: 'failed',
          errorMessage: syncError instanceof Error ? syncError.message : 'Unknown error',
          durationMs: Date.now() - startTime,
          completedAt: new Date(),
        },
      })
      throw syncError
    }
  } catch (error) {
    console.error('[RAINDROP SYNC V2]', error)
    return NextResponse.json({ error: 'Sync pipeline failed' }, { status: 500 })
  }
}
