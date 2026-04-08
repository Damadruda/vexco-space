import { NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { applyChannelRouting } from "@/lib/engine/cross-portfolio";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await getDefaultUserId();
    const { id } = await params;
    const body = await request.json();
    const { routingIndex } = body;

    if (typeof routingIndex !== "number") {
      return NextResponse.json({ error: "routingIndex requerido" }, { status: 400 });
    }

    const result = await applyChannelRouting({ analysisId: id, routingIndex });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[APPLY CHANNEL ROUTING]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    );
  }
}
