"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/ui/header";
import { StatCard } from "@/components/ui/stat-card";
import { KanbanBoard } from "@/components/ui/kanban-board";
import { FolderKanban, Lightbulb, FileText, Link as LinkIcon, Image as ImageIcon, TrendingUp, ArrowRight, Swords, CloudDownload, Plus, Inbox, Sparkles } from "lucide-react";
import Link from "next/link";
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
  }, []);

  return (
    <div className="ql-page">
      <Header title="Dashboard" subtitle="Vista general" />

      {/* Drive Folder Analyzer Modal */}
      <DriveFolderAnalyzer
        isOpen={showDriveAnalyzer}
        onClose={() => setShowDriveAnalyzer(false)}
      />

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
