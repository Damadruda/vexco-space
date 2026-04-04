"use client";

import { useState, useEffect, useMemo } from "react";
import { Header } from "@/components/ui/header";
import Link from "next/link";
import {
  Flame,
  TrendingUp,
  Clock,
  CircleDot,
  Search,
  FolderKanban,
  ArrowRight,
  CheckSquare,
  AlertCircle,
  ListChecks,
} from "lucide-react";

interface AgileTask {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  labels: string[];
  sprint?: string | null;
  projectId: string | null;
  projectTitle: string | null;
  revenueProximityScore: number | null;
  revenueProximityReason: string | null;
  stepsToRevenue: number | null;
  createdAt: string;
  updatedAt: string;
}

interface ProjectSummary {
  id: string;
  title: string;
  taskCount: number;
  revenueProximityScore: number | null;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  backlog: { label: "Backlog", className: "bg-[#F9F8F6] text-[#5E5E5E]" },
  "in-progress": { label: "En progreso", className: "bg-blue-50 text-blue-700" },
  review: { label: "Revisión", className: "bg-amber-50 text-amber-700" },
  done: { label: "Completado", className: "bg-green-50 text-green-700" },
};

const PRIORITY_ORDER: Record<string, number> = { high: 3, medium: 2, low: 1 };

