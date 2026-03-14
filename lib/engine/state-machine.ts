// =============================================================================
// VEXCO-LAB ENGINE — STATE MACHINE
// Sessions are in-memory (Map). Ephemeral by design.
// DecisionLog is the real persistence layer.
// =============================================================================

import { randomUUID } from "crypto";
import type {
  SessionState,
  SessionPhase,
  SessionEvent,
  SupervisorPlan,
  AgentResult,
} from "./types";
import { VALID_TRANSITIONS } from "./types";

// ─── In-memory store ──────────────────────────────────────────────────────────

const sessions = new Map<string, SessionState>();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function now(): Date {
  return new Date();
}

function addEvent(
  session: SessionState,
  type: SessionEvent["type"],
  data: Record<string, unknown> = {}
): void {
  session.history.push({ type, timestamp: now(), data });
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function createSession(projectId: string, userId: string): SessionState {
  const session: SessionState = {
    id: randomUUID(),
    projectId,
    userId,
    phase: "idle",
    currentAgentId: null,
    supervisorPlan: null,
    agentResult: null,
    history: [],
    createdAt: now(),
    updatedAt: now(),
  };

  addEvent(session, "supervisor_proposal", { action: "session_created" });
  sessions.set(session.id, session);
  return session;
}

export function getSession(sessionId: string): SessionState | null {
  return sessions.get(sessionId) ?? null;
}

export function getSessionByProject(projectId: string): SessionState | null {
  for (const session of sessions.values()) {
    if (session.projectId === projectId && session.phase !== "completed") {
      return session;
    }
  }
  return null;
}

export function transitionTo(
  sessionId: string,
  newPhase: SessionPhase,
  data?: {
    supervisorPlan?: SupervisorPlan;
    agentResult?: AgentResult;
    currentAgentId?: string;
    eventData?: Record<string, unknown>;
  }
): SessionState {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  const allowed = VALID_TRANSITIONS[session.phase];
  if (!allowed.includes(newPhase)) {
    throw new Error(
      `Invalid transition: ${session.phase} → ${newPhase}. Allowed: ${allowed.join(", ")}`
    );
  }

  session.phase = newPhase;
  session.updatedAt = now();

  if (data?.supervisorPlan !== undefined) {
    session.supervisorPlan = data.supervisorPlan;
  }
  if (data?.agentResult !== undefined) {
    session.agentResult = data.agentResult;
  }
  if (data?.currentAgentId !== undefined) {
    session.currentAgentId = data.currentAgentId;
  }

  // Map phase to event type
  const eventMap: Partial<Record<SessionPhase, SessionEvent["type"]>> = {
    supervisor_thinking: "supervisor_proposal",
    awaiting_human: "supervisor_proposal",
    routing: "agent_start",
    agent_working: "agent_start",
    agent_delivered: "agent_complete",
    completed: "session_end",
  };

  const eventType = eventMap[newPhase];
  if (eventType) {
    addEvent(session, eventType, data?.eventData ?? { phase: newPhase });
  }

  sessions.set(sessionId, session);
  return session;
}

export function updateSessionPlan(sessionId: string, plan: SupervisorPlan): SessionState {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);
  session.supervisorPlan = plan;
  session.updatedAt = now();
  sessions.set(sessionId, session);
  return session;
}

export function updateSessionResult(sessionId: string, result: AgentResult): SessionState {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);
  session.agentResult = result;
  session.updatedAt = now();
  sessions.set(sessionId, session);
  return session;
}

export function recordHumanDecision(
  sessionId: string,
  action: "human_approval" | "human_rejection" | "human_redirect" | "human_input",
  data: Record<string, unknown> = {}
): void {
  const session = sessions.get(sessionId);
  if (!session) return;
  addEvent(session, action, data);
  session.updatedAt = now();
  sessions.set(sessionId, session);
}
