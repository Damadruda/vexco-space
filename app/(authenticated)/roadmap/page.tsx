"use client";

import { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/ui/header";
import {
  Loader2,
  RefreshCw,
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock,
  XCircle,
  ChevronRight,
  Milestone,
  Map,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MilestoneItem {
  name: string;
  date: string;
}

interface RoadmapTimeline {
  id: string;
  title: string;
  description: string | null;
  phase: string;
  year: number;
  status: string;
  startDate: string | null;
  endDate: string | null;
  milestones: MilestoneItem[] | null;
  color: string | null;
  createdAt: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const PHASE_ORDER = ["q1", "q2", "q3", "q4"];
const PHASE_LABELS: Record<string, string> = {
  q1: "Q1 · Ene–Mar",
  q2: "Q2 · Abr–Jun",
  q3: "Q3 · Jul–Sep",
  q4: "Q4 · Oct–Dic",
};

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string; bg: string; border: string }> = {
  planned: {
    label: "Planificado",
    icon: Clock,
    color: "text-blue-600",
    bg: "bg-blue-50",
    border: "border-blue-200",
  },
  in_progress: {
    label: "En progreso",
    icon: RefreshCw,
    color: "text-amber-600",
    bg: "bg-amber-50",
    border: "border-amber-200",
  },
  completed: {
    label: "Completado",
    icon: CheckCircle2,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
  },
  cancelled: {
    label: "Cancelado",
    icon: XCircle,
    color: "text-gray-400",
    bg: "bg-gray-50",
    border: "border-gray-200",
  },
};

// ─── Timeline Card ─────────────────────────────────────────────────────────────

function TimelineCard({ item }: { item: RoadmapTimeline }) {
  const statusCfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.planned;
  const StatusIcon = statusCfg.icon;
  const accentColor = item.color ?? "#6366f1";

  const formatDate = (d: string | null) => {
    if (!d) return null;
    return new Date(d).toLocaleDateString("es-ES", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <div
      className={`relative overflow-hidden rounded-xl border bg-white shadow-sm transition-all hover:shadow-md ${statusCfg.border}`}
    >
      {/* Color accent stripe */}
      <div
        className="absolute left-0 top-0 h-full w-1 rounded-l-xl"
        style={{ backgroundColor: accentColor }}
      />

      <div className="pl-5 pr-4 py-4">
        {/* Header */}
        <div className="mb-2 flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-900 leading-snug">
            {item.title}
          </h3>
          <span
            className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${statusCfg.bg} ${statusCfg.color} border ${statusCfg.border}`}
          >
            <StatusIcon className="h-3 w-3" />
            {statusCfg.label}
          </span>
        </div>

        {/* Description */}
        {item.description && (
          <p className="mb-3 text-xs text-gray-500 leading-relaxed line-clamp-2">
            {item.description}
          </p>
        )}

        {/* Dates */}
        {(item.startDate || item.endDate) && (
          <div className="mb-3 flex items-center gap-2 text-xs text-gray-500">
            <CalendarDays className="h-3.5 w-3.5 text-gray-400" />
            <span>
              {formatDate(item.startDate)} {item.startDate && item.endDate && "→"} {formatDate(item.endDate)}
            </span>
          </div>
        )}

        {/* Progress bar (visual only) */}
        {item.status !== "cancelled" && (
          <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full transition-all"
              style={{
                backgroundColor: accentColor,
                width:
                  item.status === "completed"
                    ? "100%"
                    : item.status === "in_progress"
                    ? "50%"
                    : "5%",
              }}
            />
          </div>
        )}

        {/* Milestones */}
        {Array.isArray(item.milestones) && item.milestones.length > 0 && (
          <div className="space-y-1.5">
            <p className="flex items-center gap-1 text-xs font-medium text-gray-500">
              <Milestone className="h-3 w-3" />
              Milestones
            </p>
            {item.milestones.map((m, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <ChevronRight className="h-3 w-3 text-gray-300 shrink-0" />
                <span className="text-gray-600 flex-1 truncate">{m.name}</span>
                {m.date && (
                  <span className="shrink-0 text-gray-400">
                    {new Date(m.date).toLocaleDateString("es-ES", {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RoadmapPage() {
  const [timelines, setTimelines] = useState<RoadmapTimeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  const fetchTimelines = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/roadmap?year=${selectedYear}`);
      if (!res.ok) throw new Error("Failed");
      const { timelines: data } = await res.json();
      setTimelines(data);
    } catch {
      setError("No se pudo cargar el roadmap.");
    } finally {
      setLoading(false);
    }
  }, [selectedYear]);

  useEffect(() => {
    fetchTimelines();
  }, [fetchTimelines]);

  // Group by phase
  const byPhase = PHASE_ORDER.reduce<Record<string, RoadmapTimeline[]>>((acc, phase) => {
    acc[phase] = timelines.filter((t) => t.phase === phase);
    return acc;
  }, {});

  // Custom phases
  const customPhases = timelines.filter((t) => !PHASE_ORDER.includes(t.phase));

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() + i - 1);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="Roadmap" subtitle="V4 · Timeline estratégico" />

      <div className="p-6">
        {/* Top bar */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Map className="h-4 w-4 text-gray-400" />
            <p className="text-sm text-gray-500">
              <span className="font-semibold text-gray-900">{timelines.length}</span> ítems en{" "}
              <span className="font-semibold text-gray-900">{selectedYear}</span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Year selector */}
            <div className="flex rounded-lg border border-gray-200 bg-white overflow-hidden">
              {years.map((y) => (
                <button
                  key={y}
                  onClick={() => setSelectedYear(y)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    selectedYear === y
                      ? "bg-gray-900 text-white"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {y}
                </button>
              ))}
            </div>
            <button
              onClick={fetchTimelines}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-32">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : timelines.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 py-24 text-center">
            <Map className="mb-3 h-10 w-10 text-gray-300" />
            <p className="text-sm font-medium text-gray-500">Sin ítems en {selectedYear}</p>
            <p className="mt-1 text-xs text-gray-400">
              Activa el Orquestador en el War Room para generar el roadmap automáticamente.
            </p>
          </div>
        ) : (
          <div className="space-y-10">
            {/* Quarterly timeline */}
            {PHASE_ORDER.map((phase) => {
              const items = byPhase[phase];
              if (items.length === 0) return null;
              return (
                <div key={phase}>
                  {/* Phase header */}
                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900">
                      <span className="text-xs font-bold text-white">
                        {phase.toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <h2 className="font-serif text-lg text-gray-900">
                        {PHASE_LABELS[phase]} · {selectedYear}
                      </h2>
                      <p className="text-xs text-gray-400">{items.length} ítem{items.length !== 1 ? "s" : ""}</p>
                    </div>
                    {/* Connector line */}
                    <div className="flex-1 h-px bg-gray-200 ml-2" />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {items.map((item) => (
                      <TimelineCard key={item.id} item={item} />
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Custom phases */}
            {customPhases.length > 0 && (
              <div>
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
                    <span className="text-xs font-bold text-white">∞</span>
                  </div>
                  <h2 className="font-serif text-lg text-gray-900">Fases personalizadas</h2>
                  <div className="flex-1 h-px bg-gray-200 ml-2" />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {customPhases.map((item) => (
                    <TimelineCard key={item.id} item={item} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
