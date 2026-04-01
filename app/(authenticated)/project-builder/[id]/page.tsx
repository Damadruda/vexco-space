"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Swords, FileText, Inbox, ArrowRight, FolderOpen } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProjectSummary {
  project: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    projectType: string;
    concept: string | null;
    targetMarket: string | null;
    businessModel: string | null;
    valueProposition: string | null;
    conceptStatus: string;
    marketStatus: string;
    businessStatus: string;
    executionStatus: string;
    driveFolderId: string | null;
    trackType: string;
    createdAt: string;
    updatedAt: string;
  };
  taskStats: {
    total: number;
    backlog: number;
    inProgress: number;
    review: number;
    done: number;
  };
  warRoomInsights: Array<{
    agentId: string;
    agentName: string | null;
    lastMessage: string;
    lastActivity: string;
  }>;
  inboxItems: Array<{
    id: string;
    sourceTitle: string | null;
    sourceUrl: string | null;
    status: string;
    tags: string[];
  }>;
  driveDocs: Array<{
    id: string;
    fileName: string;
    fileType: string;
    summary: string;
    category: string | null;
  }>;
  documents: Array<{
    id: string;
    title: string;
    format: string;
    documentType: string;
    feedbackRating: number | null;
    createdAt: string;
  }>;
}

// ─── Agent display config ─────────────────────────────────────────────────────

const AGENT_DISPLAY: Record<string, { initials: string; label: string; color: string }> = {
  strategist: { initials: "ST", label: "Strategist", color: "bg-[#1A1A1A] text-white" },
  revenue: { initials: "RG", label: "Revenue & Growth", color: "bg-[#B8860B]/15 text-[#B8860B]" },
  infrastructure: { initials: "PT", label: "Product & Tech", color: "bg-[#6B6B6B]/15 text-[#6B6B6B]" },
  redteam: { initials: "CH", label: "Challenger", color: "bg-red-100 text-red-700" },
  design: { initials: "DX", label: "Design & Experience", color: "bg-violet-100 text-violet-700" },
};

