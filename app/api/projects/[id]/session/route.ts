import { NextRequest, NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import {
  createSession,
  transitionTo,
  updateSessionPlan,
  getSessionByProject,
} from "@/lib/engine/state-machine";
import { supervisorAnalyze } from "@/lib/engine/supervisor";
import { buildCheckpoint } from "@/lib/engine/router";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ─── POST: Start new session ──────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await getDefaultUserId();
    const projectId = params.id;

    const body = await request.json().catch(() => ({}));
    const { additionalContext } = body as { additionalContext?: string };

    // Create session + transition to supervisor_thinking
    const session = createSession(projectId, userId);
    transitionTo(session.id, "supervisor_thinking");

    // Run supervisor analysis
    const plan = await supervisorAnalyze(projectId, userId, additionalContext);
    updateSessionPlan(session.id, plan);

    // Transition to awaiting_human (checkpoint)
    transitionTo(session.id, "awaiting_human", {
      supervisorPlan: plan,
      eventData: { plan },
    });

    // Rebuild session reference after mutations
    const { getSession } = await import("@/lib/engine/state-machine");
    const updatedSession = getSession(session.id)!;
    const checkpoint = buildCheckpoint(updatedSession);

    return NextResponse.json({ session: updatedSession, checkpoint }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    console.error("[SESSION POST] Error:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

// ─── GET: Get active session for a project ────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await getDefaultUserId();
    const projectId = params.id;

    const session = getSessionByProject(projectId);
    if (!session) {
      return NextResponse.json({ session: null, checkpoint: null });
    }

    const checkpoint = session.phase === "awaiting_human" || session.phase === "agent_delivered"
      ? buildCheckpoint(session)
      : null;

    return NextResponse.json({ session, checkpoint });
  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    console.error("[SESSION GET] Error:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
