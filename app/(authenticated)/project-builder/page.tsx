"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/ui/header";
import { ProjectCard } from "@/components/ui/project-card";
import { DriveProjectImporter } from "@/components/ui/drive-project-importer";
import { Plus, FolderKanban, Loader2, LayoutGrid, List, CloudDownload, ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";
import { PROJECT_TYPES, PROJECT_TYPE_ORDER, ProjectType } from "@/lib/project-types";

interface Project {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  projectType: string;
  category?: string | null;
  tags: string[];
  progress: number;
  priority: string;
  dueDate?: Date | string | null;
  currentStep: number;
}

export default function ProjectBuilderPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [importerOpen, setImporterOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const res = await fetch("/api/projects");
      const data = await res.json();
      setProjects(data?.projects ?? []);
    } catch (error) {
      console.error("Error fetching projects:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar este proyecto?")) return;

    setProjects((prev) => prev.filter((p) => p.id !== id));
    try {
      await fetch(`/api/projects/${id}`, { method: "DELETE" });
    } catch (error) {
      console.error("Error deleting project:", error);
      fetchProjects();
    }
  };

  const toggleGroup = (type: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  // Group projects by projectType, maintaining order
  const grouped = PROJECT_TYPE_ORDER.map((type) => ({
    type,
    projects: projects.filter((p) => (p.projectType || "idea") === type)
  })).filter((g) => g.projects.length > 0);

  return (
    <div className="min-h-screen">
      <Header title="Project Builder" />

      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Constructor de Proyectos</h2>
            <p className="text-slate-500">Framework PM Ágil — agrupado por tipo</p>
          </div>
          <div className="flex items-center gap-3">
            {/* View Toggle */}
            <div className="flex rounded-lg border border-slate-200 bg-white p-1">
              <button
                onClick={() => setView("grid")}
                className={`rounded-md p-2 transition-colors ${
                  view === "grid"
                    ? "bg-gray-900 text-white"
                    : "text-slate-500 hover:bg-slate-100"
                }`}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                onClick={() => setView("list")}
                className={`rounded-md p-2 transition-colors ${
                  view === "list"
                    ? "bg-gray-900 text-white"
                    : "text-slate-500 hover:bg-slate-100"
                }`}
              >
                <List className="h-4 w-4" />
              </button>
            </div>
            <button
              onClick={() => setImporterOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-white border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              <CloudDownload className="h-4 w-4" />
              Importar desde Drive
            </button>
            <Link
              href="/project-builder/new"
              className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800"
            >
              <Plus className="h-4 w-4" />
              Nuevo Proyecto
            </Link>
          </div>
        </div>

        {/* PM Ágil Type Legend */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">Framework PM Ágil</p>
          <div className="grid gap-2 sm:grid-cols-4">
            {PROJECT_TYPE_ORDER.map((type) => {
              const info = PROJECT_TYPES[type];
              const count = projects.filter((p) => (p.projectType || "idea") === type).length;
              return (
                <div key={type} className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${info.borderColor} ${info.bgColor}`}>
                  <span className={`h-2 w-2 shrink-0 rounded-full ${info.dotColor}`} />
                  <div className="min-w-0">
                    <p className={`text-xs font-semibold ${info.color}`}>{info.label}</p>
                    <p className="text-xs text-slate-400">{count} proyecto{count !== 1 ? "s" : ""}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Projects */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 py-12">
            <FolderKanban className="mb-3 h-12 w-12 text-slate-300" />
            <p className="mb-4 text-lg font-medium text-slate-600">No tienes proyectos aún</p>
            <Link
              href="/project-builder/new"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white"
            >
              <Plus className="h-4 w-4" />
              Crear mi primer proyecto
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map(({ type, projects: groupProjects }) => {
              const info = PROJECT_TYPES[type as ProjectType];
              const isCollapsed = collapsedGroups.has(type);
              return (
                <div key={type}>
                  {/* Group Header */}
                  <button
                    onClick={() => toggleGroup(type)}
                    className="mb-3 flex w-full items-center gap-3 text-left"
                  >
                    <div className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 ${info.borderColor} ${info.bgColor}`}>
                      <span className={`h-2 w-2 rounded-full ${info.dotColor}`} />
                      <span className={`text-sm font-semibold ${info.color}`}>{info.label}</span>
                      <span className={`rounded-full px-1.5 py-0.5 text-xs font-medium ${info.bgColor} ${info.color} border ${info.borderColor}`}>
                        {groupProjects.length}
                      </span>
                    </div>
                    <div className="flex-1 border-t border-slate-100" />
                    {isCollapsed ? (
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-slate-400" />
                    )}
                  </button>

                  {!isCollapsed && (
                    view === "grid" ? (
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {groupProjects.map((project) => (
                          <ProjectCard
                            key={project.id}
                            {...project}
                            onDelete={handleDelete}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {groupProjects.map((project) => (
                          <Link
                            key={project.id}
                            href={`/project-builder/${project.id}`}
                            className="flex items-center gap-4 rounded-xl bg-white p-4 shadow-sm border border-slate-200 hover:shadow-md transition-shadow"
                          >
                            <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${info.bgColor} ${info.color}`}>
                              <span className={`h-2.5 w-2.5 rounded-full ${info.dotColor}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold text-slate-800 truncate">{project.title}</h4>
                              <p className="text-sm text-slate-500">Paso {project.currentStep} de 5</p>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="text-right">
                                <p className="text-sm font-medium text-slate-700">{project.progress}%</p>
                                <div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                                  <div
                                    className="h-full bg-blue-500"
                                    style={{ width: `${project.progress}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    )
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Drive Importer Modal */}
      <DriveProjectImporter
        isOpen={importerOpen}
        onClose={() => setImporterOpen(false)}
      />
    </div>
  );
}
