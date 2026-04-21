import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth-options';
import { createS3Client, getBucketConfig } from '@/lib/aws-config';
import {
  PROJECT_FILE_MAX_SIZE,
  isAllowedFileType,
  sanitizeFileName,
} from '@/lib/constants/upload';

export const dynamic = 'force-dynamic';

function buildProjectFileKey(projectId: string, safeName: string): string {
  const { folderPrefix } = getBucketConfig();
  const normalizedPrefix = folderPrefix.endsWith('/') || folderPrefix === ''
    ? folderPrefix
    : `${folderPrefix}/`;
  const uuid = crypto.randomUUID();
  return `${normalizedPrefix}project-files/${projectId}/${uuid}-${safeName}`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
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

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { fileName, fileSize, mimeType } = body as {
      fileName?: string;
      fileSize?: number;
      mimeType?: string;
    };

    if (typeof fileName !== 'string' || fileName.trim().length === 0) {
      return NextResponse.json({ error: 'fileName is required' }, { status: 400 });
    }
    if (typeof fileSize !== 'number' || !Number.isFinite(fileSize)) {
      return NextResponse.json({ error: 'fileSize is required' }, { status: 400 });
    }
    if (fileSize <= 0 || fileSize > PROJECT_FILE_MAX_SIZE) {
      return NextResponse.json(
        { error: `File size must be between 1 byte and ${PROJECT_FILE_MAX_SIZE} bytes` },
        { status: 400 }
      );
    }
    if (typeof mimeType !== 'string' || !isAllowedFileType(mimeType, fileName)) {
      return NextResponse.json(
        { error: 'File type not allowed' },
        { status: 400 }
      );
    }

    const safeName = sanitizeFileName(fileName);
    if (safeName.length === 0) {
      return NextResponse.json({ error: 'Invalid fileName' }, { status: 400 });
    }

    const fileKey = buildProjectFileKey(project.id, safeName);
    const { bucketName } = getBucketConfig();
    const s3 = createS3Client();

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: fileKey,
      ContentType: mimeType,
      ContentLength: fileSize,
    });

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

    return NextResponse.json({
      uploadUrl,
      fileKey,
      expiresIn: 300,
    });
  } catch (error) {
    console.error('[PROJECT FILES PRESIGNED] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
