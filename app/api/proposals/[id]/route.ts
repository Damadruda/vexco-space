import { NextRequest, NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = await getDefaultUserId();
    const { action } = await request.json(); // "accept" | "reject" | "apply"
    const existing = await prisma.labProposal.findFirst({ where: { id: params.id, ownerId: userId } });
    if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

    const data: Record<string, unknown> = {};
    if (action === "accept") { data.status = "ACCEPTED"; data.reviewedAt = new Date(); }
    else if (action === "reject") { data.status = "REJECTED"; data.reviewedAt = new Date(); }
    else if (action === "apply") { data.status = "APPLIED"; data.appliedAt = new Date(); }
    else return NextResponse.json({ error: "action must be accept|reject|apply" }, { status: 400 });

    const proposal = await prisma.labProposal.update({ where: { id: params.id }, data });
    return NextResponse.json({ proposal });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[PROPOSALS PATCH]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
