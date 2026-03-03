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
    const status = searchParams.get('status')
    const sprint = searchParams.get('sprint')

    const tasks = await prisma.agileTask.findMany({
      where: {
        assigneeId: user.id,
        ...(status && { status }),
        ...(sprint && { sprint: parseInt(sprint) }),
      },
      orderBy: [{ sprint: 'asc' }, { createdAt: 'desc' }],
    })

    return NextResponse.json({ tasks })
  } catch (error) {
    console.error('[AGILE GET]', error)
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
    const { title, description, priority, type, storyPoints, sprint, labels } = body

    if (!title) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 })
    }

    const task = await prisma.agileTask.create({
      data: {
        title,
        description,
        priority: priority ?? 'medium',
        type: type ?? 'task',
        storyPoints,
        sprint,
        labels: labels ?? [],
        assigneeId: user.id,
        status: 'backlog',
      },
    })

    return NextResponse.json(task, { status: 201 })
  } catch (error) {
    console.error('[AGILE POST]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
