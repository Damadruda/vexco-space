/**
 * =============================================================================
 * PROJECTS API - LIST AND CREATE
 * =============================================================================
 * QA AUDIT NOTES:
 * - GET: Returns all projects for authenticated user with status fields
 * - POST: Creates new project with initial status values
 * =============================================================================
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth-options';

// =============================================================================
// GET: List all projects for user
// =============================================================================
export async function GET() {
  console.log('[PROJECTS API] GET request');
  
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const projects = await prisma.project.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        startDate: true,
        endDate: true,
        conceptStatus: true,
        marketStatus: true,
        businessStatus: true,
        executionStatus: true,
        createdAt: true,
        updatedAt: true
      }
    });

    console.log(`[PROJECTS API] Found ${projects.length} projects`);
    return NextResponse.json({ projects });

  } catch (error) {
    console.error('[PROJECTS API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// =============================================================================
// POST: Create new project
// =============================================================================
export async function POST(request: NextRequest) {
  console.log('[PROJECTS API] POST request');
  
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { title, description, startDate, endDate } = body;

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const project = await prisma.project.create({
      data: {
        title,
        description,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        userId: user.id,
        // Initialize all statuses as RED
        conceptStatus: 'RED',
        marketStatus: 'RED',
        businessStatus: 'RED',
        executionStatus: 'RED'
      }
    });

    console.log(`[PROJECTS API] Created project: ${project.id}`);
    return NextResponse.json({ project }, { status: 201 });

  } catch (error) {
    console.error('[PROJECTS API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
