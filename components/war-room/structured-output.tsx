"use client";

import type { StructuredOutput, OutputSection } from "@/lib/engine/types";

// ─── MoSCoW Badge ────────────────────────────────────────────────────────────

const MOSCOW_STYLES: Record<string, { label: string; style: string }> = {
  must:   { label: "Must",   style: "bg-red-100 text-red-700 border border-red-200" },
  should: { label: "Should", style: "bg-orange-100 text-orange-700 border border-orange-200" },
  could:  { label: "Could",  style: "bg-blue-100 text-blue-700 border border-blue-200" },
  wont:   { label: "Won't",  style: "bg-slate-100 text-slate-500 border border-slate-200" },
};

function MoSCoWBadge({ priority }: { priority?: string }) {
  if (!priority) return null;
  const cfg = MOSCOW_STYLES[priority];
  if (!cfg) return null;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cfg.style}`}>
      {cfg.label}
    </span>
  );
}

// ─── Type Badge ───────────────────────────────────────────────────────────────

const TYPE_STYLES: Record<string, string> = {
  analysis:       "bg-indigo-100 text-indigo-700",
  recommendation: "bg-emerald-100 text-emerald-700",
  action_plan:    "bg-amber-100 text-amber-700",
  risk_assessment:"bg-red-100 text-red-700",
};

const TYPE_LABELS: Record<string, string> = {
  analysis:        "Análisis",
  recommendation:  "Recomendación",
  action_plan:     "Plan de Acción",
  risk_assessment: "Evaluación de Riesgo",
};

// ─── Section Card ─────────────────────────────────────────────────────────────

function SectionCard({ section }: { section: OutputSection }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-slate-800 text-sm">{section.heading}</h3>
        <MoSCoWBadge priority={section.priority} />
      </div>
      <p className="text-sm text-slate-600 leading-relaxed">{section.content}</p>
      {section.items && section.items.length > 0 && (
        <ul className="space-y-1.5 pt-1">
          {section.items.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function StructuredOutputRenderer({ output }: { output: StructuredOutput }) {
  const typeStyle = TYPE_STYLES[output.type] ?? "bg-slate-100 text-slate-600";
  const typeLabel = TYPE_LABELS[output.type] ?? output.type;

  const confidence = output.metadata?.confidenceScore
    ? Math.round(output.metadata.confidenceScore * 100)
    : null;
  const timeSeconds = output.metadata?.processingTimeMs
    ? (output.metadata.processingTimeMs / 1000).toFixed(1)
    : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${typeStyle}`}>
          {typeLabel}
        </span>
        <h2 className="text-base font-bold text-slate-900 leading-snug">{output.title}</h2>
      </div>

      {/* Summary */}
      <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700 leading-relaxed border border-slate-100">
        {output.summary}
      </p>

      {/* Sections */}
      {output.sections?.map((section, i) => (
        <SectionCard key={i} section={section} />
      ))}

      {/* Metadata footer */}
      {output.metadata && (
        <p className="text-xs text-slate-400 text-right pt-1">
          {output.metadata.model}
          {timeSeconds && ` · ${timeSeconds}s`}
          {confidence && ` · ${confidence}% confianza`}
        </p>
      )}
    </div>
  );
}
