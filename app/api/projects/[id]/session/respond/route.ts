import { NextRequest, NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { prisma } from "@/lib/db";
import {
  getSession,
  transitionTo,
  updateSessionPlan,
  updateSessionResult,
  recordHumanDecision,
} from "@/lib/engine/state-machine";
import { supervisorAnalyze, loadProjectMemory } from "@/lib/engine/supervisor";
import { routeToAgent, buildCheckpoint } from "@/lib/engine/router";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await getDefaultUserId();
    const projectId = params.id;

    const body = await request.json();
    const { sessionId, action, input, targetAgentId } = body as {
      sessionId: string;
      action: "approve" | "reject" | "redirect" | "modify";
      input?: string;
      targetAgentId?: string;
    };

    const session = await getSession(sessionId);
    if (!session || session.projectId !== projectId || session.userId !== userId) {
      return NextResponse.json({ error: "Sesión no encontrada o no autorizada" }, { status: 404 });
    }

    // ─── APPROVE ─────────────────────────────────────────────────────────────
    if (action === "approve") {
      if (session.phase === "awaiting_human" && session.supervisorPlan && !session.agentResult) {
        // Approving the supervisor plan → route to agent
        recordHumanDecision(sessionId, "human_approval", {
          plan: session.supervisorPlan.proposedAction,
        });

        // Persist to DecisionLog
        await prisma.decisionLog.create({
          data: {
            projectId,
            userId,
            decision: session.supervisorPlan.proposedAction,
            context: session.supervisorPlan.reasoning,
            outcome: "APPROVED",
            agentSource: "supervisor",
          },
        });

        // Route to agent
        transitionTo(sessionId, "routing", {
          currentAgentId: session.supervisorPlan.targetAgentId,
        });
        transitionTo(sessionId, "agent_working");

        const memory = await loadProjectMemory(projectId, userId);
        const decisions = await prisma.decisionLog.findMany({
          where: { projectId },
          orderBy: { createdAt: "desc" },
        });

        const agentResult = await routeToAgent(
          session.supervisorPlan.targetAgentId,
          memory ?? {},
          session.supervisorPlan,
          decisions,
          userId
        );

        updateSessionResult(sessionId, agentResult);
        transitionTo(sessionId, "agent_delivered", { agentResult });
        transitionTo(sessionId, "awaiting_human");

        const updated = (await getSession(sessionId))!;
        const checkpoint = buildCheckpoint(updated);

        return NextResponse.json({ session: updated, checkpoint, agentResult });
      }

      if (session.phase === "awaiting_human" && session.agentResult) {
        // Approving the agent result → complete session
        recordHumanDecision(sessionId, "human_approval", {
          agentResult: session.agentResult.agentName,
        });

        await prisma.decisionLog.create({
          data: {
            projectId,
            userId,
            decision: `Análisis de ${session.agentResult.agentName} aprobado: ${session.agentResult.content.title}`,
            context: session.agentResult.content.summary,
            outcome: "APPROVED",
            agentSource: session.agentResult.agentId,
          },
        });

        transitionTo(sessionId, "completed");
        const updated = (await getSession(sessionId))!;
        return NextResponse.json({ session: updated, checkpoint: null });
      }
    }

    // ─── REJECT ───────────────────────────────────────────────────────────────
    if (action === "reject") {
      const decisionText = session.supervisorPlan?.proposedAction
        ?? session.agentResult?.content.title
        ?? "Sesión rechazada";

      recordHumanDecision(sessionId, "human_rejection", { reason: input });

      await prisma.decisionLog.create({
        data: {
          projectId,
          userId,
          decision: decisionText,
          context: input ?? "El usuario rechazó la propuesta.",
          outcome: "REJECTED",
          agentSource: session.supervisorPlan?.targetAgentId ?? "supervisor",
        },
      });

      transitionTo(sessionId, "completed");
      const updated = (await getSession(sessionId))!;
      return NextResponse.json({ session: updated, checkpoint: null });
    }

    // ─── REDIRECT ─────────────────────────────────────────────────────────────
    if (action === "redirect" && targetAgentId) {
      const previousPlan = session.supervisorPlan;
      recordHumanDecision(sessionId, "human_redirect", { targetAgentId });

      if (previousPlan) {
        await prisma.decisionLog.create({
          data: {
            projectId,
            userId,
            decision: previousPlan.proposedAction,
            context: `Usuario redirigió a ${targetAgentId}. Razón: ${input ?? "Sin nota"}`,
            outcome: "DEFERRED",
            agentSource: "supervisor",
          },
        });
      }

      // Re-analyze with new target
      transitionTo(sessionId, "supervisor_thinking");
      const newPlan = await supervisorAnalyze(
        projectId,
        userId,
        `El usuario quiere consultar al agente "${targetAgentId}". ${input ?? ""}`
      );

      // Override targetAgentId with user's explicit choice
      newPlan.targetAgentId = targetAgentId;
      updateSessionPlan(sessionId, newPlan);

      transitionTo(sessionId, "awaiting_human", {
        supervisorPlan: newPlan,
        currentAgentId: null,
        agentResult: null,
      });

      const updated = (await getSession(sessionId))!;
      updated.agentResult = null;
      const checkpoint = buildCheckpoint(updated);

      return NextResponse.json({ session: updated, checkpoint });
    }

    // ─── MODIFY ───────────────────────────────────────────────────────────────
    if (action === "modify") {
      recordHumanDecision(sessionId, "human_input", { feedback: input });

      transitionTo(sessionId, "supervisor_thinking");
      const newPlan = await supervisorAnalyze(
        projectId,
        userId,
        `El usuario quiere más detalle. Feedback: "${input ?? "Proporciona análisis más profundo"}"`
      );

      updateSessionPlan(sessionId, newPlan);
      transitionTo(sessionId, "awaiting_human", {
        supervisorPlan: newPlan,
        agentResult: null,
        currentAgentId: null,
      });

      const updated = (await getSession(sessionId))!;
      updated.agentResult = null;
      const checkpoint = buildCheckpoint(updated);

      return NextResponse.json({ session: updated, checkpoint });
    }

    return NextResponse.json({ error: "Acción no reconocida" }, { status: 400 });
  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    console.error("[SESSION RESPOND] Error:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
