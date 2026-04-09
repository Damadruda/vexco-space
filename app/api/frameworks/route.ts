import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const params = request.nextUrl.searchParams;
    const lifecycleStage = params.get("lifecycleStage") || undefined;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};
    if (lifecycleStage) where.lifecycleStage = lifecycleStage;

    const frameworks = await prisma.framework.findMany({
      where,
      include: {
        sourceDocuments: { include: { document: { select: { id: true, driveFileName: true } } } },
        appliedInProjects: { include: { project: { select: { id: true, title: true } } } },
        _count: { select: { sourceDocuments: true, appliedInProjects: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ frameworks, total: frameworks.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
