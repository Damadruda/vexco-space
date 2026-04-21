import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth-options';
import { createS3Client, getBucketConfig } from '@/lib/aws-config';

export const dynamic = 'force-dynamic';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string; fileId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const project = await prisma.project.findFirst({
      where: { id: params.id, userId: user.id },
      select: { id: true },
    });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const projectFile = await prisma.projectFile.findUnique({
      where: { id: params.fileId },
    });
    if (!projectFile || projectFile.projectId !== project.id) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const { bucketName } = getBucketConfig();
    const s3 = createS3Client();

    try {
      await s3.send(
        new DeleteObjectCommand({ Bucket: bucketName, Key: projectFile.fileKey })
      );
    } catch (error) {
      console.warn(
        `[PROJECT FILES DELETE] S3 delete failed for key ${projectFile.fileKey}:`,
        error
      );
    }

    await prisma.projectFile.delete({ where: { id: projectFile.id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[PROJECT FILES DELETE] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
