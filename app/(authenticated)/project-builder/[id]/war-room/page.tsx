"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { ExpertList } from "@/components/expert-panel/expert-list";
import { ConsultantsThread } from "@/components/expert-panel/consultants-thread";
import { CheckpointPanel } from "@/components/war-room/checkpoint-panel";
import { Expert, EXPERTS } from "@/components/expert-panel/experts-data";
import { Loader2, MessageSquare, Brain, Clock, CheckCheck, XCircle } from "lucide-react";
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
        <div className="rounded-2xl border-2 border-dashed border-slate-200 p-6 text-center space-y-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 mx-auto">
            <Brain className="h-6 w-6 text-indigo-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-800">Análisis Estratégico</h3>
            <p className="mt-1 text-sm text-slate-400">
              El Supervisor analiza tu proyecto y propone el agente más útil ahora mismo.
            </p>
          </div>

          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="Contexto adicional (opcional): ¿en qué área quieres enfocarte?"
            rows={2}
            disabled={loading}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm resize-none outline-none focus:border-slate-400 disabled:opacity-40"
          />

          {completed && session && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3 text-left">
              <p className="text-sm font-medium text-emerald-700">Sesión completada</p>
              <p className="text-xs text-emerald-500 mt-0.5">
                Decisiones guardadas en DecisionLog del proyecto.
              </p>
              <SessionTimeline events={session.history} />
            </div>
          )}

          <button
            onClick={startSession}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Supervisor analizando…
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
            <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
              <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
              <p className="text-sm text-slate-500">
                {session.phase === "supervisor_thinking"
                  ? "Supervisor analizando el proyecto…"
                  : session.phase === "agent_working" || session.phase === "routing"
                  ? "Agente trabajando…"
                  : "Procesando…"}
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
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="flex bg-white" style={{ height: "100vh" }}>
      {/* ── Panel de Expertos ── */}
      <div className="w-72 shrink-0 border-r border-gray-100 flex flex-col">
        <div className="px-4 pt-5 pb-4 border-b border-gray-100">
          <p className="text-xs tracking-[0.15em] uppercase text-gray-400 mb-1">Orquestación</p>
          <span className="font-serif text-base font-semibold text-gray-900 tracking-tight">War Room</span>
          {projectTitle && (
            <p className="text-xs text-gray-400 mt-1 truncate">{projectTitle}</p>
          )}
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-gray-100 px-2 pt-2">
          <button
            onClick={() => setTab("panel")}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-t-lg px-2 py-2 text-xs font-medium transition-colors ${
              tab === "panel"
                ? "border-b-2 border-gray-900 text-gray-900"
                : "text-gray-400 hover:text-gray-600"
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Panel
          </button>
          <button
            onClick={() => setTab("strategy")}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-t-lg px-2 py-2 text-xs font-medium transition-colors ${
              tab === "strategy"
                ? "border-b-2 border-indigo-600 text-indigo-600"
                : "text-gray-400 hover:text-gray-600"
            }`}
          >
            <Brain className="h-3.5 w-3.5" />
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
          <div className="p-3 text-xs text-slate-400 space-y-2">
            <p className="font-medium text-slate-500">Modo Análisis Estratégico</p>
            <p>El Supervisor lee tu proyecto, propone un plan, y enruta al agente más relevante.</p>
            <p>Cada decisión queda en el DecisionLog.</p>
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
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div>
              <h2 className="font-serif text-lg text-gray-900 leading-tight">{projectTitle}</h2>
              <p className="text-xs text-gray-400 mt-0.5">Supervisor · Human-in-the-Loop</p>
            </div>
          </div>
          <StrategyMode projectId={projectId} />
        </div>
      )}
    </div>
  );
}
