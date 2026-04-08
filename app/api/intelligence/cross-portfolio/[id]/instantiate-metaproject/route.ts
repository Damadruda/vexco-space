import { NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { instantiateMetaProjectFromProposal } from "@/lib/engine/cross-portfolio";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getDefaultUserId();
    const { id } = await params;
    const body = await request.json();
    const { proposalIndex, name, narrative } = body;

    if (typeof proposalIndex !== "number") {
      return NextResponse.json({ error: "proposalIndex requerido" }, { status: 400 });
    }

    const result = await instantiateMetaProjectFromProposal({
      analysisId: id,
      proposalIndex,
      overrides: { name, narrative },
      ownerId: userId,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[INSTANTIATE METAPROJECT]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    );
  }
}
