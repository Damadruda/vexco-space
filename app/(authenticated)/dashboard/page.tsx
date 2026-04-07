"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/ui/header";
import { StatCard } from "@/components/ui/stat-card";
import { KanbanBoard } from "@/components/ui/kanban-board";
import { FolderKanban, Lightbulb, FileText, Link as LinkIcon, Image as ImageIcon, TrendingUp, ArrowRight, Swords, CloudDownload, Plus, Inbox, Sparkles, Check, X, AlertTriangle, Flame, Clock, CircleDot, CheckSquare, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DriveFolderAnalyzer } from "@/components/ui/drive-folder-analyzer";
import { PROJECT_TYPES, PROJECT_TYPE_ORDER, ProjectType } from "@/lib/project-types";

interface Stats {
  totalProjects: number;
  projectsByStatus: {
    idea: number;
    development: number;
    execution: number;
    completed: number;
  };
  projectsByType: {
    idea: number;
    active: number;
    operational: number;
    completed: number;
  };
  totalNotes: number;
  totalLinks: number;
  totalImages: number;
  totalContent: number;
  tasksByProject?: Record<string, { total: number; done: number }>;
  inboxTotal?: number;
  inboxUnprocessed?: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDriveAnalyzer, setShowDriveAnalyzer] = useState(false);
  const [driveImportSuccess, setDriveImportSuccess] = useState<{ projectId: string } | null>(null);
  const [revenueData, setRevenueData] = useState<{
    projects: Array<{
      id: string;
      title: string;
      status: string;
      revenueProximityScore: number | null;
      revenueProximityReason: string | null;
      stepsToRevenue: number | null;
      stepsToRevenueDetail: string | null;
      estimatedRevenueDate: string | null;
      revenueLastAssessedAt: string | null;
    }>;
    alerts: Array<{
      projectId: string;
      projectTitle: string;
      message: string;
      severity: "high" | "medium" | "low";
    }>;
  } | null>(null);
  const router = useRouter();

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch("/api/stats");
        const data = await res.json();
        setStats(data?.stats);
      } catch (error) {
        console.error("Error fetching stats:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();

    async function fetchRevenue() {
      try {
        const res = await fetch("/api/projects/revenue-ranking");
        const data = await res.json();
        if (data?.projects) setRevenueData(data);
      } catch (error) {
        console.error("Error fetching revenue ranking:", error);
      }
    }
    fetchRevenue();
  }, []);

  return (
    <div className="ql-page">
      <Header title="Dashboard" subtitle="Vista general" />

      {/* Drive Folder Analyzer Modal */}
      <DriveFolderAnalyzer
        isOpen={showDriveAnalyzer}
        onClose={() => setShowDriveAnalyzer(false)}
        onProjectCreated={(projectId) => {
          setDriveImportSuccess({ projectId });
          setTimeout(() => setDriveImportSuccess(null), 8000);
        }}
      />

      {/* Drive import success banner */}
      {driveImportSuccess && (
        <div className="mx-8 mt-4 flex items-center justify-between gap-3 bg-green-50 border border-green-200 px-4 py-3 rounded-lg">
          <div className="flex items-center gap-2 text-green-800">
            <Check className="h-4 w-4 shrink-0" />
            <span className="text-sm font-medium">Proyecto importado desde Drive</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push(`/project-builder/${driveImportSuccess.projectId}/war-room`)}
              className="text-xs font-medium text-green-700 underline underline-offset-2 hover:text-green-900"
            >
              Ir al War Room
            </button>
            <button
              onClick={() => setDriveImportSuccess(null)}
              className="text-green-400 hover:text-green-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      <div className="p-8 space-y-10">
        <div className="flex flex-wrap items-center justify-end gap-3">
          <div className="flex flex-wrap gap-3">
            <Link href="/project-builder/new" className="ql-btn-primary">
              <Plus className="h-4 w-4" />
              Nuevo Proyecto
            </Link>
            <button
              onClick={() => setShowDriveAnalyzer(true)}
              className="ql-btn-secondary"
            >
              <CloudDownload className="h-4 w-4" />
              Importar desde Drive
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        {loading ? (
          <div className="flex justify-center py-12">
            <span className="ql-status-thinking mr-2" />
            <span className="ql-loading">Cargando estadísticas...</span>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="ql-card-flat">
              <StatCard
                title="Proyectos Totales"
                value={stats?.totalProjects ?? 0}
                icon={FolderKanban}
                number="01"
              />
            </div>
            <div className="ql-card-flat">
              <StatCard
                title="Ideas Capturadas"
                value={stats?.projectsByStatus?.idea ?? 0}
                icon={Lightbulb}
                number="02"
              />
            </div>
            <div className="ql-card-flat">
              <StatCard
                title="En Ejecución"
                value={(stats?.projectsByStatus?.development ?? 0) + (stats?.projectsByStatus?.execution ?? 0)}
                icon={TrendingUp}
                number="03"
              />
            </div>
            <div className="ql-card-flat">
              <StatCard
                title="Completados"
                value={stats?.projectsByStatus?.completed ?? 0}
                icon={FolderKanban}
                number="04"
              />
            </div>
          </div>
        )}

        {/* Revenue Priority — Focus Section */}
        {revenueData && (revenueData.alerts.length > 0 || revenueData.projects.some(p => p.revenueProximityScore != null)) && (
          <div>
            <p className="ql-label mb-2">Proximidad a facturación</p>
            <h3 className="ql-h3 mb-4">Foco de facturación</h3>

            {/* Alerts */}
            {revenueData.alerts.filter(a => a.severity === "high").length > 0 && (
              <div className="mb-4 space-y-2">
                {revenueData.alerts
                  .filter(a => a.severity === "high")
                  .map((alert, i) => (
                    <Link
                      key={i}
                      href={`/project-builder/${alert.projectId}/war-room`}
                      className="flex items-center gap-3 rounded-lg border border-[#C5A572]/40 bg-[#FBF8F3] px-4 py-3 transition-colors hover:border-[#C5A572]"
                    >
                      <AlertTriangle className="h-4 w-4 shrink-0 text-[#8B7355]" />
                      <span className="text-sm text-[#8B7355]">{alert.message}</span>
                      <ArrowRight className="ml-auto h-3.5 w-3.5 text-[#C5A572]" />
                    </Link>
                  ))}
              </div>
            )}

            {/* Compact ranked list */}
            {(() => {
              const evaluated = revenueData.projects
                .filter(p => p.revenueProximityScore != null)
                .sort((a, b) => (b.revenueProximityScore ?? 0) - (a.revenueProximityScore ?? 0));
              const unevaluated = revenueData.projects.filter(p => p.revenueProximityScore == null);

              return (
                <>
                  <div className="rounded-lg border border-[#E8E4DE] bg-white overflow-hidden">
                    {evaluated.length === 0 ? (
                      <div className="px-6 py-8 text-center">
                        <p className="text-sm text-[#5E5E5E]">Aún no hay proyectos evaluados.</p>
                        <p className="text-xs text-[#5E5E5E]/70 mt-1">Pide al Strategist un diagnóstico desde el War Room.</p>
                      </div>
                    ) : (
                      <ul className="divide-y divide-[#E8E4DE]">
                        {evaluated.map((project, idx) => {
                          const score = project.revenueProximityScore!;
                          let stateLabel = "";
                          let stateClass = "";
                          if (score >= 8) { stateLabel = "Próximo a facturar"; stateClass = "text-[#8B7355] bg-[#FBF8F3] border-[#C5A572]/40"; }
                          else if (score >= 5) { stateLabel = "En progreso"; stateClass = "text-amber-700 bg-amber-50 border-amber-200"; }
                          else { stateLabel = "Fase temprana"; stateClass = "text-[#5E5E5E] bg-[#F9F8F6] border-[#5E5E5E]/15"; }

                          return (
                            <Link
                              key={project.id}
                              href={`/project-builder/${project.id}`}
                              className="group flex items-center gap-4 px-5 py-4 hover:bg-[#FBF8F3]/50 transition-colors border-l-2 border-transparent hover:border-[#C5A572]"
                            >
                              {/* Rank number */}
                              <div className="shrink-0 text-xs text-[#5E5E5E]/50 font-mono w-6">
                                {String(idx + 1).padStart(2, "0")}
                              </div>

                              {/* Score with bar */}
                              <div className="shrink-0 flex items-center gap-3">
                                <div className="text-2xl font-light text-[#1A1A1A] tabular-nums leading-none">
                                  {score}<span className="text-xs text-[#5E5E5E]/60">/10</span>
                                </div>
                                <div className="flex gap-0.5">
                                  {Array.from({ length: 10 }).map((_, i) => (
                                    <div
                                      key={i}
                                      className={`h-3 w-1 rounded-sm ${
                                        i < score ? "bg-[#C5A572]" : "bg-[#E8E4DE]"
                                      }`}
                                    />
                                  ))}
                                </div>
                              </div>

                              {/* Title + state */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <h4 className="text-sm font-medium text-[#1A1A1A] truncate">
                                    {project.title}
                                  </h4>
                                  <span className={`shrink-0 inline-block rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${stateClass}`}>
                                    {stateLabel}
                                  </span>
                                </div>
                                {project.stepsToRevenue != null && (
                                  <p className="text-xs text-[#5E5E5E] mt-0.5">
                                    {project.stepsToRevenue} paso{project.stepsToRevenue !== 1 ? "s" : ""} para facturar
                                    {project.revenueLastAssessedAt && (
                                      <span className="text-[#5E5E5E]/50"> · evaluado {new Date(project.revenueLastAssessedAt).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}</span>
                                    )}
                                  </p>
                                )}
                              </div>

                              {/* Arrow */}
                              <ArrowRight className="shrink-0 h-4 w-4 text-[#C5A572]/40 group-hover:text-[#C5A572] transition-colors" />
                            </Link>
                          );
                        })}
                      </ul>
                    )}
                  </div>

                  {/* Unevaluated section (collapsible) */}
                  {unevaluated.length > 0 && (
                    <details className="mt-4 group">
                      <summary className="cursor-pointer text-xs text-[#5E5E5E] hover:text-[#1A1A1A] transition-colors flex items-center gap-2 select-none">
                        <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
                        {unevaluated.length} proyecto{unevaluated.length !== 1 ? "s" : ""} sin evaluar
                      </summary>
                      <ul className="mt-2 ml-5 space-y-1.5">
                        {unevaluated.map(project => (
                          <li key={project.id}>
                            <Link
                              href={`/project-builder/${project.id}`}
                              className="text-xs text-[#5E5E5E] hover:text-[#1A1A1A] transition-colors flex items-center gap-2"
                            >
                              <CircleDot className="h-3 w-3 text-[#5E5E5E]/40" />
                              {project.title}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </>
              );
            })()}

            {/* Low-severity alerts */}
            {revenueData.alerts.filter(a => a.severity === "low").length > 0 && (
              <div className="mt-3 space-y-1">
                {revenueData.alerts
                  .filter(a => a.severity === "low")
                  .slice(0, 3)
                  .map((alert, i) => (
                    <p key={i} className="text-xs text-[#5E5E5E]/70">
                      · {alert.message}
                    </p>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* PM Ágil Type Distribution */}
        {!loading && stats && (
          <div>
            <p className="ql-label mb-2">Framework PM Ágil</p>
            <h3 className="ql-h3 mb-4">Distribución por tipo de proyecto</h3>
            <div className="grid gap-3 sm:grid-cols-4">
              {PROJECT_TYPE_ORDER.map((type) => {
                const info = PROJECT_TYPES[type as ProjectType];
                const count = stats.projectsByType?.[type as keyof typeof stats.projectsByType] ?? 0;
                const total = stats.totalProjects || 1;
                const pct = Math.round((count / total) * 100);
                return (
                  <Link
                    key={type}
                    href={`/project-builder?type=${type}`}
                    className={`group relative overflow-hidden rounded-lg border p-4 transition-all hover:shadow-sm ${info.borderColor} ${info.bgColor}`}
                  >
                    <div className="mb-3 flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${info.dotColor}`} />
                      <span className={`ql-label ${info.color}`}>{info.label}</span>
                    </div>
                    <p className="ql-h2">{count}</p>
                    <p className="ql-body">proyecto{count !== 1 ? "s" : ""}</p>
                    <div className="mt-3">
                      <div className="h-0.5 w-full overflow-hidden rounded-full bg-white/60">
                        <div
                          className={`h-full ${info.dotColor} transition-all`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className={`mt-1 text-xs ${info.color}`}>{pct}%</p>
                    </div>
                    <ArrowRight className={`absolute right-3 top-3 h-4 w-4 opacity-0 transition-all group-hover:opacity-100 ${info.color}`} />
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div>
          <p className="ql-label mb-4">Acciones rápidas</p>
          <div className="flex flex-wrap gap-3">
            <Link href="/project-builder/new" className="ql-btn-primary group">
              <FolderKanban className="h-4 w-4" />
              Nuevo Proyecto
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link href="/inbox" className="ql-btn-secondary">
              <Inbox className="h-4 w-4" />
              Capturar en Inbox
            </Link>
            <Link href="/agile-board" className="ql-btn-ghost">
              <CheckSquare className="h-4 w-4" />
              Agile Board
            </Link>
          </div>
        </div>

        {/* Kanban Board */}
        <div>
          <p className="ql-label mb-2">Vista de proyectos</p>
          <h3 className="ql-h3 mb-6">Estado actual de tus proyectos</h3>
          <KanbanBoard />
        </div>

        {/* Inbox Summary */}
        {!loading && stats && (
          <div>
            <p className="ql-label mb-2">Intelligence feed</p>
            <h3 className="ql-h3 mb-6">Raindrop Inbox</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <Link href="/inbox" className="ql-card group hover:border-ql-charcoal/30 transition-colors">
                <div className="flex items-center gap-4">
                  <Inbox className="h-4 w-4 text-ql-muted" strokeWidth={1.5} />
                  <div>
                    <p className="ql-h2">{stats.inboxTotal ?? 0}</p>
                    <p className="ql-body">Items totales</p>
                  </div>
                </div>
              </Link>
              <Link href="/inbox?status=unprocessed" className="ql-card group hover:border-ql-charcoal/30 transition-colors">
                <div className="flex items-center gap-4">
                  <Sparkles className="h-4 w-4 text-ql-muted" strokeWidth={1.5} />
                  <div>
                    <p className="ql-h2">{stats.inboxUnprocessed ?? 0}</p>
                    <p className="ql-body">Sin procesar</p>
                  </div>
                </div>
              </Link>
              <Link href="/agile-board" className="ql-card group hover:border-ql-charcoal/30 transition-colors">
                <div className="flex items-center gap-4">
                  <CheckSquare className="h-4 w-4 text-ql-muted" strokeWidth={1.5} />
                  <div>
                    <p className="ql-h2">5</p>
                    <p className="ql-body">Agentes activos</p>
                  </div>
                </div>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
