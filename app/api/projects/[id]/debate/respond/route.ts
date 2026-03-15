import { NextRequest, NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { prisma } from "@/lib/db";
import {
  getDebateSession,
  executePhase1,
  executePhase2,
  executePhase3,
} from "@/lib/engine/debate";
import { EXPERTS } from "@/components/expert-panel/experts-data";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await getDefaultUserId();
    const projectId = params.id;

    const body = (await request.json()) as {
      sessionId: string;
      action: "approve" | "modify_agents" | "feedback" | "close";
      input?: string;
      selectedAgents?: string[];
    };

    const { sessionId, action, input, selectedAgents } = body;
    const session = getDebateSession(sessionId);

    if (!session || session.projectId !== projectId || session.userId !== userId) {
      return NextResponse.json({ error: "Sesión no encontrada" }, { status: 404 });
    }

    if (action === "close") {
      session.phase = "completed";
      return NextResponse.json({ session });
    }

    if (session.phase === "selecting_agents") {
      if (action === "modify_agents" && selectedAgents?.length) {
        session.selectedAgents = selectedAgents;
      }
      // approve or modify_agents both proceed to phase 1
      const updated = await executePhase1(session);
      const agentDetails = updated.phase1Results.map((r) => ({
        id: r.agentId,
        name: r.agentName,
        role: EXPERTS.find((e) => e.id === r.agentId)?.role ?? "",
        llm: (r.content.metadata?.model as string) ?? "gemini-flash",
      }));
      return NextResponse.json({ session: updated, agentDetails });
    }

    if (session.phase === "phase1_review") {
      if (input) session.humanFeedback.push(input);
      const updated = await executePhase2(session);
      return NextResponse.json({ session: updated });
    }

    if (session.phase === "phase2_review") {
      const updated = await executePhase3(session, input ?? "");
      return NextResponse.json({ session: updated });
    }

    if (session.phase === "phase3_review") {
      if (action === "feedback" && input) {
        const updated = await executePhase3(session, input);
        return NextResponse.json({ session: updated });
      }
      // approve → save to DecisionLog + complete
      if (session.synthesisResult) {
        await prisma.decisionLog.create({
          data: {
            projectId,
            userId,
            decision: `Full Debate aprobado: ${session.topic}`,
            context: session.synthesisResult.content.summary,
            outcome: "APPROVED",
            agentSource: "full-debate",
          },
        });
      }
      session.phase = "completed";
      return NextResponse.json({ session });
    }

    return NextResponse.json(
      { error: "Acción no válida para esta fase" },
      { status: 400 }
    );
  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    console.error("[DEBATE RESPOND]", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
