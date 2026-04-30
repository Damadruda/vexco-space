import { NextRequest, NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { prisma } from "@/lib/db";
import { NAICS_CODES } from "@/lib/firm-insights/naics";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await getDefaultUserId();
    const body = await request.json();
    const { naicsSector } = body as { naicsSector: string | null };

    if (naicsSector !== null && !NAICS_CODES.includes(naicsSector)) {
      return NextResponse.json(
        { error: `Invalid NAICS code: ${naicsSector}` },
        { status: 400 }
      );
    }

    const project = await prisma.project.findFirst({
      where: { id: params.id, userId },
      select: { id: true },
    });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const updated = await prisma.project.update({
      where: { id: params.id },
      data: {
        naicsSector,
        naicsSectorReviewed: true,
        // Confidence se sube a 1.0 cuando humano valida
        naicsSectorConfidence: naicsSector ? 1.0 : null,
      },
    });

    return NextResponse.json({ project: updated });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
