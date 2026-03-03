import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET() {
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

    const prefs = user.userPreferences

    return NextResponse.json({
      hasRaindropToken: !!prefs?.raindropToken,
      hasJinaApiKey: !!prefs?.jinaApiKey,
      raindropLastSync: prefs?.raindropLastSync ?? null,
      defaultInboxView: prefs?.defaultInboxView ?? 'list',
      aiAnalysisEnabled: prefs?.aiAnalysisEnabled ?? true,
      autoTagging: prefs?.autoTagging ?? true,
      timezone: prefs?.timezone ?? 'America/Mexico_City',
    })
  } catch (error) {
    console.error('[SETTINGS GET]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

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
    const {
      raindropToken,
      jinaApiKey,
      defaultInboxView,
      aiAnalysisEnabled,
      autoTagging,
      timezone,
    } = body

    // Only update fields that were explicitly sent (don't overwrite masked values)
    const updateData: Record<string, unknown> = {}
    if (raindropToken !== undefined) updateData.raindropToken = raindropToken || null
    if (jinaApiKey !== undefined) updateData.jinaApiKey = jinaApiKey || null
    if (defaultInboxView !== undefined) updateData.defaultInboxView = defaultInboxView
    if (aiAnalysisEnabled !== undefined) updateData.aiAnalysisEnabled = aiAnalysisEnabled
    if (autoTagging !== undefined) updateData.autoTagging = autoTagging
    if (timezone !== undefined) updateData.timezone = timezone

    await prisma.userPreferences.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...updateData },
      update: updateData,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[SETTINGS POST]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
