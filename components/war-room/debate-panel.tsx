"use client";

import { useState, useEffect, useCallback } from "react";
import { StructuredOutputRenderer } from "./structured-output";
import { ExpertAvatar } from "@/components/expert-panel/expert-avatar";
import { EXPERTS } from "@/components/expert-panel/experts-data";
import {
  QLInlineLoading,
  QLShimmer,
  QLTransition,
} from "@/components/ui/ql-loading";
import type { DebateSession, DebatePhase } from "@/lib/engine/debate";
import type { AgentResult } from "@/lib/engine/types";
import { ChevronDown, ChevronUp, X } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentDetail {
  id: string;
  name: string;
  role: string;
  llm: string;
}

interface DebatePanelProps {
  projectId: string;
  onClose?: () => void;
}

// ─── Timeline Bar ─────────────────────────────────────────────────────────────

const PHASES_ORDER: DebatePhase[] = [
  "selecting_agents",
  "phase1_analysis",
  "phase1_review",
  "phase2_confrontation",
  "phase2_review",
  "phase3_synthesis",
  "phase3_review",
  "completed",
];

function TimelineBar({ phase }: { phase: DebatePhase }) {
  const phaseIndex = PHASES_ORDER.indexOf(phase);
  const steps = [
    { label: "Análisis", activeAt: 1 },
    { label: "Confrontación", activeAt: 3 },
    { label: "Síntesis", activeAt: 5 },
  ];

  return (
    <div className="flex items-center gap-0 mb-8">
      {steps.map((step, i) => {
        const isActive = phaseIndex >= step.activeAt;
        const isCurrent =
          phaseIndex === step.activeAt || phaseIndex === step.activeAt + 1;
        return (
          <div key={step.label} className="flex items-center gap-0">
            <div className="flex flex-col items-center">
              <div
                className={`h-2 w-2 rounded-full transition-colors ${
                  isActive
                    ? "bg-ql-accent"
                    : isCurrent
                    ? "bg-ql-accent animate-pulse"
                    : "bg-ql-sand"
                }`}
              />
              <span
                className={`mt-1.5 text-xs font-medium transition-colors ${
                  isActive ? "text-ql-charcoal" : "text-ql-muted"
                }`}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`mx-4 h-px w-16 -translate-y-2 transition-colors ${
                  phaseIndex > step.activeAt + 1 ? "bg-ql-accent" : "bg-ql-sand"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Agent Result Card ────────────────────────────────────────────────────────

function AgentResultCard({
  result,
  isRedTeam = false,
}: {
  result: AgentResult;
  isRedTeam?: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const expert = EXPERTS.find((e) => e.id === result.agentId);
  const model = result.content.metadata?.model ?? "";

  return (
    <div
      className={`rounded-lg bg-white overflow-hidden ${
        isRedTeam
          ? "border-l-2 border-ql-danger/50"
          : "border border-ql-sand/20"
      }`}
    >
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left"
      >
        {expert && <ExpertAvatar expert={expert} size="md" />}
        <div className="flex-1 min-w-0">
          <p className="ql-h3 text-sm">{result.agentName}</p>
          {expert && <p className="ql-caption">{expert.role}</p>}
        </div>
        {model && (
          <span className="ql-badge-default text-xs mr-2">{model}</span>
        )}
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-ql-muted shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-ql-muted shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-5 pb-5">
          <StructuredOutputRenderer output={result.content} />
        </div>
      )}
    </div>
  );
}

// ─── Expert Selector Grid ─────────────────────────────────────────────────────

function ExpertSelectorGrid({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {EXPERTS.map((expert) => {
        const isSelected = selected.includes(expert.id);
        return (
          <button
            key={expert.id}
            onClick={() => onToggle(expert.id)}
            className={`flex flex-col items-center gap-2 p-4 rounded-lg border transition-all text-center ${
              isSelected
                ? "border-ql-accent bg-ql-accent/5"
                : "border-ql-sand/30 bg-white opacity-50 hover:opacity-80"
            }`}
          >
            <ExpertAvatar expert={expert} size="md" />
            <div>
              <p className="text-xs font-medium text-ql-charcoal leading-tight">
                {expert.name}
              </p>
              <p className="ql-caption normal-case tracking-normal text-xs mt-0.5 leading-tight">
                {expert.role.split("·")[0].trim()}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function DebatePanel({ projectId, onClose }: DebatePanelProps) {
  const [topic, setTopic] = useState("");
  const [session, setSession] = useState<DebateSession | null>(null);
  const [agentDetails, setAgentDetails] = useState<AgentDetail[]>([]);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const startDebate = async () => {
    if (!topic.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/projects/${projectId}/debate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Error al iniciar debate");
      }
      const data = (await res.json()) as {
        session: DebateSession;
        agentDetails: AgentDetail[];
      };
      setSession(data.session);
      setAgentDetails(data.agentDetails);
      setSelectedAgents(data.session.selectedAgents);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  const respond = useCallback(
    async (
      action: "approve" | "modify_agents" | "feedback" | "close",
      extraInput?: string,
      overrideAgents?: string[]
    ) => {
      if (!session) return;
      setLoading(true);
      setError("");
      try {
        const body: Record<string, unknown> = {
          sessionId: session.id,
          action,
        };
        if (extraInput) body.input = extraInput;
        if (overrideAgents) body.selectedAgents = overrideAgents;

        const res = await fetch(
          `/api/projects/${projectId}/debate/respond`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        );
        if (!res.ok) {
          const d = await res.json();
          throw new Error(d.error ?? "Error al procesar respuesta");
        }
        const data = (await res.json()) as {
          session: DebateSession;
          agentDetails?: AgentDetail[];
        };
        setSession(data.session);
        if (data.agentDetails) setAgentDetails(data.agentDetails);
        setFeedback("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error desconocido");
      } finally {
        setLoading(false);
      }
    },
    [session, projectId]
  );

  const toggleAgent = (id: string) => {
    setSelectedAgents((prev) => {
      if (prev.includes(id)) {
        if (prev.length <= 2) return prev; // min 2
        return prev.filter((a) => a !== id);
      } else {
        if (prev.length >= 5) return prev; // max 5
        return [...prev, id];
      }
    });
  };

  // ── Render: no session yet ──────────────────────────────────────────────────
  if (!session) {
    return (
      <QLTransition className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="ql-h2">Full Debate</h2>
            <p className="ql-body mt-1">
              3 fases: análisis independiente, confrontación y síntesis estratégica.
            </p>
          </div>
          {onClose && (
            <button onClick={onClose} className="ql-btn-ghost p-2">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="space-y-3">
          <label className="ql-label block">Tema del debate</label>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="¿Deberíamos expandirnos a LatAm primero?"
            className="ql-input"
            onKeyDown={(e) => e.key === "Enter" && startDebate()}
          />
        </div>

        {error && (
          <p className="text-sm text-ql-danger bg-ql-danger/5 rounded-lg px-4 py-3">
            {error}
          </p>
        )}

        <button
          onClick={startDebate}
          disabled={!topic.trim() || loading}
          className="ql-btn-primary disabled:opacity-50"
        >
          {loading ? (
            <QLInlineLoading text="Iniciando debate" />
          ) : (
            "Iniciar debate"
          )}
        </button>
      </QLTransition>
    );
  }

  const phase = session.phase;

  // ── Phase: selecting_agents ─────────────────────────────────────────────────
  if (phase === "selecting_agents") {
    const selectedDetails = agentDetails.filter((d) =>
      selectedAgents.includes(d.id)
    );
    return (
      <QLTransition className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="ql-h2">{session.topic}</h2>
            <p className="ql-caption mt-1">Selecciona el panel de expertos</p>
          </div>
          {onClose && (
            <button onClick={onClose} className="ql-btn-ghost p-2">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <ExpertSelectorGrid selected={selectedAgents} onToggle={toggleAgent} />

        {selectedDetails.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedDetails.map((d) => (
              <span key={d.id} className="ql-caption normal-case tracking-normal text-xs">
                {d.name} · {d.llm}
              </span>
            ))}
          </div>
        )}

        {error && (
          <p className="text-sm text-ql-danger bg-ql-danger/5 rounded-lg px-4 py-3">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <button
            onClick={() =>
              respond("modify_agents", undefined, selectedAgents)
            }
            disabled={loading || selectedAgents.length < 2}
            className="ql-btn-primary disabled:opacity-50"
          >
            {loading ? (
              <QLInlineLoading text="Iniciando análisis" />
            ) : (
              "Iniciar debate"
            )}
          </button>
          {onClose && (
            <button onClick={onClose} className="ql-btn-ghost">
              Cancelar
            </button>
          )}
        </div>
      </QLTransition>
    );
  }

  // ── Phase: phase1_analysis (loading) ───────────────────────────────────────
  if (phase === "phase1_analysis") {
    return (
      <QLTransition className="space-y-6">
        <TimelineBar phase={phase} />
        <div className="flex items-center gap-3 py-4">
          <span className="h-2 w-2 rounded-full bg-ql-accent animate-pulse" />
          <QLInlineLoading text="Los expertos están analizando de forma independiente" />
        </div>
        <div className="space-y-4">
          {session.selectedAgents.map((id) => {
            const expert = EXPERTS.find((e) => e.id === id);
            return (
              <div
                key={id}
                className="rounded-lg bg-white border border-ql-sand/20 p-5"
              >
                <div className="flex items-center gap-3 mb-3">
                  {expert && <ExpertAvatar expert={expert} size="md" />}
                  <div>
                    <p className="text-sm font-medium text-ql-charcoal">
                      {expert?.name ?? id}
                    </p>
                    <p className="ql-caption">Analizando...</p>
                  </div>
                </div>
                <QLShimmer lines={3} />
              </div>
            );
          })}
        </div>
      </QLTransition>
    );
  }

  // ── Phase: phase1_review ───────────────────────────────────────────────────
  if (phase === "phase1_review") {
    return (
      <QLTransition className="space-y-6">
        <TimelineBar phase={phase} />
        <h2 className="ql-h2">{session.topic}</h2>
        <p className="ql-body">Análisis independiente completado. Revisa las perspectivas antes de continuar.</p>

        <div className="space-y-4">
          {session.phase1Results.map((result) => (
            <AgentResultCard key={result.agentId} result={result} />
          ))}
        </div>

        <div className="space-y-2">
          <label className="ql-label block">Directriz para la confrontación</label>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Enfócate en el aspecto financiero, cuestiona el supuesto de mercado..."
            rows={2}
            className="ql-textarea resize-none"
          />
        </div>

        {error && (
          <p className="text-sm text-ql-danger bg-ql-danger/5 rounded-lg px-4 py-3">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => respond("approve", feedback || undefined)}
            disabled={loading}
            className="ql-btn-primary disabled:opacity-50"
          >
            {loading ? (
              <QLInlineLoading text="Iniciando confrontación" />
            ) : (
              "Continuar debate →"
            )}
          </button>
          {onClose && (
            <button
              onClick={() => respond("close")}
              disabled={loading}
              className="ql-btn-ghost disabled:opacity-50"
            >
              Cerrar
            </button>
          )}
        </div>
      </QLTransition>
    );
  }

  // ── Phase: phase2_confrontation (loading) ──────────────────────────────────
  if (phase === "phase2_confrontation") {
    return (
      <QLTransition className="space-y-6">
        <TimelineBar phase={phase} />
        <div className="flex items-center gap-3 py-4">
          <span className="h-2 w-2 rounded-full bg-ql-accent animate-pulse" />
          <QLInlineLoading text="Los expertos debaten entre sí" />
        </div>
        <QLShimmer lines={5} />
      </QLTransition>
    );
  }

  // ── Phase: phase2_review ───────────────────────────────────────────────────
  if (phase === "phase2_review") {
    const redTeamResult = session.phase2Results.find(
      (r) => r.agentId === "redteam"
    );
    const confrontationResults = session.phase2Results.filter(
      (r) => r.agentId !== "redteam"
    );

    return (
      <QLTransition className="space-y-6">
        <TimelineBar phase={phase} />
        <h2 className="ql-h2">{session.topic}</h2>
        <p className="ql-body">Confrontación completa. Red Team ha evaluado el debate.</p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <p className="ql-label">Análisis confrontado</p>
            {confrontationResults.map((result) => (
              <AgentResultCard key={result.agentId} result={result} />
            ))}
          </div>
          {redTeamResult && (
            <div className="space-y-4">
              <p className="ql-label text-ql-danger">Red Team</p>
              <AgentResultCard result={redTeamResult} isRedTeam />
            </div>
          )}
        </div>

        <div className="space-y-2">
          <label className="ql-label block">Directriz para la síntesis</label>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Prioriza el análisis financiero, excluye el mercado europeo..."
            rows={2}
            className="ql-textarea resize-none"
          />
        </div>

        {error && (
          <p className="text-sm text-ql-danger bg-ql-danger/5 rounded-lg px-4 py-3">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => respond("approve", feedback || undefined)}
            disabled={loading}
            className="ql-btn-primary disabled:opacity-50"
          >
            {loading ? (
              <QLInlineLoading text="Generando síntesis" />
            ) : (
              "Generar síntesis →"
            )}
          </button>
          {onClose && (
            <button
              onClick={() => respond("close")}
              disabled={loading}
              className="ql-btn-ghost disabled:opacity-50"
            >
              Cerrar
            </button>
          )}
        </div>
      </QLTransition>
    );
  }

  // ── Phase: phase3_synthesis (loading) ──────────────────────────────────────
  if (phase === "phase3_synthesis") {
    return (
      <QLTransition className="space-y-6">
        <TimelineBar phase={phase} />
        <div className="flex items-center gap-3 py-4">
          <span className="h-2 w-2 rounded-full bg-ql-accent animate-pulse" />
          <QLInlineLoading text="Sintetizando recomendaciones" />
        </div>
        <QLShimmer lines={6} />
      </QLTransition>
    );
  }

  // ── Phase: phase3_review ───────────────────────────────────────────────────
  if (phase === "phase3_review") {
    return (
      <QLTransition className="space-y-6">
        <TimelineBar phase={phase} />
        <h2 className="ql-h2">{session.topic}</h2>
        <p className="ql-body">Síntesis estratégica lista. Revisa y aprueba.</p>

        {session.synthesisResult && (
          <StructuredOutputRenderer output={session.synthesisResult.content} />
        )}

        <div className="space-y-2">
          <label className="ql-label block">Refinamiento (opcional)</label>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Añade más detalle sobre el modelo de monetización..."
            rows={2}
            className="ql-textarea resize-none"
          />
        </div>

        {error && (
          <p className="text-sm text-ql-danger bg-ql-danger/5 rounded-lg px-4 py-3">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => respond("approve")}
            disabled={loading}
            className="ql-btn-primary disabled:opacity-50"
          >
            {loading ? (
              <QLInlineLoading text="Guardando" />
            ) : (
              "Aprobar y guardar"
            )}
          </button>
          <button
            onClick={() => respond("feedback", feedback)}
            disabled={loading || !feedback.trim()}
            className="ql-btn-secondary disabled:opacity-50"
          >
            Refinar síntesis
          </button>
          {onClose && (
            <button
              onClick={() => respond("close")}
              disabled={loading}
              className="ql-btn-ghost disabled:opacity-50"
            >
              Cerrar
            </button>
          )}
        </div>
      </QLTransition>
    );
  }

  // ── Phase: completed ────────────────────────────────────────────────────────
  if (phase === "completed") {
    return (
      <QLTransition className="space-y-5 py-8 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-ql-success/10 mx-auto">
          <span className="h-3 w-3 rounded-full bg-ql-success" />
        </div>
        <h3 className="ql-h3">Debate completado</h3>
        <p className="ql-caption normal-case tracking-normal">
          {new Date(session.createdAt).toLocaleString("es-ES")}
        </p>
        <div className="flex justify-center gap-3 pt-2">
          <button
            onClick={() => {
              setSession(null);
              setTopic("");
              setFeedback("");
              setSelectedAgents([]);
              setAgentDetails([]);
            }}
            className="ql-btn-secondary"
          >
            Nuevo debate
          </button>
          {onClose && (
            <button onClick={onClose} className="ql-btn-ghost">
              Cerrar
            </button>
          )}
        </div>
      </QLTransition>
    );
  }

  return null;
}