export default function AgileBoardPage() {
  const [tasks, setTasks] = useState<AgileTask[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterProject, setFilterProject] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetch("/api/agile?global=true")
      .then((r) => r.json())
      .then((data) => {
        setTasks(data?.tasks ?? []);
        setProjects(data?.projects ?? []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Filtered tasks
  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (filterProject !== "all" && t.projectId !== filterProject) return false;
      if (filterStatus !== "all" && t.status !== filterStatus) return false;
      if (filterPriority !== "all" && t.priority !== filterPriority) return false;
      if (searchQuery && !t.title.toLowerCase().includes(searchQuery.toLowerCase()))
        return false;
      return true;
    });
  }, [tasks, filterProject, filterStatus, filterPriority, searchQuery]);

  // Group by project, sorted by revenue score
  const grouped = useMemo(() => {
    const groups = new Map<
      string,
      {
        projectId: string;
        projectTitle: string;
        revenueProximityScore: number | null;
        stepsToRevenue: number | null;
        tasks: AgileTask[];
      }
    >();

    for (const t of filtered) {
      const key = t.projectId ?? "__none__";
      if (!groups.has(key)) {
        groups.set(key, {
          projectId: t.projectId ?? "",
          projectTitle: t.projectTitle ?? "Sin proyecto",
          revenueProximityScore: t.revenueProximityScore,
          stepsToRevenue: t.stepsToRevenue,
          tasks: [],
        });
      }
      groups.get(key)!.tasks.push(t);
    }

    // Sort tasks within each group by priority DESC
    for (const g of groups.values()) {
      g.tasks.sort((a, b) => (PRIORITY_ORDER[b.priority] ?? 0) - (PRIORITY_ORDER[a.priority] ?? 0));
    }

    // Sort groups by revenue score DESC (nulls last)
    return Array.from(groups.values()).sort(
      (a, b) => (b.revenueProximityScore ?? -1) - (a.revenueProximityScore ?? -1)
    );
  }, [filtered]);

  // Summary stats
  const stats = useMemo(() => {
    const active = filtered.filter((t) => t.status !== "done").length;
    const projectCount = new Set(filtered.map((t) => t.projectId).filter(Boolean)).size;
    const highPriority = filtered.filter((t) => t.priority === "high").length;
    const inReview = filtered.filter((t) => t.status === "review").length;
    return { active, projectCount, highPriority, inReview };
  }, [filtered]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center gap-2 justify-center bg-ql-offwhite">
        <span className="ql-status-thinking" />
        <span className="ql-loading">Cargando tareas...</span>
      </div>
    );
  }

  return (
    <div className="ql-page">
      <Header title="Agile Board" subtitle="Vista cross-proyecto" />

      <div className="p-8 space-y-8">
        {/* Page heading */}
        <div>
          <h1 className="ql-h1">Agile Board</h1>
          <p className="ql-body mt-1">
            Todas las tareas de tus proyectos activos, priorizadas por proximidad a facturación.
          </p>
        </div>

        {/* Summary stats */}
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
          <div className="ql-card px-4 py-3">
            <p className="text-lg font-light text-[#1A1A1A]">{stats.active}</p>
            <p className="text-xs text-[#5E5E5E]">Tareas activas</p>
          </div>
          <div className="ql-card px-4 py-3">
            <p className="text-lg font-light text-[#1A1A1A]">{stats.projectCount}</p>
            <p className="text-xs text-[#5E5E5E]">Proyectos</p>
          </div>
          <div className="ql-card px-4 py-3">
            <p className="text-lg font-light text-[#1A1A1A]">{stats.highPriority}</p>
            <p className="text-xs text-[#5E5E5E]">Alta prioridad</p>
          </div>
          <div className="ql-card px-4 py-3">
            <p className="text-lg font-light text-[#1A1A1A]">{stats.inReview}</p>
            <p className="text-xs text-[#5E5E5E]">En revisión</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
            className="ql-input text-sm py-1.5 px-3 min-w-[180px]"
          >
            <option value="all">Todos los proyectos</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} ({p.taskCount})
              </option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="ql-input text-sm py-1.5 px-3"
          >
            <option value="all">Todos los estados</option>
            <option value="backlog">Backlog</option>
            <option value="in-progress">En progreso</option>
            <option value="review">Revisión</option>
            <option value="done">Completado</option>
          </select>

          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="ql-input text-sm py-1.5 px-3"
          >
            <option value="all">Todas las prioridades</option>
            <option value="high">Alta</option>
            <option value="medium">Media</option>
            <option value="low">Baja</option>
          </select>

          <div className="relative flex-1 min-w-[160px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#5E5E5E]" />
            <input
              type="text"
              placeholder="Buscar tarea..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="ql-input text-sm py-1.5 pl-9 pr-3 w-full"
            />
          </div>
        </div>

        {/* Empty state */}
        {filtered.length === 0 && (
          <div className="text-center py-16">
            <ListChecks className="h-8 w-8 text-[#5E5E5E]/40 mx-auto mb-4" strokeWidth={1} />
            <p className="text-sm text-[#1A1A1A] font-medium mb-1">No hay tareas activas</p>
            <p className="text-xs text-[#5E5E5E] mb-4 max-w-sm mx-auto">
              Abre un proyecto y pide al Strategist que diagnostique para generar un plan de acción con tareas.
            </p>
            <Link href="/project-builder" className="ql-btn-primary inline-flex">
              <FolderKanban className="h-4 w-4" />
              Ver proyectos
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}

        {/* Grouped task list */}
        <div className="space-y-6">
          {grouped.map((group) => {
            const score = group.revenueProximityScore;
            let ScoreIcon = CircleDot;
            let scoreBadge = "Sin evaluar";
            let scoreBadgeClass = "text-[#5E5E5E]";

            if (score != null && score >= 8) {
              ScoreIcon = Flame;
              scoreBadge = `Score: ${score}/10`;
              scoreBadgeClass = "text-[#8B7355]";
            } else if (score != null && score >= 5) {
              ScoreIcon = TrendingUp;
              scoreBadge = `Score: ${score}/10`;
              scoreBadgeClass = "text-amber-600";
            } else if (score != null && score >= 1) {
              ScoreIcon = Clock;
              scoreBadge = `Score: ${score}/10`;
              scoreBadgeClass = "text-[#5E5E5E]";
            }

            return (
              <div
                key={group.projectId || "__none__"}
                className="rounded-lg bg-white overflow-hidden"
                style={{ border: "1px solid rgba(184, 178, 168, 0.15)" }}
              >
                {/* Project header */}
                <div className="flex items-center gap-3 px-5 py-3 border-b border-ql-sand/20">
                  <ScoreIcon className={`h-4 w-4 shrink-0 ${scoreBadgeClass}`} strokeWidth={1.5} />
                  <div className="flex-1 min-w-0">
                    {group.projectId ? (
                      <Link
                        href={`/project-builder/${group.projectId}`}
                        className="text-sm font-medium text-[#1A1A1A] hover:text-[#C5A572] transition-colors"
                      >
                        {group.projectTitle}
                      </Link>
                    ) : (
                      <span className="text-sm font-medium text-[#5E5E5E]">
                        {group.projectTitle}
                      </span>
                    )}
                  </div>
                  <span className={`text-xs ${scoreBadgeClass}`}>{scoreBadge}</span>
                  {group.stepsToRevenue != null && (
                    <span className="text-xs text-[#5E5E5E]">
                      · {group.stepsToRevenue} paso{group.stepsToRevenue !== 1 ? "s" : ""} para facturar
                    </span>
                  )}
                  <span className="text-xs text-[#5E5E5E]/60">
                    {group.tasks.length} tarea{group.tasks.length !== 1 ? "s" : ""}
                  </span>
                </div>

                {/* Tasks */}
                <div className="divide-y divide-ql-sand/10">
                  {group.tasks.map((task) => {
                    const statusCfg = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.backlog;
                    const priorityColor =
                      task.priority === "high"
                        ? "bg-red-100 text-red-700"
                        : task.priority === "medium"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-[#F9F8F6] text-[#5E5E5E]";

                    return (
                      <div
                        key={task.id}
                        className="flex items-center gap-3 px-5 py-2.5 hover:bg-[#F9F8F6]/50 transition-colors"
                      >
                        <CheckSquare
                          className={`h-3.5 w-3.5 shrink-0 ${
                            task.status === "done" ? "text-green-500" : "text-[#5E5E5E]/30"
                          }`}
                          strokeWidth={1.5}
                        />
                        <span
                          className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${priorityColor}`}
                        >
                          {task.priority}
                        </span>
                        <span
                          className={`flex-1 text-sm ${
                            task.status === "done"
                              ? "text-[#5E5E5E] line-through"
                              : "text-[#1A1A1A]"
                          }`}
                        >
                          {task.title}
                        </span>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] ${statusCfg.className}`}
                        >
                          {statusCfg.label}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Link to project agile board */}
                {group.projectId && (
                  <div className="px-5 py-2 border-t border-ql-sand/10">
                    <Link
                      href={`/project-builder/${group.projectId}/agile`}
                      className="text-xs text-[#5E5E5E] hover:text-[#C5A572] transition-colors inline-flex items-center gap-1"
                    >
                      Abrir tablero Kanban
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
