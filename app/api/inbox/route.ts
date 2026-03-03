import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || 'pending'
    const limit = parseInt(searchParams.get('limit') || '20')
    const cursor = searchParams.get('cursor')

    const items = await prisma.inboxItem.findMany({
      where: { userId: user.id, status },
      include: { analysisResult: true },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    })

    const hasMore = items.length > limit
    const data = hasMore ? items.slice(0, -1) : items
    const nextCursor = hasMore ? data[data.length - 1].id : null

    return NextResponse.json({ items: data, nextCursor, hasMore })
  } catch (error) {
    console.error('[INBOX GET]', error)
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
    const { type, rawContent, sourceUrl, sourceTitle, tags = [], priority = 0 } = body

    if (!type || !rawContent) {
      return NextResponse.json(
        { error: 'Missing required fields: type, rawContent' },
        { status: 400 }
      )
    }

    const item = await prisma.inboxItem.create({
      data: {
        type,
        rawContent,
        sourceUrl,
        sourceTitle,
        tags,
        priority,
        userId: user.id,
        status: 'pending',
      },
    })

    return NextResponse.json(item, { status: 201 })
  } catch (error) {
    console.error('[INBOX POST]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
