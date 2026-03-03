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
    const year = searchParams.get('year')

    const timelines = await prisma.roadmapTimeline.findMany({
      where: {
        ownerId: user.id,
        ...(year && { year: parseInt(year) }),
      },
      orderBy: [{ year: 'asc' }, { phase: 'asc' }],
    })

    return NextResponse.json({ timelines })
  } catch (error) {
    console.error('[ROADMAP GET]', error)
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
    const { title, description, phase, year, startDate, endDate, milestones, color } = body

    if (!title || !phase || !year) {
      return NextResponse.json({ error: 'title, phase and year are required' }, { status: 400 })
    }

    const timeline = await prisma.roadmapTimeline.create({
      data: {
        title,
        description,
        phase,
        year,
        status: 'planned',
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        milestones: milestones ?? [],
        ownerId: user.id,
        color: color ?? null,
      },
    })

    return NextResponse.json(timeline, { status: 201 })
  } catch (error) {
    console.error('[ROADMAP POST]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
