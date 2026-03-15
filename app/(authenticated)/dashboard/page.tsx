"use client";

import { useState, useEffect, useRef } from "react";
import { Header } from "@/components/ui/header";
import { StatCard } from "@/components/ui/stat-card";
import { KanbanBoard } from "@/components/ui/kanban-board";
import { FolderKanban, Lightbulb, FileText, Link as LinkIcon, Image as ImageIcon, TrendingUp, ArrowRight, Sparkles, RefreshCw, CloudDownload, Plus } from "lucide-react";
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
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiInsights, setAiInsights] = useState<string>("");
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [showDriveAnalyzer, setShowDriveAnalyzer] = useState(false);
  const insightsRef = useRef<HTMLDivElement>(null);

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

  const generateInsights = async () => {
    setLoadingInsights(true);
    setAiInsights("");

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "project_insights",
          data: { content: "Dame un resumen rápido del estado de mis proyectos y recomendaciones de próximos pasos prioritarios. Sé conciso." },
          stream: true
        })
      });

      if (!res.ok) throw new Error("Error generating insights");

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              const text = parsed.choices?.[0]?.delta?.content || "";
              fullContent += text;
              setAiInsights(fullContent);
            } catch (e) {
              // Skip
            }
          }
        }
      }
    } catch (error) {
      console.error("Insights error:", error);
      setAiInsights("No se pudieron generar los insights. Intenta de nuevo.");
    } finally {
      setLoadingInsights(false);
    }
  };

  useEffect(() => {
    if (insightsRef.current) {
      insightsRef.current.scrollTop = insightsRef.current.scrollHeight;
    }
  }, [aiInsights]);

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

        {/* AI Insights Section */}
        <div className="ql-card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-ql-cream">
                <Sparkles className="h-4 w-4 text-ql-accent" />
              </div>
              <div>
                <h3 className="ql-h3">Insights con IA</h3>
                <p className="ql-body">Análisis automático de tus proyectos.</p>
              </div>
            </div>
            <button
              onClick={generateInsights}
              disabled={loadingInsights}
              className="ql-btn-secondary disabled:opacity-50"
            >
              {loadingInsights ? (
                <span className="ql-status-thinking" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {aiInsights ? "Actualizar" : "Generar Insights"}
            </button>
          </div>

          {aiInsights && (
            <div
              ref={insightsRef}
              className="mt-4 max-h-64 overflow-y-auto rounded-md bg-ql-offwhite p-4"
            >
              <div className="ql-body whitespace-pre-wrap">
                {aiInsights}
                {loadingInsights && <span className="ql-status-thinking ml-2" />}
              </div>
            </div>
          )}

          {!aiInsights && !loadingInsights && (
            <p className="ql-body mt-2">
              Genera un análisis personalizado de tus proyectos y recomendaciones.
            </p>
          )}
        </div>

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
            <Link href="/assistant" className="ql-btn-ghost">
              <Sparkles className="h-4 w-4" />
              Asistente IA
            </Link>
          </div>
        </div>

        {/* Kanban Board */}
        <div>
          <p className="ql-label mb-2">Vista de proyectos</p>
          <h3 className="ql-h3 mb-6">Estado actual de tus proyectos</h3>
          <KanbanBoard />
        </div>

        {/* Content Summary */}
        {!loading && stats && (
          <div>
            <p className="ql-label mb-2">Contenido capturado</p>
            <h3 className="ql-h3 mb-6">Tu repositorio de conocimiento</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="ql-card">
                <div className="flex items-center gap-4">
                  <FileText className="h-4 w-4 text-ql-muted" strokeWidth={1.5} />
                  <div>
                    <p className="ql-h2">{stats.totalNotes}</p>
                    <p className="ql-body">Notas guardadas</p>
                  </div>
                </div>
              </div>
              <div className="ql-card">
                <div className="flex items-center gap-4">
                  <LinkIcon className="h-4 w-4 text-ql-muted" strokeWidth={1.5} />
                  <div>
                    <p className="ql-h2">{stats.totalLinks}</p>
                    <p className="ql-body">Links capturados</p>
                  </div>
                </div>
              </div>
              <div className="ql-card">
                <div className="flex items-center gap-4">
                  <ImageIcon className="h-4 w-4 text-ql-muted" strokeWidth={1.5} />
                  <div>
                    <p className="ql-h2">{stats.totalImages}</p>
                    <p className="ql-body">Imágenes subidas</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
