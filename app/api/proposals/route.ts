import { NextRequest, NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const userId = await getDefaultUserId();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const where: Record<string, unknown> = { ownerId: userId };
    if (status) where.status = status;
    const proposals = await prisma.labProposal.findMany({
      where,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 200,
    });
    return NextResponse.json({ proposals });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[PROPOSALS GET]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getDefaultUserId();
    const body = await request.json();
    const { title, rationale, proposedChange, sourceType, targetType, sourceRef, targetRef, epistemicRegister, confidence } = body;
    if (!title || !rationale || !proposedChange || !targetType) {
      return NextResponse.json({ error: "title, rationale, proposedChange, targetType required" }, { status: 400 });
    }
    const proposal = await prisma.labProposal.create({
      data: {
        title,
        rationale,
        proposedChange,
        sourceType: sourceType ?? "MANUAL",
        targetType,
        sourceRef: sourceRef ?? null,
        targetRef: targetRef ?? null,
        epistemicRegister: epistemicRegister ?? null,
        confidence: typeof confidence === "number" ? confidence : 50,
        ownerId: userId,
      },
    });
    return NextResponse.json({ proposal }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[PROPOSALS POST]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
