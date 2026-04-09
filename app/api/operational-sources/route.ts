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
    const kind = params.get("kind") || undefined;
    const status = params.get("status") || undefined;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};
    if (kind) where.detectedKind = kind;
    if (status) where.status = status;

    const sources = await prisma.operationalSource.findMany({
      where,
      orderBy: { discoveredAt: "desc" },
    });

    const total = await prisma.operationalSource.count({ where });

    return NextResponse.json({ sources, total });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
