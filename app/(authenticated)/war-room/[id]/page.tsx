"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowLeft,
  ExternalLink,
  Tag,
  Clock,
  Loader2,
  Zap,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Target,
  FlaskConical,
  TrendingUp,
  Shield,
  Palette,
  DollarSign,
  Rocket,
  Cog,
  Sparkles,
  ListChecks,
  Map,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface InboxItem {
  id: string;
  type: string;
  rawContent: string;
  sourceUrl: string | null;
  sourceTitle: string | null;
  status: string;
  tags: string[];
  createdAt: string;
  analysisResult: {
    summary: string;
    keyInsights: string[];
    suggestedTags: string[];
    category: string | null;
    relevanceScore: number;
    sentiment: string | null;
  } | null;
}

interface OrchestratorResult {
  analysisResult: {
    summary: string;
    keyInsights: string[];
    suggestedTags: string[];
    relevanceScore: number;
    sentiment: string | null;
  };
  agileTasks: Array<{
    id: string;
    title: string;
    priority: string;
    type: string;
    storyPoints: number | null;
    labels: string[];
  }>;
  roadmapTimeline: {
    id: string;
    title: string;
    phase: string;
    year: number;
    status: string;
  };
}

// ─── Agent Definitions ────────────────────────────────────────────────────────

type AgentStatus = "idle" | "analyzing" | "done";

const AGENTS = [
  {
    id: "lean",
    name: "Lean Strategist",
    specialty: "Propuesta de valor",
    icon: Target,
    color: "text-blue-500",
    bg: "bg-blue-50",
    border: "border-blue-100",
  },
  {
    id: "tech",
    name: "Tech Futurist",
    specialty: "Viabilidad técnica",
    icon: FlaskConical,
    color: "text-purple-500",
    bg: "bg-purple-50",
    border: "border-purple-100",
  },
  {
    id: "market",
    name: "Market Analyst",
    specialty: "Tamaño de mercado",
    icon: TrendingUp,
    color: "text-green-500",
    bg: "bg-green-50",
    border: "border-green-100",
  },
  {
    id: "risk",
    name: "Risk Assessor",
    specialty: "Riesgos críticos",
    icon: Shield,
    color: "text-red-500",
    bg: "bg-red-50",
    border: "border-red-100",
  },
  {
    id: "ux",
    name: "UX Visionary",
    specialty: "Experiencia de usuario",
    icon: Palette,
    color: "text-pink-500",
    bg: "bg-pink-50",
    border: "border-pink-100",
  },
  {
    id: "finance",
    name: "Financial Expert",
    specialty: "Modelo financiero",
    icon: DollarSign,
    color: "text-amber-500",
    bg: "bg-amber-50",
    border: "border-amber-100",
  },
  {
    id: "growth",
    name: "Growth Hacker",
    specialty: "Estrategia de crecimiento",
    icon: Rocket,
    color: "text-orange-500",
    bg: "bg-orange-50",
    border: "border-orange-100",
  },
  {
    id: "ops",
    name: "Operations Expert",
    specialty: "Planificación de ejecución",
    icon: Cog,
    color: "text-slate-500",
    bg: "bg-slate-50",
    border: "border-slate-100",
  },
];

const PRIORITY_LABELS: Record<string, { label: string; color: string }> = {
  critical: { label: "Must Have", color: "bg-red-100 text-red-700 border-red-200" },
  high: { label: "Should Have", color: "bg-orange-100 text-orange-700 border-orange-200" },
  medium: { label: "Could Have", color: "bg-blue-100 text-blue-700 border-blue-200" },
  low: { label: "Won't Have", color: "bg-gray-100 text-gray-600 border-gray-200" },
};

// ─── Agent Card ───────────────────────────────────────────────────────────────

