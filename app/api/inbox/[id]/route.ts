import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

async function getAuthorizedItem(id: string, userEmail: string) {
  const user = await prisma.user.findUnique({ where: { email: userEmail } })
  if (!user) return { user: null, item: null }

  const item = await prisma.inboxItem.findUnique({ where: { id } })
  if (!item || item.userId !== user.id) return { user, item: null }

  return { user, item }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { item } = await getAuthorizedItem(params.id, session.user.email)
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const full = await prisma.inboxItem.findUnique({
      where: { id: params.id },
      include: { analysisResult: true },
    })

    return NextResponse.json(full)
  } catch (error) {
    console.error('[INBOX GET id]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { item } = await getAuthorizedItem(params.id, session.user.email)
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const body = await request.json()
    const { status, priority, tags, sourceTitle, rawContent } = body

    const updated = await prisma.inboxItem.update({
      where: { id: params.id },
      data: {
        ...(status !== undefined && { status }),
        ...(priority !== undefined && { priority }),
        ...(tags !== undefined && { tags }),
        ...(sourceTitle !== undefined && { sourceTitle }),
        ...(rawContent !== undefined && { rawContent }),
      },
      include: { analysisResult: true },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('[INBOX PATCH]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { item } = await getAuthorizedItem(params.id, session.user.email)
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { searchParams } = new URL(request.url)
    const archive = searchParams.get('archive') === 'true'

    if (archive) {
      await prisma.inboxItem.update({
        where: { id: params.id },
        data: { status: 'archived' },
      })
      return NextResponse.json({ success: true, archived: true })
    }

    await prisma.inboxItem.delete({ where: { id: params.id } })
    return NextResponse.json({ success: true, deleted: true })
  } catch (error) {
    console.error('[INBOX DELETE]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
