import { NextRequest, NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { startDebate, getDebateByProject } from "@/lib/engine/debate";
import { getAgentConfig } from "@/lib/engine/agents";
import { EXPERTS } from "@/components/expert-panel/experts-data";
import { triggerRaindropSyncIfNeeded } from "@/lib/background/raindrop-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await getDefaultUserId();
    const { topic } = (await request.json()) as { topic: string };
    if (!topic?.trim()) {
      return NextResponse.json({ error: "topic es requerido" }, { status: 400 });
    }

    // Background Raindrop sync (non-blocking)
    void triggerRaindropSyncIfNeeded(userId);

    const session = await startDebate(params.id, userId, topic);

    const agentDetails = session.selectedAgents.map((id) => {
      const expert = EXPERTS.find((e) => e.id === id);
      const config = getAgentConfig(id);
      return {
        id,
        name: expert?.name ?? id,
        role: expert?.role ?? "",
        llm: config?.preferredLLM ?? "gemini-flash",
      };
    });

    return NextResponse.json({ session, agentDetails }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    console.error("[DEBATE POST]", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await getDefaultUserId();
    const session = getDebateByProject(params.id);
    return NextResponse.json({ session });
  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
