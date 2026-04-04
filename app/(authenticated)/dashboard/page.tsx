"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/ui/header";
import { StatCard } from "@/components/ui/stat-card";
import { KanbanBoard } from "@/components/ui/kanban-board";
import { FolderKanban, Lightbulb, FileText, Link as LinkIcon, Image as ImageIcon, TrendingUp, ArrowRight, Swords, CloudDownload, Plus, Inbox, Sparkles, Check, X, AlertTriangle, Flame, Clock, CircleDot } from "lucide-react";
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
        {/* Page heading */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="ql-h1">Dashboard</h1>
            <p className="ql-body mt-1">Vista general de tus proyectos.</p>
          </div>
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

            {/* Ranking cards */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {revenueData.projects
                .filter(p => p.revenueProximityScore != null || true)
                .slice(0, 6)
                .map(project => {
                  const score = project.revenueProximityScore;
                  let badgeLabel = "Sin evaluar";
                  let badgeClass = "bg-[#F9F8F6] text-[#5E5E5E] border border-[#5E5E5E]/20";
                  let IconComponent = CircleDot;

                  if (score != null && score >= 8) {
                    badgeLabel = "Próximo a facturar";
                    badgeClass = "bg-[#FBF8F3] text-[#8B7355] border border-[#C5A572]/40";
                    IconComponent = Flame;
                  } else if (score != null && score >= 5) {
                    badgeLabel = "En progreso";
                    badgeClass = "bg-amber-50 text-amber-700 border border-amber-200";
                    IconComponent = TrendingUp;
                  } else if (score != null && score >= 1) {
                    badgeLabel = "Fase temprana";
                    badgeClass = "bg-[#F9F8F6] text-[#5E5E5E] border border-[#5E5E5E]/10";
                    IconComponent = Clock;
                  }

                  return (
                    <Link
                      key={project.id}
                      href={`/project-builder/${project.id}/war-room`}
                      className="group ql-card hover:border-[#C5A572]/40 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h4 className="text-sm font-medium text-[#1A1A1A] line-clamp-1">{project.title}</h4>
                        {score != null && (
                          <span className="shrink-0 text-lg font-light text-[#1A1A1A]">{score}/10</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${badgeClass}`}>
                          <IconComponent className="h-3 w-3" />
                          {badgeLabel}
                        </span>
                      </div>
                      {project.stepsToRevenue != null && (
                        <p className="text-xs text-[#5E5E5E]">
                          {project.stepsToRevenue} paso{project.stepsToRevenue !== 1 ? "s" : ""} para facturar
                        </p>
                      )}
                      {project.revenueLastAssessedAt && (
                        <p className="mt-1 text-xs text-[#5E5E5E]/60">
                          Evaluado: {new Date(project.revenueLastAssessedAt).toLocaleDateString("es-ES")}
                        </p>
                      )}
                    </Link>
                  );
                })}
            </div>

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
            <Link href="/idea-vault" className="ql-btn-secondary">
              <Lightbulb className="h-4 w-4" />
              Capturar Idea
            </Link>
            <Link href="/war-room" className="ql-btn-ghost">
              <Swords className="h-4 w-4" />
              War Room
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
              <Link href="/war-room" className="ql-card group hover:border-ql-charcoal/30 transition-colors">
                <div className="flex items-center gap-4">
                  <Swords className="h-4 w-4 text-ql-muted" strokeWidth={1.5} />
                  <div>
                    <p className="ql-h2">4</p>
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
