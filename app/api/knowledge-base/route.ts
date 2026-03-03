import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// ─── GET /api/knowledge-base ──────────────────────────────────────────────────
// Query params: ?status=pending_review|active|archived&route=B|C

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') ?? undefined
    const route = searchParams.get('route') ?? undefined

    const items = await prisma.knowledgeBase.findMany({
      where: {
        authorId: user.id,
        ...(status && { status }),
        ...(route && { route }),
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ items, total: items.length })
  } catch (error) {
    console.error('[KB GET]', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
