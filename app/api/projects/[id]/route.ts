/**
 * =============================================================================
 * PROJECT DETAIL API - GET, PUT, DELETE
 * =============================================================================
 * QA AUDIT NOTES:
 * - GET: Returns single project with all fields
 * - PUT: Updates project fields including status
 * - DELETE: Removes project and cascades to insights
 * =============================================================================
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth-options';

// =============================================================================
// GET: Get single project
// =============================================================================
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  console.log(`[PROJECT API] GET project: ${params.id}`);
  
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

    const project = await prisma.project.findFirst({
      where: {
        id: params.id,
        userId: user.id
      },
      include: {
        conceptInsights: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    return NextResponse.json({ project });

  } catch (error) {
    console.error('[PROJECT API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// =============================================================================
// PUT: Update project
// =============================================================================
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  console.log(`[PROJECT API] PUT project: ${params.id}`);
  
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Verify ownership
    const existing = await prisma.project.findFirst({
      where: { id: params.id, userId: user.id }
    });

    if (!existing) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Prepare update data
    const updateData: any = {};
    if (body.title !== undefined) updateData.title = body.title;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.startDate !== undefined) updateData.startDate = body.startDate ? new Date(body.startDate) : null;
    if (body.endDate !== undefined) updateData.endDate = body.endDate ? new Date(body.endDate) : null;
    if (body.conceptStatus !== undefined) updateData.conceptStatus = body.conceptStatus;
    if (body.marketStatus !== undefined) updateData.marketStatus = body.marketStatus;
    if (body.businessStatus !== undefined) updateData.businessStatus = body.businessStatus;
    if (body.executionStatus !== undefined) updateData.executionStatus = body.executionStatus;

    const project = await prisma.project.update({
      where: { id: params.id },
      data: updateData
    });

    return NextResponse.json({ project });

  } catch (error) {
    console.error('[PROJECT API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// =============================================================================
// DELETE: Delete project
// =============================================================================
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  console.log(`[PROJECT API] DELETE project: ${params.id}`);
  
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

    // Verify ownership
    const existing = await prisma.project.findFirst({
      where: { id: params.id, userId: user.id }
    });

    if (!existing) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    await prisma.project.delete({
      where: { id: params.id }
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('[PROJECT API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
