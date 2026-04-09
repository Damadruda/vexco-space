import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const { id } = await params;
    const framework = await prisma.framework.findUnique({
      where: { id },
      include: {
        sourceDocuments: { include: { document: { select: { id: true, driveFileName: true, driveFileUrl: true } } } },
        appliedInProjects: { include: { project: { select: { id: true, title: true } } } },
        derivedFrom: { select: { id: true, name: true, slug: true } },
        derivatives: { select: { id: true, name: true, slug: true } },
      },
    });

    if (!framework) return NextResponse.json({ error: "Framework no encontrado" }, { status: 404 });

    return NextResponse.json(framework);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
