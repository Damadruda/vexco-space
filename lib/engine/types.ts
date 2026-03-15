// =============================================================================
// VEXCO-LAB ENGINE — TYPE DEFINITIONS
// Supervisor / State Machine / Human-in-the-Loop
// =============================================================================

export type SessionPhase =
  | "idle"
  | "supervisor_thinking"
  | "awaiting_human"
  | "routing"
  | "agent_working"
  | "agent_delivered"
  | "completed";

export interface SupervisorPlan {
  analysis: string;
  proposedAction: string;
  targetAgentId: string;
  reasoning: string;
  priority: "high" | "medium" | "low";
  estimatedScope: string;
  archetype?: {
    name: string;
    phases: Array<{ name: string; description: string; order: number }>;
    currentPhase: string;
    reasoning: string;
  };
}

export interface OutputSection {
  heading: string;
  content: string;
  items?: string[];
  priority?: "must" | "should" | "could" | "wont";
}

export interface StructuredOutput {
  type: "analysis" | "recommendation" | "action_plan" | "risk_assessment";
  title: string;
  summary: string;
  sections: OutputSection[];
  metadata: {
    model: string;
    processingTimeMs: number;
    confidenceScore: number;
    skillsUsed: string[];
  };
}

export interface AgentResult {
  agentId: string;
  agentName: string;
  content: StructuredOutput;
  timestamp: Date;
}

export interface SessionEvent {
  type:
    | "supervisor_proposal"
    | "human_input"
    | "human_approval"
    | "human_rejection"
    | "human_redirect"
    | "agent_start"
    | "agent_complete"
    | "session_end";
  timestamp: Date;
  data: Record<string, unknown>;
}

export interface SessionState {
  id: string;
  projectId: string;
  userId: string;
  phase: SessionPhase;
  currentAgentId: string | null;
  supervisorPlan: SupervisorPlan | null;
  agentResult: AgentResult | null;
  history: SessionEvent[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CheckpointOption {
  id: string;
  label: string;
  action: "approve" | "reject" | "redirect" | "modify";
  targetAgentId?: string;
}

export interface Checkpoint {
  sessionId: string;
  phase: "plan_review" | "result_review";
  content: SupervisorPlan | AgentResult;
  options: CheckpointOption[];
}

// Valid state machine transitions
export const VALID_TRANSITIONS: Record<SessionPhase, SessionPhase[]> = {
  idle: ["supervisor_thinking"],
  supervisor_thinking: ["awaiting_human"],
  awaiting_human: ["routing", "supervisor_thinking", "completed"],
  routing: ["agent_working"],
  agent_working: ["agent_delivered"],
  agent_delivered: ["awaiting_human"],
  completed: [],
};