// ─── Relative time ────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "ayer";
  if (days < 7) return `hace ${days}d`;
  return new Date(dateStr).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: string }) {
  const color =
    status === "GREEN" ? "bg-emerald-500" : status === "YELLOW" ? "bg-amber-400" : "bg-[#CCC]";
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      <div className="h-8 bg-[#E8E4DE]/60 rounded w-1/3" />
      <div className="h-4 bg-[#E8E4DE]/40 rounded w-1/4" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 bg-[#E8E4DE]/30 rounded-lg" />
        ))}
      </div>
      <div className="h-40 bg-[#E8E4DE]/20 rounded-lg" />
      <div className="h-32 bg-[#E8E4DE]/20 rounded-lg" />
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ProjectOverviewPage() {
  const params = useParams();
  const router = useRouter();
  const [data, setData] = useState<ProjectSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!params?.id) return;
    fetch(`/api/projects/${params.id}/summary`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [params?.id]);

  if (loading) return <Skeleton />;
  if (!data) {
    return (
      <div className="p-6 text-center text-[#6B6B6B]">
        Proyecto no encontrado.
      </div>
    );
  }

  const { project, taskStats, warRoomInsights, inboxItems, driveDocs, documents } = data;

  const hasWarRoom = warRoomInsights.length > 0;
  const hasTasks = taskStats.total > 0;
  const hasDiagnosis = !!(project.concept || project.targetMarket || project.businessModel);
  const hasInbox = inboxItems.length > 0;
  const hasDocs = driveDocs.length > 0 || documents.length > 0;
  const isEmpty = !hasWarRoom && !hasTasks && !hasDiagnosis && !hasInbox && !hasDocs;

  const TYPE_LABELS: Record<string, string> = {
    idea: "Idea",
    active: "Activo",
    operational: "Operacional",
    completed: "Completado",
  };

  return (
    <div className="bg-[#FAFAF8] min-h-screen">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* ── SECTION 1: Header ──────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="min-w-0">
            <h1
              className="text-2xl sm:text-3xl font-semibold text-[#1A1A1A] leading-tight"
              style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}
            >
              {project.title}
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className="border border-[#E8E4DE] text-[10px] px-2 py-0.5 rounded text-[#6B6B6B] uppercase tracking-wider">
                {TYPE_LABELS[project.status] || project.status}
              </span>
              <span className="border border-[#E8E4DE] text-[10px] px-2 py-0.5 rounded text-[#6B6B6B]">
                {project.projectType}
              </span>
              {project.trackType && project.trackType !== "GO_TO_MARKET" && (
                <span className="border border-[#E8E4DE] text-[10px] px-2 py-0.5 rounded text-[#6B6B6B]">
                  {project.trackType.replace(/_/g, " ")}
                </span>
              )}
            </div>
            {project.description && (
              <p className="text-sm text-[#6B6B6B] mt-2 max-w-xl leading-relaxed">
                {project.description}
              </p>
            )}
            <p className="text-[#999] text-xs mt-2">
              Creado {new Date(project.createdAt).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}
              {" · "}
              Actualizado {timeAgo(project.updatedAt)}
            </p>
          </div>
          <button
            onClick={() => router.push(`/project-builder/${project.id}/war-room`)}
            className="shrink-0 inline-flex items-center gap-2 border border-[#B8860B] text-[#B8860B] hover:bg-[#B8860B]/5 px-4 py-2 rounded text-sm font-medium transition-colors"
          >
            <Swords className="h-4 w-4" />
            Abrir War Room
          </button>
        </div>

        {/* ── Empty state ────────────────────────────────────────────── */}
        {isEmpty && (
          <div className="bg-white border border-[#E8E4DE] rounded-lg p-8 text-center">
            <p
              className="text-lg font-semibold text-[#1A1A1A] mb-2"
              style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}
            >
              Este proyecto está empezando
            </p>
            <p className="text-sm text-[#6B6B6B] max-w-md mx-auto mb-4">
              Abre el War Room para que los agentes analicen tu información y generen un plan de acción.
            </p>
            <button
              onClick={() => router.push(`/project-builder/${project.id}/war-room`)}
              className="inline-flex items-center gap-2 border border-[#B8860B] text-[#B8860B] hover:bg-[#B8860B]/5 px-5 py-2.5 rounded text-sm font-medium transition-colors"
            >
              <Swords className="h-4 w-4" />
              Iniciar en War Room
            </button>
          </div>
        )}

        {/* ── SECTION 2: Task Stats ──────────────────────────────────── */}
        {hasTasks && (
          <div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Backlog", value: taskStats.backlog, bg: "bg-[#F3F2F0]", accent: "text-[#6B6B6B]" },
                { label: "En progreso", value: taskStats.inProgress + taskStats.review, bg: "bg-[#B8860B]/5", accent: "text-[#B8860B]" },
                { label: "Completadas", value: taskStats.done, bg: "bg-emerald-50", accent: "text-emerald-700" },
                { label: "Total", value: taskStats.total, bg: "bg-white", accent: "text-[#1A1A1A]" },
              ].map((card) => (
                <Link
                  key={card.label}
                  href={`/project-builder/${project.id}/agile`}
                  className={`${card.bg} border border-[#E8E4DE] rounded-lg p-4 hover:border-[#B8860B]/40 transition-colors`}
                >
                  <p className={`text-2xl font-semibold ${card.accent}`}>{card.value}</p>
                  <p className="text-xs uppercase tracking-wider text-[#6B6B6B] mt-1">{card.label}</p>
                </Link>
              ))}
            </div>
          </div>
        )}

        {!hasTasks && !isEmpty && (
          <div className="bg-white border border-[#E8E4DE] rounded-lg p-5">
            <p className="text-sm text-[#6B6B6B]">
              Sin tareas — el War Room puede generar un plan con Sprint 0.
            </p>
          </div>
        )}

        {/* ── SECTION 3: Diagnóstico ─────────────────────────────────── */}
        {hasDiagnosis && (
          <div className="bg-white border border-[#E8E4DE] rounded-lg p-5">
            <h2
              className="text-lg font-semibold text-[#1A1A1A] border-b border-[#E8E4DE] pb-2 mb-4"
              style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}
            >
              Diagnóstico
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { label: "Concepto", value: project.concept, status: project.conceptStatus },
                { label: "Mercado", value: project.targetMarket, status: project.marketStatus },
                { label: "Modelo de negocio", value: project.businessModel, status: project.businessStatus },
                { label: "Propuesta de valor", value: project.valueProposition, status: project.executionStatus },
              ]
                .filter((d) => d.value)
                .map((d) => (
                  <div key={d.label} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <StatusDot status={d.status} />
                      <span className="text-xs uppercase tracking-wider text-[#6B6B6B]">{d.label}</span>
                    </div>
                    <p className="text-sm text-[#1A1A1A] leading-relaxed line-clamp-4">{d.value}</p>
                  </div>
                ))}
            </div>
          </div>
        )}

        {!hasDiagnosis && !isEmpty && (
          <div className="bg-white border border-[#E8E4DE] rounded-lg p-5">
            <h2
              className="text-lg font-semibold text-[#1A1A1A] border-b border-[#E8E4DE] pb-2 mb-4"
              style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}
            >
              Diagnóstico
            </h2>
            <p className="text-sm text-[#6B6B6B] mb-3">
              Sin diagnóstico aún. Inicia un análisis con el Strategist.
            </p>
            <button
              onClick={() => router.push(`/project-builder/${project.id}/war-room`)}
              className="inline-flex items-center gap-1.5 text-sm border border-[#B8860B] text-[#B8860B] hover:bg-[#B8860B]/5 px-3 py-1.5 rounded transition-colors"
            >
              <ArrowRight className="h-3.5 w-3.5" />
              Ir al War Room
            </button>
          </div>
        )}

        {/* ── SECTION 4: War Room Insights ────────────────────────────── */}
        {hasWarRoom && (
          <div className="bg-white border border-[#E8E4DE] rounded-lg p-5">
            <h2
              className="text-lg font-semibold text-[#1A1A1A] border-b border-[#E8E4DE] pb-2 mb-4"
              style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}
            >
              War Room
            </h2>
            <div className="space-y-3">
              {warRoomInsights.map((insight) => {
                const display = AGENT_DISPLAY[insight.agentId] || {
                  initials: (insight.agentId || "??").slice(0, 2).toUpperCase(),
                  label: insight.agentName || insight.agentId,
                  color: "bg-[#E8E4DE] text-[#6B6B6B]",
                };
                return (
                  <Link
                    key={insight.agentId}
                    href={`/project-builder/${project.id}/war-room`}
                    className="flex gap-3 p-3 -mx-1 rounded-md hover:bg-[#FAFAF8] transition-colors group"
                  >
                    <div
                      className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-semibold ${display.color}`}
                    >
                      {display.initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-medium text-[#1A1A1A]">{display.label}</span>
                        <span className="text-[#999] text-xs">{timeAgo(insight.lastActivity)}</span>
                      </div>
                      <p className="text-sm text-[#6B6B6B] leading-relaxed line-clamp-2">
                        {insight.lastMessage.replace(/[#*_~`]/g, "")}
                      </p>
                    </div>
                    <ArrowRight className="shrink-0 h-4 w-4 text-[#CCC] group-hover:text-[#B8860B] mt-2.5 transition-colors" />
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {!hasWarRoom && !isEmpty && (
          <div className="bg-white border border-[#E8E4DE] rounded-lg p-5">
            <h2
              className="text-lg font-semibold text-[#1A1A1A] border-b border-[#E8E4DE] pb-2 mb-4"
              style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}
            >
              War Room
            </h2>
            <p className="text-sm text-[#6B6B6B]">
              Sin actividad en el War Room. Inicia una consulta.
            </p>
          </div>
        )}

        {/* ── SECTION 5: Inbox vinculado ──────────────────────────────── */}
        {hasInbox && (
          <div className="bg-white border border-[#E8E4DE] rounded-lg p-5">
            <h2
              className="text-lg font-semibold text-[#1A1A1A] border-b border-[#E8E4DE] pb-2 mb-4"
              style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}
            >
              <Inbox className="inline h-4 w-4 mr-2 text-[#6B6B6B]" />
              Inbox vinculado
            </h2>
            <div className="space-y-2">
              {inboxItems.map((item) => (
                <div key={item.id} className="flex items-center gap-3 text-sm">
                  <span className="text-[#1A1A1A] truncate flex-1">
                    {item.sourceTitle || "Sin título"}
                  </span>
                  <div className="flex gap-1 shrink-0">
                    {item.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="border border-[#E8E4DE] text-[10px] px-1.5 py-0.5 rounded text-[#6B6B6B]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── SECTION 6: Documentos ───────────────────────────────────── */}
        {hasDocs && (
          <div className="bg-white border border-[#E8E4DE] rounded-lg p-5">
            <h2
              className="text-lg font-semibold text-[#1A1A1A] border-b border-[#E8E4DE] pb-2 mb-4"
              style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}
            >
              <FileText className="inline h-4 w-4 mr-2 text-[#6B6B6B]" />
              Documentos
            </h2>
            <div className="space-y-2">
              {driveDocs.map((doc) => (
                <div key={doc.id} className="flex items-center gap-3 text-sm">
                  <FolderOpen className="h-3.5 w-3.5 text-[#6B6B6B] shrink-0" />
                  <span className="text-[#1A1A1A] truncate flex-1">{doc.fileName}</span>
                  <span className="border border-[#E8E4DE] text-[10px] px-1.5 py-0.5 rounded text-[#6B6B6B]">
                    {doc.fileType}
                  </span>
                  {doc.category && (
                    <span className="border border-[#E8E4DE] text-[10px] px-1.5 py-0.5 rounded text-[#6B6B6B]">
                      {doc.category}
                    </span>
                  )}
                </div>
              ))}
              {documents.map((doc) => (
                <div key={doc.id} className="flex items-center gap-3 text-sm">
                  <FileText className="h-3.5 w-3.5 text-[#B8860B] shrink-0" />
                  <span className="text-[#1A1A1A] truncate flex-1">{doc.title}</span>
                  <span className="border border-[#E8E4DE] text-[10px] px-1.5 py-0.5 rounded text-[#6B6B6B] uppercase">
                    {doc.format}
                  </span>
                  <span className="text-[#999] text-xs">{timeAgo(doc.createdAt)}</span>
                  {doc.feedbackRating && (
                    <span className="text-[10px] text-[#B8860B]">{doc.feedbackRating}/5</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
