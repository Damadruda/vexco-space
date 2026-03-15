"use client";

import { useState } from "react";
import {
  Check, X, ChevronDown, Loader2, ArrowRight, Brain, Zap, BookOpen, Cpu, Search
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

const PRIORITY_STYLES: Record<string, string> = {
  high:   "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  low:    "bg-slate-100 text-slate-500",
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
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600">
          <Brain className="h-4 w-4 text-white" />
        </div>
        <div>
          <p className="text-xs font-semibold tracking-widest uppercase text-slate-400">
            Supervisor · Propuesta de Plan
          </p>
        </div>
        <span className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-medium ${PRIORITY_STYLES[plan.priority] ?? ""}`}>
          {plan.priority}
        </span>
      </div>

      {/* Analysis */}
      <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 space-y-2">
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Estado del proyecto</p>
        <p className="text-sm text-slate-700 leading-relaxed">{plan.analysis}</p>
      </div>

      {/* Proposed action */}
      <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 space-y-2">
        <p className="text-xs font-medium text-indigo-400 uppercase tracking-wider">Acción propuesta</p>
        <p className="text-sm font-medium text-indigo-900">{plan.proposedAction}</p>
        <p className="text-xs text-indigo-500">{plan.estimatedScope}</p>
      </div>

      {/* Target agent */}
      {targetExpert && (
        <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white px-4 py-3">
          <ExpertAvatar expert={targetExpert} size="md" />
          <div>
            <p className="text-sm font-medium text-slate-800">{targetExpert.name}</p>
            <p className="text-xs text-slate-400">{targetExpert.role}</p>
          </div>
          <p className="ml-auto text-xs text-slate-400 max-w-[140px] text-right leading-tight">
            {plan.reasoning}
          </p>
        </div>
      )}

      {/* Archetype (project new — no prior decisions) */}
      {plan.archetype && (
        <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 space-y-3">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-amber-500" />
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">
              Arquetipo detectado · {plan.archetype.name}
            </p>
          </div>
          <p className="text-xs text-amber-600 leading-relaxed">{plan.archetype.reasoning}</p>
          {/* Phases as horizontal pills */}
          <div className="flex flex-wrap gap-2">
            {plan.archetype.phases.map((phase) => (
              <span
                key={phase.order}
                title={phase.description}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  phase.name === plan.archetype!.currentPhase
                    ? "bg-amber-500 text-white"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {phase.order}. {phase.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Directive input */}
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">
          Directriz adicional al agente (opcional)
        </label>
        <input
          type="text"
          value={directive}
          onChange={(e) => setDirective(e.target.value)}
          placeholder="Enfócate en el mercado LatAm, prioriza ingresos a 30 días..."
          disabled={isLoading}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 disabled:opacity-40"
        />
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onRespond("approve", directive || undefined)}
          disabled={isLoading}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50 transition-colors"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Aprobar plan
        </button>

        <button
          onClick={() => onRespond("reject")}
          disabled={isLoading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
        >
          <X className="h-4 w-4" />
          Rechazar
        </button>

        {redirectOptions.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setShowRedirect(!showRedirect)}
              disabled={isLoading}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              <Zap className="h-4 w-4" />
              Redirigir a...
              <ChevronDown className="h-3 w-3" />
            </button>
            {showRedirect && (
              <div className="absolute top-full left-0 z-10 mt-1 w-56 rounded-xl border border-slate-200 bg-white shadow-lg py-1">
                {redirectOptions.map((opt) => {
                  const expert = EXPERTS.find((e) => e.id === opt.targetAgentId);
                  return (
                    <button
                      key={opt.id}
                      onClick={() => {
                        setShowRedirect(false);
                        onRespond("redirect", directive || undefined, opt.targetAgentId);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
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
          <p className="text-sm font-semibold text-slate-800">{result.agentName}</p>
          <p className="text-xs text-slate-400">
            {new Date(result.timestamp).toLocaleTimeString("es-ES", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-emerald-400" title="Análisis completo" />
        </div>
      </div>

      {/* LLM metadata */}
      {result.content.metadata && (
        <div className="flex flex-wrap items-center gap-2">
          {result.content.metadata.model && (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-500">
              <Cpu className="h-3 w-3" />
              {result.content.metadata.model}
            </span>
          )}
          {result.content.metadata.skillsUsed && result.content.metadata.skillsUsed.length > 0 && (
            result.content.metadata.skillsUsed.map((skill: string) => (
              <span
                key={skill}
                className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs text-indigo-600"
              >
                {skill === "research" && <Search className="h-3 w-3" />}
                {skill === "inspiration" && <BookOpen className="h-3 w-3" />}
                {skill === "cross-validation" && <Zap className="h-3 w-3" />}
                {skill}
              </span>
            ))
          )}
          <span className="text-xs text-slate-400">
            {result.content.metadata.processingTimeMs}ms
          </span>
        </div>
      )}

      {/* Structured output */}
      <StructuredOutputRenderer output={result.content} />

      {/* Feedback for modify */}
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">
          Solicitar más detalle (opcional)
        </label>
        <input
          type="text"
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="Profundiza en el análisis financiero, añade ejemplos concretos..."
          disabled={isLoading}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 disabled:opacity-40"
        />
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onRespond("approve")}
          disabled={isLoading}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50 transition-colors"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Aprobar y guardar
        </button>

        <button
          onClick={() => onRespond("modify", feedback || "Proporciona más detalle")}
          disabled={isLoading || !feedback.trim()}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
        >
          <ArrowRight className="h-4 w-4" />
          Pedir más detalle
        </button>

        {redirectOptions.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setShowRedirect(!showRedirect)}
              disabled={isLoading}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              <Zap className="h-4 w-4" />
              Consultar otro agente
              <ChevronDown className="h-3 w-3" />
            </button>
            {showRedirect && (
              <div className="absolute top-full left-0 z-10 mt-1 w-56 rounded-xl border border-slate-200 bg-white shadow-lg py-1">
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
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
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
          className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
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
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
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
