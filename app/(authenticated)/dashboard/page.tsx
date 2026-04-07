"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/ui/header";
import { CommandBar } from "@/components/ui/command-bar";
import {
  ArrowRight, Flame, Clock, CircleDot, TrendingUp, AlertTriangle,
  CheckSquare, Sparkles, Inbox, Activity,
} from "lucide-react";
import Link from "next/link";

interface Stats {
  totalProjects: number;
  inboxTotal?: number;
  inboxUnprocessed?: number;
  tasksThisWeek?: Array<{
    id: string;
    title: string;
    dueDate: string;
    projectId: string;
    projectTitle: string;
  }>;
  tasksOverdueCount?: number;
  insightsDraftCount?: number;
  recentActivity?: Array<{
    id: string;
    title: string;
    lastActivity: string;
    lastDiagnosis: string | null;
  }>;
}

interface RevenueProject {
  id: string;
  title: string;
  status: string;
  revenueProximityScore: number | null;
  revenueProximityReason: string | null;
  stepsToRevenue: number | null;
  stepsToRevenueDetail: string | null;
  estimatedRevenueDate: string | null;
  revenueLastAssessedAt: string | null;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [revenueData, setRevenueData] = useState<{
    projects: RevenueProject[];
    alerts: Array<{ projectId: string; message: string; severity: string }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAll() {
      try {
        const [statsRes, revRes] = await Promise.all([
          fetch("/api/stats"),
          fetch("/api/projects/revenue-ranking"),
        ]);
        const statsData = await statsRes.json();
        const revData = await revRes.json();
        setStats(statsData?.stats);
        if (revData?.projects) setRevenueData(revData);
      } catch (error) {
        console.error("Dashboard fetch error:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, []);

  const sortedProjects = revenueData?.projects
    ? [...revenueData.projects].sort((a, b) => {
        const aScore = a.revenueProximityScore;
        const bScore = b.revenueProximityScore;
        if (aScore == null && bScore == null) return 0;
        if (aScore == null) return 1;
        if (bScore == null) return -1;
        return bScore - aScore;
      })
    : [];

  return (
    <div className="ql-page">
      <Header title="Dashboard" subtitle="Vista general" />

      <div className="p-6 space-y-10 max-w-6xl mx-auto">
        {/* ─── 1. COMMAND BAR ────────────────────────────────────── */}
        <CommandBar />

        {/* ─── 2. FOCO DE FACTURACIÓN ────────────────────────────── */}
        <section>
          <p className="ql-label mb-2">Proximidad a facturación</p>
          <h2 className="ql-h2 mb-5">Foco de facturación</h2>

          {revenueData && revenueData.alerts.filter(a => a.severity === "high").length > 0 && (
            <div className="mb-4 space-y-2">
              {revenueData.alerts
                .filter(a => a.severity === "high")
                .map((alert, i) => (
                  <Link
                    key={i}
                    href={`/project-builder/${alert.projectId}`}
                    className="flex items-center gap-3 rounded-lg border border-[#C5A572]/40 bg-[#FBF8F3] px-4 py-3 hover:border-[#C5A572] transition-colors"
                  >
                    <AlertTriangle className="h-4 w-4 shrink-0 text-[#8B7355]" />
                    <span className="text-sm text-[#8B7355]">{alert.message}</span>
                    <ArrowRight className="ml-auto h-3.5 w-3.5 text-[#C5A572]" />
                  </Link>
                ))}
            </div>
          )}

          <div className="rounded-lg border border-[#E8E4DE] bg-white overflow-hidden">
            {loading ? (
              <div className="px-6 py-12 text-center">
                <span className="ql-status-thinking mr-2" />
                <span className="ql-loading">Cargando proyectos...</span>
              </div>
            ) : sortedProjects.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <p className="text-sm text-[#5E5E5E]">Aún no hay proyectos.</p>
                <Link href="/project-builder/new" className="text-xs text-[#C5A572] hover:underline mt-2 inline-block">
                  Crear el primero →
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-[#E8E4DE]">
                {sortedProjects.map((project, idx) => {
                  const score = project.revenueProximityScore;
                  let stateLabel = "Sin evaluar";
                  let stateClass = "text-[#5E5E5E]/70 bg-[#F9F8F6] border-[#E8E4DE]";
                  let IconComp = CircleDot;

                  if (score != null) {
                    if (score >= 8) {
                      stateLabel = "Próximo a facturar";
                      stateClass = "text-[#8B7355] bg-[#FBF8F3] border-[#C5A572]/40";
                      IconComp = Flame;
                    } else if (score >= 5) {
                      stateLabel = "En progreso";
                      stateClass = "text-amber-700 bg-amber-50 border-amber-200";
                      IconComp = TrendingUp;
                    } else {
                      stateLabel = "Fase temprana";
                      stateClass = "text-[#5E5E5E] bg-[#F9F8F6] border-[#5E5E5E]/15";
                      IconComp = Clock;
                    }
                  }

                  return (
                    <Link
                      key={project.id}
                      href={`/project-builder/${project.id}`}
                      className="group flex items-center gap-4 px-5 py-4 hover:bg-[#FBF8F3]/50 transition-colors border-l-2 border-transparent hover:border-[#C5A572]"
                    >
                      <div className="shrink-0 text-xs text-[#5E5E5E]/50 font-mono w-6">
                        {String(idx + 1).padStart(2, "0")}
                      </div>

                      <div className="shrink-0 flex items-center gap-3 w-32">
                        <div className="text-2xl font-light text-[#1A1A1A] tabular-nums leading-none w-12">
                          {score != null ? (
                            <>{score}<span className="text-xs text-[#5E5E5E]/60">/10</span></>
                          ) : (
                            <span className="text-[#5E5E5E]/30">—</span>
                          )}
                        </div>
                        <div className="flex gap-0.5">
                          {Array.from({ length: 10 }).map((_, i) => (
                            <div
                              key={i}
                              className={`h-3 w-1 rounded-sm ${
                                score != null && i < score ? "bg-[#C5A572]" : "bg-[#E8E4DE]"
                              }`}
                            />
                          ))}
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-medium text-[#1A1A1A] truncate">
                            {project.title}
                          </h4>
                          <span className={`shrink-0 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${stateClass}`}>
                            <IconComp className="h-2.5 w-2.5" />
                            {stateLabel}
                          </span>
                        </div>
                        {project.stepsToRevenue != null && (
                          <p className="text-xs text-[#5E5E5E] mt-0.5">
                            {project.stepsToRevenue} paso{project.stepsToRevenue !== 1 ? "s" : ""} para facturar
                            {project.revenueLastAssessedAt && (
                              <span className="text-[#5E5E5E]/50">
                                {" · evaluado "}
                                {new Date(project.revenueLastAssessedAt).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
                              </span>
                            )}
                          </p>
                        )}
                      </div>

                      <ArrowRight className="shrink-0 h-4 w-4 text-[#C5A572]/40 group-hover:text-[#C5A572] transition-colors" />
                    </Link>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {/* ─── 3. PULSO DEL LAB ──────────────────────────────────── */}
        <section>
          <p className="ql-label mb-2">Pulso del Lab</p>
          <h2 className="ql-h2 mb-5">Lo que está pasando ahora</h2>

          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
            {/* Card 1: Tareas esta semana */}
            <div className="rounded-lg border border-[#E8E4DE] bg-white p-5 hover:border-[#C5A572]/40 transition-colors">
              <div className="flex items-center justify-between mb-3">
                <CheckSquare className="h-4 w-4 text-[#5E5E5E]" />
                {stats?.tasksOverdueCount != null && stats.tasksOverdueCount > 0 && (
                  <span className="text-[10px] uppercase tracking-wide text-red-600 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
                    {stats.tasksOverdueCount} vencidas
                  </span>
                )}
              </div>
              <p className="text-3xl font-light text-[#1A1A1A] tabular-nums">
                {stats?.tasksThisWeek?.length ?? 0}
              </p>
              <p className="text-xs text-[#5E5E5E] mb-3">tareas esta semana</p>
              {stats?.tasksThisWeek && stats.tasksThisWeek.length > 0 && (
                <ul className="space-y-1.5 border-t border-[#E8E4DE] pt-3">
                  {stats.tasksThisWeek.slice(0, 3).map(t => (
                    <li key={t.id} className="text-xs">
                      <Link
                        href={`/project-builder/${t.projectId}`}
                        className="flex items-start gap-1.5 text-[#5E5E5E] hover:text-[#1A1A1A] transition-colors"
                      >
                        <span className="text-[#C5A572] mt-0.5">·</span>
                        <span className="truncate">{t.title}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <Link href="/agile-board" className="mt-3 inline-flex items-center gap-1 text-xs text-[#C5A572] hover:text-[#8B7355]">
                Ver Agile Board <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {/* Card 2: Insights por validar */}
            <div className="rounded-lg border border-[#E8E4DE] bg-white p-5 hover:border-[#C5A572]/40 transition-colors">
              <div className="flex items-center justify-between mb-3">
                <Sparkles className="h-4 w-4 text-[#5E5E5E]" />
              </div>
              <p className="text-3xl font-light text-[#1A1A1A] tabular-nums">
                {stats?.insightsDraftCount ?? 0}
              </p>
              <p className="text-xs text-[#5E5E5E] mb-3">insights por validar</p>
              <p className="text-xs text-[#5E5E5E]/70 border-t border-[#E8E4DE] pt-3">
                Generados por los agentes durante diagnósticos
              </p>
              <Link href="/knowledge" className="mt-3 inline-flex items-center gap-1 text-xs text-[#C5A572] hover:text-[#8B7355]">
                Ver Conocimiento <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {/* Card 3: Inbox sin procesar */}
            <div className="rounded-lg border border-[#E8E4DE] bg-white p-5 hover:border-[#C5A572]/40 transition-colors">
              <div className="flex items-center justify-between mb-3">
                <Inbox className="h-4 w-4 text-[#5E5E5E]" />
              </div>
              <p className="text-3xl font-light text-[#1A1A1A] tabular-nums">
                {stats?.inboxUnprocessed ?? 0}
              </p>
              <p className="text-xs text-[#5E5E5E] mb-3">items sin procesar</p>
              <p className="text-xs text-[#5E5E5E]/70 border-t border-[#E8E4DE] pt-3">
                {stats?.inboxTotal ?? 0} items totales en el Inbox
              </p>
              <Link href="/inbox" className="mt-3 inline-flex items-center gap-1 text-xs text-[#C5A572] hover:text-[#8B7355]">
                Procesar Inbox <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {/* Card 4: Actividad reciente */}
            <div className="rounded-lg border border-[#E8E4DE] bg-white p-5 hover:border-[#C5A572]/40 transition-colors">
              <div className="flex items-center justify-between mb-3">
                <Activity className="h-4 w-4 text-[#5E5E5E]" />
              </div>
              <p className="text-xs text-[#5E5E5E] mb-3 mt-1">Última actividad</p>
              {stats?.recentActivity && stats.recentActivity.length > 0 ? (
                <ul className="space-y-1.5">
                  {stats.recentActivity.slice(0, 4).map(a => {
                    const when = a.lastDiagnosis ?? a.lastActivity;
                    return (
                      <li key={a.id} className="text-xs">
                        <Link
                          href={`/project-builder/${a.id}`}
                          className="flex items-center justify-between gap-2 text-[#5E5E5E] hover:text-[#1A1A1A] transition-colors"
                        >
                          <span className="truncate flex-1">{a.title}</span>
                          <span className="text-[10px] text-[#5E5E5E]/50 shrink-0">
                            {new Date(when).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-xs text-[#5E5E5E]/50">Sin actividad reciente</p>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