function AgentCard({
  agent,
  status,
  delay,
}: {
  agent: (typeof AGENTS)[0];
  status: AgentStatus;
  delay: number;
}) {
  const Icon = agent.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: delay * 0.07, duration: 0.3 }}
      className={`relative rounded-xl border p-3.5 transition-all ${agent.bg} ${agent.border} ${
        status === "analyzing" ? "shadow-md" : ""
      }`}
    >
      {/* Analyzing glow ring */}
      {status === "analyzing" && (
        <motion.div
          className={`absolute inset-0 rounded-xl border-2 ${agent.border.replace("border-", "border-")}`}
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      <div className="flex items-start justify-between gap-2">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${agent.bg}`}>
          <Icon className={`h-4 w-4 ${agent.color}`} />
        </div>

        {/* Status indicator */}
        <div className="shrink-0">
          {status === "idle" && (
            <span className="h-2 w-2 rounded-full bg-gray-300 block mt-1" />
          )}
          {status === "analyzing" && (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            >
              <Loader2 className={`h-4 w-4 ${agent.color}`} />
            </motion.div>
          )}
          {status === "done" && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 15 }}
            >
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </motion.div>
          )}
        </div>
      </div>

      <div className="mt-2.5">
        <p className="text-xs font-semibold text-gray-900">{agent.name}</p>
        <p className="text-xs text-gray-500 mt-0.5">{agent.specialty}</p>
      </div>
    </motion.div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function WarRoomPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<InboxItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agentStatuses, setAgentStatuses] = useState<Record<string, AgentStatus>>(
    Object.fromEntries(AGENTS.map((a) => [a.id, "idle"]))
  );
  const [orchestrating, setOrchestrating] = useState(false);
  const [result, setResult] = useState<OrchestratorResult | null>(null);
  const [orchestrateError, setOrchestrateError] = useState<string | null>(null);

  useEffect(() => {
    async function loadItem() {
      try {
        const res = await fetch(`/api/inbox/${params.id}`);
        if (!res.ok) throw new Error("Not found");
        const data = await res.json();
        setItem(data);
        // If already analyzed, show results
        if (data.analysisResult) {
          setResult({ analysisResult: data.analysisResult, agileTasks: [], roadmapTimeline: null as any });
          setAgentStatuses(Object.fromEntries(AGENTS.map((a) => [a.id, "done"])));
        }
      } catch {
        setError("No se pudo cargar el item. Verifica que existe.");
      } finally {
        setLoading(false);
      }
    }
    loadItem();
  }, [params.id]);

  const handleOrchestrate = async () => {
    if (orchestrating) return;
    setOrchestrating(true);
    setOrchestrateError(null);
    setResult(null);

    // Animate agents sequentially
    const agentIds = AGENTS.map((a) => a.id);

    // Start all analyzing with staggered delays
    for (let i = 0; i < agentIds.length; i++) {
      setTimeout(() => {
        setAgentStatuses((prev) => ({ ...prev, [agentIds[i]]: "analyzing" }));
      }, i * 200);
    }

    try {
      // Wait a minimum of 2.5s for the animation to feel real
      const [res] = await Promise.all([
        fetch("/api/orchestrator", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ inboxItemId: params.id }),
        }),
        new Promise((resolve) => setTimeout(resolve, 2800)),
      ]);

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Orchestration failed");
      }

      const data = await res.json();

      // Mark agents as done sequentially
      for (let i = 0; i < agentIds.length; i++) {
        setTimeout(() => {
          setAgentStatuses((prev) => ({ ...prev, [agentIds[i]]: "done" }));
        }, i * 150);
      }

      // Update item status
      setItem((prev) => prev ? { ...prev, status: "analyzed" } : prev);
      setResult(data);
    } catch (err) {
      setOrchestrateError(err instanceof Error ? err.message : "Error al orquestar");
      setAgentStatuses(Object.fromEntries(AGENTS.map((a) => [a.id, "idle"])));
    } finally {
      setOrchestrating(false);
    }
  };

  const allDone = Object.values(agentStatuses).every((s) => s === "done");

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-950">
        <AlertCircle className="h-8 w-8 text-red-400" />
        <p className="text-sm text-gray-400">{error || "Item no encontrado"}</p>
        <Link href="/inbox" className="text-xs text-gray-500 hover:text-gray-300 underline">
          ← Volver al Inbox
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* ── Header ── */}
      <header className="sticky top-0 z-30 border-b border-gray-800/60 bg-gray-950/90 backdrop-blur-sm">
        <div className="flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <Link
              href="/inbox"
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Inbox
            </Link>
            <ChevronRight className="h-3.5 w-3.5 text-gray-700" />
            <span className="text-xs text-gray-400">War Room</span>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                item.status === "analyzed"
                  ? "bg-emerald-900/50 text-emerald-400 border border-emerald-800"
                  : item.status === "processing"
                  ? "bg-amber-900/50 text-amber-400 border border-amber-800"
                  : "bg-gray-800 text-gray-400 border border-gray-700"
              }`}
            >
              {item.status === "analyzed"
                ? "Validado"
                : item.status === "processing"
                ? "Procesando"
                : "Pendiente"}
            </span>
          </div>
        </div>
      </header>

      <div className="p-6">
        {/* ── Title row ── */}
        <div className="mb-6">
          <p className="mb-1 text-xs tracking-[0.15em] uppercase text-gray-600">
            War Room · Sala de Operaciones
          </p>
          <h1 className="font-serif text-2xl text-white">
            {item.sourceTitle || "Idea sin título"}
          </h1>
        </div>

        {/* ── Main Grid ── */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">

          {/* Left: Idea Content (2 cols) */}
          <div className="lg:col-span-2 space-y-4">
            <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-600">
                Idea Original
              </p>

              {item.sourceUrl && (
                <a
                  href={item.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mb-3 flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors truncate"
                >
                  <ExternalLink className="h-3 w-3 shrink-0" />
                  <span className="truncate">{item.sourceUrl}</span>
                </a>
              )}

              <p className="text-sm text-gray-300 leading-relaxed">
                {item.rawContent}
              </p>

              {item.tags.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {item.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 rounded-md border border-gray-700 bg-gray-800 px-2 py-0.5 text-xs text-gray-400"
                    >
                      <Tag className="h-2.5 w-2.5" />
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-4 flex items-center gap-1.5 text-xs text-gray-600">
                <Clock className="h-3 w-3" />
                {formatDistanceToNow(new Date(item.createdAt), {
                  addSuffix: true,
                  locale: es,
                })}
              </div>
            </div>

            {/* Orchestrate button / status */}
            {!result && (
              <button
                onClick={handleOrchestrate}
                disabled={orchestrating}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60 transition-all active:scale-95"
              >
                {orchestrating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Orquestando análisis…
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4" />
                    Activar Orquestador
                  </>
                )}
              </button>
            )}

            {orchestrateError && (
              <div className="flex items-center gap-2 rounded-xl border border-red-900 bg-red-950/50 px-4 py-3 text-xs text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {orchestrateError}
              </div>
            )}

            {allDone && result && (
              <div className="flex gap-2">
                <Link
                  href="/agile"
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-700 bg-gray-800 px-4 py-2.5 text-xs font-medium text-gray-300 hover:bg-gray-700 transition-colors"
                >
                  <ListChecks className="h-3.5 w-3.5" />
                  Ver Backlog
                </Link>
                <Link
                  href="/roadmap"
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-700 bg-gray-800 px-4 py-2.5 text-xs font-medium text-gray-300 hover:bg-gray-700 transition-colors"
                >
                  <Map className="h-3.5 w-3.5" />
                  Ver Roadmap
                </Link>
              </div>
            )}
          </div>

          {/* Right: Expert Panel (3 cols) */}
          <div className="lg:col-span-3">
            <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-5">
              <div className="mb-4 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-indigo-400" />
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                  Panel de Expertos
                </p>
                <span className="ml-auto text-xs text-gray-600">
                  {Object.values(agentStatuses).filter((s) => s === "done").length}/{AGENTS.length} completados
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
                {AGENTS.map((agent, i) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    status={agentStatuses[agent.id]}
                    delay={i}
                  />
                ))}
              </div>

              {/* Progress bar */}
              {orchestrating && (
                <div className="mt-4">
                  <div className="h-1 w-full overflow-hidden rounded-full bg-gray-800">
                    <motion.div
                      className="h-full bg-indigo-500 rounded-full"
                      initial={{ width: "0%" }}
                      animate={{
                        width: `${
                          (Object.values(agentStatuses).filter((s) => s !== "idle").length /
                            AGENTS.length) *
                          100
                        }%`,
                      }}
                      transition={{ duration: 0.4 }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Results ── */}
        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.3 }}
              className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3"
            >
              {/* Analysis Summary */}
              <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/30 p-5">
                <div className="mb-3 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400">
                    Análisis
                  </p>
                  <span className="ml-auto text-xs font-bold text-emerald-400">
                    {Math.round((result.analysisResult?.relevanceScore ?? 0) * 100)}%
                  </span>
                </div>
                <p className="text-sm text-gray-300 leading-relaxed mb-3">
                  {result.analysisResult?.summary}
                </p>
                {result.analysisResult?.keyInsights?.length > 0 && (
                  <ul className="space-y-1.5">
                    {result.analysisResult.keyInsights.map((insight, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-gray-400">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-emerald-500" />
                        {insight}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Agile Tasks */}
              <div className="rounded-xl border border-indigo-900/40 bg-indigo-950/30 p-5">
                <div className="mb-3 flex items-center gap-2">
                  <ListChecks className="h-4 w-4 text-indigo-400" />
                  <p className="text-xs font-semibold uppercase tracking-widest text-indigo-400">
                    Tasks Generadas
                  </p>
                </div>
                {result.agileTasks?.length > 0 ? (
                  <div className="space-y-2.5">
                    {result.agileTasks.map((task) => {
                      const p = PRIORITY_LABELS[task.priority] ?? PRIORITY_LABELS.medium;
                      return (
                        <div
                          key={task.id}
                          className="rounded-lg border border-gray-800 bg-gray-900/60 p-3"
                        >
                          <div className="mb-1 flex items-center gap-1.5 flex-wrap">
                            <span className={`rounded-md border px-1.5 py-0.5 text-xs font-medium ${p.color}`}>
                              {p.label}
                            </span>
                            {task.storyPoints && (
                              <span className="text-xs text-gray-600">
                                {task.storyPoints} pts
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-300">{task.title}</p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">
                    Tasks ya existentes en el Backlog.{" "}
                    <Link href="/agile" className="text-indigo-400 hover:underline">
                      Ver backlog →
                    </Link>
                  </p>
                )}
              </div>

              {/* Roadmap */}
              <div className="rounded-xl border border-violet-900/40 bg-violet-950/30 p-5">
                <div className="mb-3 flex items-center gap-2">
                  <Map className="h-4 w-4 text-violet-400" />
                  <p className="text-xs font-semibold uppercase tracking-widest text-violet-400">
                    Roadmap Generado
                  </p>
                </div>
                {result.roadmapTimeline ? (
                  <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-4">
                    <p className="text-sm font-semibold text-gray-200">
                      {result.roadmapTimeline.title}
                    </p>
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <span className="rounded-md border border-violet-800 bg-violet-900/40 px-2 py-0.5 text-xs text-violet-300 uppercase">
                        {result.roadmapTimeline.phase.toUpperCase()} {result.roadmapTimeline.year}
                      </span>
                      <span className="rounded-md border border-gray-700 px-2 py-0.5 text-xs text-gray-500 capitalize">
                        {result.roadmapTimeline.status}
                      </span>
                    </div>
                    <div className="mt-3">
                      <Link
                        href="/roadmap"
                        className="inline-flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 transition-colors"
                      >
                        Ver roadmap completo
                        <ChevronRight className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">
                    Timeline existente.{" "}
                    <Link href="/roadmap" className="text-violet-400 hover:underline">
                      Ver roadmap →
                    </Link>
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
