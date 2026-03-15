"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { ExpertList } from "@/components/expert-panel/expert-list";
import { ConsultantsThread } from "@/components/expert-panel/consultants-thread";
import { CheckpointPanel } from "@/components/war-room/checkpoint-panel";
import { Expert, EXPERTS } from "@/components/expert-panel/experts-data";
import { MessageSquare, Brain, Clock, CheckCheck, XCircle } from "lucide-react";
import type { Checkpoint, SessionState, SessionEvent } from "@/lib/engine/types";

type WarRoomTab = "panel" | "strategy";

// ─── Session Timeline ─────────────────────────────────────────────────────────

function SessionTimeline({ events }: { events: SessionEvent[] }) {
  const labeled = events.filter((e) =>
    ["supervisor_proposal", "human_approval", "human_rejection",
     "human_redirect", "agent_complete", "session_end"].includes(e.type)
  );

  if (labeled.length === 0) return null;

  const ICONS: Record<string, React.ReactNode> = {
    supervisor_proposal: <Brain className="h-3.5 w-3.5 text-indigo-500" />,
    human_approval:      <CheckCheck className="h-3.5 w-3.5 text-emerald-500" />,
    human_rejection:     <XCircle className="h-3.5 w-3.5 text-red-500" />,
    human_redirect:      <Clock className="h-3.5 w-3.5 text-amber-500" />,
    agent_complete:      <CheckCheck className="h-3.5 w-3.5 text-blue-500" />,
    session_end:         <CheckCheck className="h-3.5 w-3.5 text-slate-400" />,
  };

  const LABELS: Record<string, string> = {
    supervisor_proposal: "Supervisor propuso",
    human_approval:      "Usuario aprobó",
    human_rejection:     "Usuario rechazó",
    human_redirect:      "Usuario redirigió",
    agent_complete:      "Agente completó",
    session_end:         "Sesión cerrada",
  };

  return (
    <div className="mt-4 border-t border-slate-100 pt-4 space-y-2">
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Historial</p>
      {labeled.map((event, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-50">
            {ICONS[event.type]}
          </div>
          <span className="text-xs text-slate-600">
            {LABELS[event.type] ?? event.type}
          </span>
          <span className="ml-auto text-xs text-slate-400">
            {new Date(event.timestamp).toLocaleTimeString("es-ES", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Strategy Mode ────────────────────────────────────────────────────────────

function StrategyMode({ projectId }: { projectId: string }) {
  const [session, setSession] = useState<SessionState | null>(null);
  const [checkpoint, setCheckpoint] = useState<Checkpoint | null>(null);
  const [loading, setLoading] = useState(false);
  const [responding, setResponding] = useState(false);
  const [error, setError] = useState("");
  const [context, setContext] = useState("");
  const [completed, setCompleted] = useState(false);

  const startSession = async () => {
    setLoading(true);
    setError("");
    setCompleted(false);

    try {
      const res = await fetch(`/api/projects/${projectId}/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ additionalContext: context || undefined }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Error al iniciar sesión");
      }

      const data = await res.json();
      setSession(data.session);
      setCheckpoint(data.checkpoint);
      setContext("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  const handleRespond = async (
    action: "approve" | "reject" | "redirect" | "modify",
    input?: string,
    targetAgentId?: string
  ) => {
    if (!session) return;
    setResponding(true);
    setError("");

    try {
      const res = await fetch(`/api/projects/${projectId}/session/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          action,
          input,
          targetAgentId,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Error al procesar respuesta");
      }

      const data = await res.json();
      setSession(data.session);
      setCheckpoint(data.checkpoint ?? null);

      if (data.session.phase === "completed") {
        setCompleted(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setResponding(false);
    }
  };

  const isIdle = !session || session.phase === "completed" || completed;

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
      {/* Start panel */}
      {isIdle && (
        <div className="ql-card-flat rounded-lg p-6 text-center space-y-4 mx-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-ql-cream mx-auto">
            <Brain className="h-5 w-5 text-ql-accent" strokeWidth={1.5} />
          </div>
          <div>
            <h3 className="ql-h3">Análisis Estratégico</h3>
            <p className="ql-body mt-1">
              El Supervisor analiza tu proyecto y propone el agente más útil.
            </p>
          </div>

          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="Contexto adicional: ¿en qué área quieres enfocarte?"
            rows={2}
            disabled={loading}
            className="ql-textarea resize-none disabled:opacity-40"
          />

          {completed && session && (
            <div className="ql-card text-left">
              <p className="text-sm font-medium text-ql-success">Sesión completada</p>
              <p className="ql-caption mt-0.5">
                Decisiones guardadas en DecisionLog.
              </p>
              <SessionTimeline events={session.history} />
            </div>
          )}

          <button
            onClick={startSession}
            disabled={loading}
            className="ql-btn-primary disabled:opacity-50 mx-auto"
          >
            {loading ? (
              <>
                <span className="ql-status-thinking" />
                Supervisor analizando...
              </>
            ) : (
              <>
                <Brain className="h-4 w-4" />
                {completed ? "Iniciar nuevo análisis" : "Iniciar análisis"}
              </>
            )}
          </button>
        </div>
      )}

      {/* Active session */}
      {!isIdle && session && (
        <div className="space-y-4">
          {/* Phase indicator */}
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
            <p className="text-xs text-slate-400 capitalize">
              {session.phase.replace(/_/g, " ")}
            </p>
          </div>

          {/* Loading overlay */}
          {(loading || responding) && (
            <div className="flex items-center gap-3 ql-card-flat px-4 py-3">
              <span className="ql-status-thinking" />
              <p className="ql-loading">
                {session.phase === "supervisor_thinking"
                  ? "Supervisor analizando el proyecto..."
                  : session.phase === "agent_working" || session.phase === "routing"
                  ? "Agente trabajando..."
                  : "Procesando..."}
              </p>
            </div>
          )}

          {/* Checkpoint */}
          {checkpoint && !responding && (
            <CheckpointPanel
              checkpoint={checkpoint}
              onRespond={handleRespond}
              isLoading={responding}
            />
          )}

          {/* Timeline */}
          <SessionTimeline events={session.history} />
        </div>
      )}

      {error && (
        <p className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProjectWarRoomPage() {
  const params = useParams();
  const projectId = params?.id as string;

  const [activeExpert, setActiveExpert] = useState<Expert>(EXPERTS[0]);
  const [projectTitle, setProjectTitle] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<WarRoomTab>("panel");

  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/projects/${projectId}`)
      .then((r) => r.json())
      .then((data) => setProjectTitle(data?.project?.title ?? "Proyecto"))
      .catch(() => setProjectTitle("Proyecto"))
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center gap-2 justify-center bg-ql-offwhite">
        <span className="ql-status-thinking" />
        <span className="ql-loading">Cargando War Room...</span>
      </div>
    );
  }

  return (
    <div className="flex bg-ql-offwhite" style={{ height: "100vh" }}>
      {/* ── Panel de Expertos ── */}
      <div className="w-64 shrink-0 bg-white border-r border-ql-sand/20 flex flex-col">
        <div className="px-4 pt-5 pb-4 border-b border-ql-sand/20">
          <p className="ql-label mb-1">Orquestación</p>
          <span className="ql-h3 text-base">War Room</span>
          {projectTitle && (
            <p className="ql-caption mt-1 truncate">{projectTitle}</p>
          )}
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-ql-sand/20 px-2 pt-2">
          <button
            onClick={() => setTab("panel")}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium transition-colors ${
              tab === "panel"
                ? "border-b-2 border-ql-charcoal text-ql-charcoal"
                : "text-ql-muted hover:text-ql-slate"
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" strokeWidth={1.5} />
            Panel
          </button>
          <button
            onClick={() => setTab("strategy")}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium transition-colors ${
              tab === "strategy"
                ? "border-b-2 border-ql-accent text-ql-accent"
                : "text-ql-muted hover:text-ql-slate"
            }`}
          >
            <Brain className="h-3.5 w-3.5" strokeWidth={1.5} />
            Estrategia
          </button>
        </div>

        {tab === "panel" && (
          <ExpertList
            activeExpertId={activeExpert.id}
            onSelect={setActiveExpert}
          />
        )}

        {tab === "strategy" && (
          <div className="p-4 space-y-3">
            <p className="ql-label">Modo Análisis Estratégico</p>
            <p className="ql-body">El Supervisor lee tu proyecto, propone un plan, y enruta al agente más relevante.</p>
            <p className="ql-body">Cada decisión queda en el DecisionLog.</p>
          </div>
        )}
      </div>

      {/* ── Main area ── */}
      {tab === "panel" ? (
        <div className="flex-1 flex flex-col min-w-0">
          <ConsultantsThread
            activeExpert={activeExpert}
            projectId={projectId}
            projectTitle={projectTitle}
          />
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between px-6 py-4 border-b border-ql-sand/20 bg-white">
            <div>
              <h2 className="ql-h3">{projectTitle}</h2>
              <p className="ql-caption mt-0.5">Supervisor · Human-in-the-Loop</p>
            </div>
          </div>
          <StrategyMode projectId={projectId} />
        </div>
      )}
    </div>
  );
}
