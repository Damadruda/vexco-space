import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getAuthorizedItem(id: string, userEmail: string) {
  const user = await prisma.user.findUnique({ where: { email: userEmail } })
  if (!user) return null

  const item = await prisma.knowledgeBase.findUnique({ where: { id } })
  if (!item || item.authorId !== user.id) return null

  return { item, user }
}

// ─── GET /api/knowledge-base/[id] ────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const result = await getAuthorizedItem(params.id, session.user.email)
    if (!result) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json({ item: result.item })
  } catch (error) {
    console.error('[KB GET]', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// ─── PATCH /api/knowledge-base/[id] ──────────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const result = await getAuthorizedItem(params.id, session.user.email)
    if (!result) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const body = await request.json()
    const { status, title, tags, category, isPublic } = body

    const updated = await prisma.knowledgeBase.update({
      where: { id: params.id },
      data: {
        ...(status !== undefined && { status }),
        ...(title !== undefined && { title }),
        ...(tags !== undefined && { tags }),
        ...(category !== undefined && { category }),
        ...(isPublic !== undefined && { isPublic }),
      },
    })

    return NextResponse.json({ item: updated })
  } catch (error) {
    console.error('[KB PATCH]', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// ─── DELETE /api/knowledge-base/[id] ─────────────────────────────────────────

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const result = await getAuthorizedItem(params.id, session.user.email)
    if (!result) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    await prisma.knowledgeBase.delete({ where: { id: params.id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[KB DELETE]', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
