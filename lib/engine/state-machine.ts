// =============================================================================
// VEXCO-LAB ENGINE — STATE MACHINE (Dual-store)
// Map for hot reads + DB for persistence across cold starts.
// Map is source of truth during active session; DB persists on every write.
// =============================================================================

import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
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

function serializeForDB(session: SessionState) {
  return {
    phase: session.phase,
    currentAgentId: session.currentAgentId,
    supervisorPlan: session.supervisorPlan ? JSON.parse(JSON.stringify(session.supervisorPlan)) : null,
    agentResult: session.agentResult ? JSON.parse(JSON.stringify(session.agentResult)) : null,
    history: JSON.parse(JSON.stringify(session.history)),
    updatedAt: session.updatedAt,
  };
}

function deserializeFromDB(row: {
  id: string;
  projectId: string;
  userId: string;
  phase: string;
  currentAgentId: string | null;
  supervisorPlan: unknown;
  agentResult: unknown;
  history: unknown;
  createdAt: Date;
  updatedAt: Date;
}): SessionState {
  return {
    id: row.id,
    projectId: row.projectId,
    userId: row.userId,
    phase: row.phase as SessionPhase,
    currentAgentId: row.currentAgentId,
    supervisorPlan: row.supervisorPlan ? (row.supervisorPlan as SupervisorPlan) : null,
    agentResult: row.agentResult ? (row.agentResult as AgentResult) : null,
    history: Array.isArray(row.history) ? (row.history as SessionEvent[]) : [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ─── DB persistence (fire-and-forget) ────────────────────────────────────────

function persistToDB(session: SessionState): void {
  prisma.warRoomSession
    .upsert({
      where: { id: session.id },
      create: {
        id: session.id,
        projectId: session.projectId,
        userId: session.userId,
        ...serializeForDB(session),
      },
      update: serializeForDB(session),
    })
    .catch((err) => {
      console.warn("[STATE-MACHINE] DB persist failed:", err);
    });
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
  persistToDB(session);
  return session;
}

export async function getSession(sessionId: string): Promise<SessionState | null> {
  // Map first (hot path)
  const cached = sessions.get(sessionId);
  if (cached) return cached;

  // DB fallback
  try {
    const row = await prisma.warRoomSession.findUnique({ where: { id: sessionId } });
    if (!row) return null;
    const session = deserializeFromDB(row);
    sessions.set(sessionId, session);
    return session;
  } catch {
    return null;
  }
}

export async function getSessionByProject(projectId: string): Promise<SessionState | null> {
  // Map first
  for (const session of sessions.values()) {
    if (session.projectId === projectId && session.phase !== "completed") {
      return session;
    }
  }

  // DB fallback
  try {
    const row = await prisma.warRoomSession.findFirst({
      where: { projectId, phase: { not: "completed" } },
      orderBy: { updatedAt: "desc" },
    });
    if (!row) return null;
    const session = deserializeFromDB(row);
    sessions.set(session.id, session);
    return session;
  } catch {
    return null;
  }
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

  if (data?.supervisorPlan !== undefined) session.supervisorPlan = data.supervisorPlan;
  if (data?.agentResult !== undefined) session.agentResult = data.agentResult;
  if (data?.currentAgentId !== undefined) session.currentAgentId = data.currentAgentId;

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
  persistToDB(session);
  return session;
}

export function updateSessionPlan(sessionId: string, plan: SupervisorPlan): SessionState {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);
  session.supervisorPlan = plan;
  session.updatedAt = now();
  sessions.set(sessionId, session);
  persistToDB(session);
  return session;
}

export function updateSessionResult(sessionId: string, result: AgentResult): SessionState {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);
  session.agentResult = result;
  session.updatedAt = now();
  sessions.set(sessionId, session);
  persistToDB(session);
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
  persistToDB(session);
}
