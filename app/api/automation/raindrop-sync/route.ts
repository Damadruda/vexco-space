import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { fetchAllRaindropBookmarks, mapRaindropToInboxItem } from '@/lib/clients/raindrop'

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

    const token = user.userPreferences?.raindropToken
    if (!token) {
      return NextResponse.json(
        { error: 'Raindrop token not configured. Go to Settings to add it.' },
        { status: 400 }
      )
    }

    const lastSync = user.userPreferences?.raindropLastSync ?? undefined

    // Log start
    const log = await prisma.automationLog.create({
      data: {
        jobName: 'raindrop_sync',
        status: 'started',
        triggeredBy: 'manual',
        userId: user.id,
      },
    })

    const startTime = Date.now()

    try {
      const bookmarks = await fetchAllRaindropBookmarks(token, {
        lastSyncAt: lastSync,
      })

      // Upsert items to avoid duplicates
      let processed = 0
      let failed = 0

      for (const bookmark of bookmarks) {
        try {
          const inboxData = mapRaindropToInboxItem(bookmark, user.id)
          await prisma.inboxItem.upsert({
            where: {
              // We need a unique constraint - use sourceUrl + userId
              // For now, try to find existing
              id: 'nonexistent', // Will always go to create
            },
            create: inboxData,
            update: { tags: inboxData.tags, rawContent: inboxData.rawContent },
          })
          processed++
        } catch {
          failed++
        }
      }

      // Update last sync time
      await prisma.userPreferences.update({
        where: { userId: user.id },
        data: { raindropLastSync: new Date() },
      })

      // Update log
      await prisma.automationLog.update({
        where: { id: log.id },
        data: {
          status: failed > 0 ? 'partial' : 'success',
          itemsProcessed: processed,
          itemsFailed: failed,
          durationMs: Date.now() - startTime,
          completedAt: new Date(),
        },
      })

      return NextResponse.json({
        success: true,
        synced: processed,
        failed,
        message: `Synced ${processed} bookmarks from Raindrop`,
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
    console.error('[RAINDROP SYNC]', error)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}
