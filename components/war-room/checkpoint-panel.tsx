"use client";

import { useState } from "react";
import {
  Check, X, ChevronDown, ArrowRight, Brain, Zap, BookOpen, Cpu, Search
} from "lucide-react";
import type { Checkpoint, SupervisorPlan, AgentResult } from "@/lib/engine/types";
import { StructuredOutputRenderer } from "./structured-output";
import { EXPERTS } from "@/components/expert-panel/experts-data";
import { ExpertAvatar } from "@/components/expert-panel/expert-avatar";

// ─── Props ────────────────────────────────────────────────────────────────────

interface CheckpointPanelProps {
  checkpoint: Checkpoint;
  onRespond: (
    action: "approve" | "reject" | "redirect" | "modify",
    input?: string,
    targetAgentId?: string
  ) => void;
  isLoading: boolean;
}

// ─── Priority badge ───────────────────────────────────────────────────────────

const PRIORITY_CLASSES: Record<string, string> = {
  high:   "ql-badge-danger",
  medium: "ql-badge-warning",
  low:    "ql-badge-default",
};

// ─── Plan Review ─────────────────────────────────────────────────────────────

function PlanReview({
  plan,
  onRespond,
  isLoading,
  redirectOptions,
}: {
  plan: SupervisorPlan;
  onRespond: CheckpointPanelProps["onRespond"];
  isLoading: boolean;
  redirectOptions: Checkpoint["options"];
}) {
  const [directive, setDirective] = useState("");
  const [showRedirect, setShowRedirect] = useState(false);

  const targetExpert = EXPERTS.find((e) => e.id === plan.targetAgentId);

  return (
    <div className="space-y-5">
      {/* Supervisor header */}
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ql-charcoal">
          <Brain className="h-4 w-4 text-white" />
        </div>
        <div>
          <p className="ql-label">Supervisor · Propuesta de Plan</p>
        </div>
        <span className={`ml-auto ${PRIORITY_CLASSES[plan.priority] ?? "ql-badge-default"}`}>
          {plan.priority}
        </span>
      </div>

      <div className="ql-divider-subtle" />

      {/* Analysis */}
      <div className="ql-card-flat space-y-2">
        <p className="ql-label">Estado del proyecto</p>
        <p className="ql-body">{plan.analysis}</p>
      </div>

      {/* Proposed action */}
      <div className="border-l-2 border-ql-accent pl-4 space-y-1">
        <p className="ql-label">Acción propuesta</p>
        <p className="text-sm font-medium text-ql-charcoal">{plan.proposedAction}</p>
        <p className="ql-caption">{plan.estimatedScope}</p>
      </div>

      {/* Target agent */}
      {targetExpert && (
        <div className="ql-card flex items-center gap-3">
          <ExpertAvatar expert={targetExpert} size="md" />
          <div>
            <p className="ql-h3 text-sm">{targetExpert.name}</p>
            <p className="ql-caption">{targetExpert.role}</p>
          </div>
          <p className="ml-auto ql-caption max-w-[140px] text-right leading-tight">
            {plan.reasoning}
          </p>
        </div>
      )}

      {/* Archetype */}
      {plan.archetype && (
        <div className="ql-card-flat space-y-3">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-ql-accent" strokeWidth={1.5} />
            <p className="ql-label">Arquetipo · {plan.archetype.name}</p>
          </div>
          <p className="ql-body">{plan.archetype.reasoning}</p>
          <div className="flex flex-wrap gap-2">
            {plan.archetype.phases.map((phase) => (
              <span
                key={phase.order}
                title={phase.description}
                className={
                  phase.name === plan.archetype!.currentPhase
                    ? "ql-badge-accent"
                    : "ql-badge-default"
                }
              >
                {phase.order}. {phase.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Directive input */}
      <div>
        <label className="ql-label block mb-2">
          Directriz adicional (opcional)
        </label>
        <input
          type="text"
          value={directive}
          onChange={(e) => setDirective(e.target.value)}
          placeholder="Enfócate en LatAm, prioriza ingresos a 30 días..."
          disabled={isLoading}
          className="ql-input disabled:opacity-40"
        />
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onRespond("approve", directive || undefined)}
          disabled={isLoading}
          className="ql-btn-primary disabled:opacity-50"
        >
          {isLoading ? <span className="ql-status-thinking" /> : <Check className="h-4 w-4" />}
          Aprobar plan
        </button>

        <button
          onClick={() => onRespond("reject")}
          disabled={isLoading}
          className="ql-btn-secondary disabled:opacity-50"
        >
          <X className="h-4 w-4" />
          Rechazar
        </button>

        {redirectOptions.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setShowRedirect(!showRedirect)}
              disabled={isLoading}
              className="ql-btn-ghost disabled:opacity-50"
            >
              <Zap className="h-4 w-4" />
              Redirigir a...
              <ChevronDown className="h-3 w-3" />
            </button>
            {showRedirect && (
              <div className="absolute top-full left-0 z-10 mt-1 w-56 ql-card p-1 shadow-md">
                {redirectOptions.map((opt) => {
                  const expert = EXPERTS.find((e) => e.id === opt.targetAgentId);
                  return (
                    <button
                      key={opt.id}
                      onClick={() => {
                        setShowRedirect(false);
                        onRespond("redirect", directive || undefined, opt.targetAgentId);
                      }}
                      className="ql-btn-ghost w-full justify-start text-xs py-2"
                    >
                      {expert && <ExpertAvatar expert={expert} size="sm" />}
                      <span>{expert?.name ?? opt.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Result Review ────────────────────────────────────────────────────────────

function ResultReview({
  result,
  onRespond,
  isLoading,
  redirectOptions,
}: {
  result: AgentResult;
  onRespond: CheckpointPanelProps["onRespond"];
  isLoading: boolean;
  redirectOptions: Checkpoint["options"];
}) {
  const [feedback, setFeedback] = useState("");
  const [showRedirect, setShowRedirect] = useState(false);

  const agentExpert = EXPERTS.find((e) => e.id === result.agentId);

  return (
    <div className="space-y-5">
      {/* Agent header */}
      <div className="flex items-center gap-3">
        {agentExpert && <ExpertAvatar expert={agentExpert} size="md" />}
        <div>
          <p className="ql-h3 text-sm">{result.agentName}</p>
          <p className="ql-caption">
            {new Date(result.timestamp).toLocaleTimeString("es-ES", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="ql-status-active" title="Análisis completo" />
        </div>
      </div>

      <div className="ql-divider-subtle" />

      {/* LLM metadata */}
      {result.content.metadata && (
        <div className="flex flex-wrap items-center gap-2">
          {result.content.metadata.model && (
            <span className="ql-badge-default inline-flex items-center gap-1">
              <Cpu className="h-3 w-3" />
              {result.content.metadata.model}
            </span>
          )}
          {result.content.metadata.skillsUsed && result.content.metadata.skillsUsed.length > 0 && (
            result.content.metadata.skillsUsed.map((skill: string) => (
              <span key={skill} className="ql-badge-accent inline-flex items-center gap-1">
                {skill === "research" && <Search className="h-3 w-3" />}
                {skill === "inspiration" && <BookOpen className="h-3 w-3" />}
                {skill === "cross-validation" && <Zap className="h-3 w-3" />}
                {skill}
              </span>
            ))
          )}
          <span className="ql-caption">
            {result.content.metadata.processingTimeMs}ms
          </span>
        </div>
      )}

      {/* Structured output */}
      <StructuredOutputRenderer output={result.content} />

      {/* Feedback for modify */}
      <div>
        <label className="ql-label block mb-2">
          Solicitar más detalle (opcional)
        </label>
        <input
          type="text"
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="Profundiza en el análisis financiero, añade ejemplos..."
          disabled={isLoading}
          className="ql-input disabled:opacity-40"
        />
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onRespond("approve")}
          disabled={isLoading}
          className="ql-btn-primary disabled:opacity-50"
        >
          {isLoading ? <span className="ql-status-thinking" /> : <Check className="h-4 w-4" />}
          Aprobar y guardar
        </button>

        <button
          onClick={() => onRespond("modify", feedback || "Proporciona más detalle")}
          disabled={isLoading || !feedback.trim()}
          className="ql-btn-secondary disabled:opacity-50"
        >
          <ArrowRight className="h-4 w-4" />
          Pedir más detalle
        </button>

        {redirectOptions.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setShowRedirect(!showRedirect)}
              disabled={isLoading}
              className="ql-btn-ghost disabled:opacity-50"
            >
              <Zap className="h-4 w-4" />
              Consultar otro agente
              <ChevronDown className="h-3 w-3" />
            </button>
            {showRedirect && (
              <div className="absolute top-full left-0 z-10 mt-1 w-56 ql-card p-1 shadow-md">
                {redirectOptions
                  .filter((o) => o.action === "redirect")
                  .map((opt) => {
                    const expert = EXPERTS.find((e) => e.id === opt.targetAgentId);
                    return (
                      <button
                        key={opt.id}
                        onClick={() => {
                          setShowRedirect(false);
                          onRespond("redirect", undefined, opt.targetAgentId);
                        }}
                        className="ql-btn-ghost w-full justify-start text-xs py-2"
                      >
                        {expert && <ExpertAvatar expert={expert} size="sm" />}
                        <span>{expert?.name ?? opt.label}</span>
                      </button>
                    );
                  })}
              </div>
            )}
          </div>
        )}

        <button
          onClick={() => onRespond("reject")}
          disabled={isLoading}
          className="ql-btn-ghost text-ql-danger hover:text-ql-danger disabled:opacity-50"
        >
          <X className="h-4 w-4" />
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CheckpointPanel({ checkpoint, onRespond, isLoading }: CheckpointPanelProps) {
  const redirectOptions = checkpoint.options.filter((o) => o.action === "redirect");

  return (
    <div className="ql-card-flat p-6">
      {checkpoint.phase === "plan_review" ? (
        <PlanReview
          plan={checkpoint.content as SupervisorPlan}
          onRespond={onRespond}
          isLoading={isLoading}
          redirectOptions={redirectOptions}
        />
      ) : (
        <ResultReview
          result={checkpoint.content as AgentResult}
          onRespond={onRespond}
          isLoading={isLoading}
          redirectOptions={redirectOptions}
        />
      )}
    </div>
  );
}
