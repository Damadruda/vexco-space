import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth-options';
import { createS3Client, getBucketConfig } from '@/lib/aws-config';
import {
  PROJECT_FILE_MAX_SIZE,
  isAllowedFileType,
} from '@/lib/constants/upload';

export const dynamic = 'force-dynamic';

function expectedKeyPrefix(projectId: string): string {
  const { folderPrefix } = getBucketConfig();
  const normalizedPrefix = folderPrefix.endsWith('/') || folderPrefix === ''
    ? folderPrefix
    : `${folderPrefix}/`;
  return `${normalizedPrefix}project-files/${projectId}/`;
}

async function requireProject(projectId: string, email: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (!user) return { error: 'User not found', status: 404 as const };
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: user.id },
    select: { id: true },
  });
  if (!project) return { error: 'Project not found', status: 404 as const };
  return { project };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await requireProject(params.id, session.user.email);
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const files = await prisma.projectFile.findMany({
      where: { projectId: result.project.id },
      orderBy: { uploadedAt: 'desc' },
    });

    const { bucketName } = getBucketConfig();
    const s3 = createS3Client();

    const withDownloadUrls = await Promise.all(
      files.map(async (file) => {
        const command = new GetObjectCommand({
          Bucket: bucketName,
          Key: file.fileKey,
          ResponseContentDisposition: `attachment; filename="${file.fileName.replace(/"/g, '')}"`,
        });
        const downloadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
        return {
          id: file.id,
          fileName: file.fileName,
          fileSize: file.fileSize,
          mimeType: file.mimeType,
          uploadedAt: file.uploadedAt.toISOString(),
          downloadUrl,
        };
      })
    );

    return NextResponse.json({ files: withDownloadUrls });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.error('[PROJECT FILES GET] Error:', message, stack);
    return NextResponse.json(
      { error: message, stack },
      { status: 500 }
    );
  }
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

    const result = await requireProject(params.id, session.user.email);
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { fileKey, fileName, fileSize, mimeType } = body as {
      fileKey?: string;
      fileName?: string;
      fileSize?: number;
      mimeType?: string;
    };

    if (typeof fileKey !== 'string' || !fileKey) {
      return NextResponse.json({ error: 'fileKey is required' }, { status: 400 });
    }
    if (typeof fileName !== 'string' || !fileName) {
      return NextResponse.json({ error: 'fileName is required' }, { status: 400 });
    }
    if (typeof fileSize !== 'number' || fileSize <= 0 || fileSize > PROJECT_FILE_MAX_SIZE) {
      return NextResponse.json({ error: 'Invalid fileSize' }, { status: 400 });
    }
    if (typeof mimeType !== 'string' || !isAllowedFileType(mimeType, fileName)) {
      return NextResponse.json({ error: 'File type not allowed' }, { status: 400 });
    }

    const prefix = expectedKeyPrefix(result.project.id);
    if (!fileKey.startsWith(prefix)) {
      return NextResponse.json(
        { error: 'fileKey does not belong to this project' },
        { status: 400 }
      );
    }

    const { bucketName } = getBucketConfig();
    const s3 = createS3Client();

    try {
      await s3.send(new HeadObjectCommand({ Bucket: bucketName, Key: fileKey }));
    } catch (err) {
      console.warn('[PROJECT FILES POST] HEAD failed for', fileKey, err);
      return NextResponse.json(
        { error: 'upload not completed' },
        { status: 400 }
      );
    }

    const file = await prisma.projectFile.create({
      data: {
        projectId: result.project.id,
        fileKey,
        fileName,
        fileSize,
        mimeType,
      },
    });

    return NextResponse.json({ file }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.error('[PROJECT FILES POST] Error:', message, stack);
    return NextResponse.json(
      { error: message, stack },
      { status: 500 }
    );
  }
}
