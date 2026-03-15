"use client";

import type { StructuredOutput, OutputSection } from "@/lib/engine/types";

// ─── MoSCoW Badge ────────────────────────────────────────────────────────────

const MOSCOW_CLASSES: Record<string, string> = {
  must:   "ql-moscow-must",
  should: "ql-moscow-should",
  could:  "ql-moscow-could",
  wont:   "ql-moscow-wont",
};

function MoSCoWBadge({ priority }: { priority?: string }) {
  if (!priority) return null;
  const cls = MOSCOW_CLASSES[priority];
  if (!cls) return null;
  const labels: Record<string, string> = { must: "Must", should: "Should", could: "Could", wont: "Won't" };
  return <span className={cls}>{labels[priority] ?? priority}</span>;
}

// ─── Type Badge ───────────────────────────────────────────────────────────────

const TYPE_CLASSES: Record<string, string> = {
  analysis:       "ql-badge-accent",
  recommendation: "ql-badge-success",
  action_plan:    "ql-badge-warning",
  risk_assessment:"ql-badge-danger",
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
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="ql-h3 text-base">{section.heading}</h3>
        <MoSCoWBadge priority={section.priority} />
      </div>
      <p className="ql-body leading-relaxed">{section.content}</p>
      {section.items && section.items.length > 0 && (
        <ul className="space-y-1.5 pt-1">
          {section.items.map((item, i) => (
            <li key={i} className="flex items-start gap-2 ql-body">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ql-accent" />
              {item}
            </li>
          ))}
        </ul>
      )}
      <div className="ql-divider-subtle" />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function StructuredOutputRenderer({ output }: { output: StructuredOutput }) {
  const typeClass = TYPE_CLASSES[output.type] ?? "ql-badge-default";
  const typeLabel = TYPE_LABELS[output.type] ?? output.type;

  const confidence = output.metadata?.confidenceScore
    ? Math.round(output.metadata.confidenceScore * 100)
    : null;
  const timeSeconds = output.metadata?.processingTimeMs
    ? (output.metadata.processingTimeMs / 1000).toFixed(1)
    : null;

  return (
    <div className="ql-card p-8 space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <span className={typeClass}>{typeLabel}</span>
        <h2 className="ql-h2 flex-1">{output.title}</h2>
      </div>

      {/* Summary */}
      <div className="border-l-2 border-ql-accent pl-4">
        <p className="ql-body text-base leading-relaxed">{output.summary}</p>
      </div>

      {/* Sections */}
      {output.sections?.map((section, i) => (
        <SectionCard key={i} section={section} />
      ))}

      {/* Metadata footer */}
      {output.metadata && (
        <p className="ql-caption text-right pt-1">
          {output.metadata.model}
          {timeSeconds && ` · ${timeSeconds}s`}
          {confidence && ` · ${confidence}% confianza`}
        </p>
      )}
    </div>
  );
}
