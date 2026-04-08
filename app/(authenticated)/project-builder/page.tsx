"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/ui/header";
import { ProjectCard } from "@/components/ui/project-card";
import { DriveProjectImporter } from "@/components/ui/drive-project-importer";
import { Plus, FolderKanban, LayoutGrid, List, CloudDownload, ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
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

interface MetaProject {
  id: string;
  name: string;
  narrative: string;
  status: string;
  revenueScore: number | null;
  components: Array<{
    id: string;
    role: string;
    project: { id: string; title: string; revenueProximityScore: number | null };
  }>;
  milestones: Array<{ id: string; title: string; status: string }>;
}

const ROLE_BADGE: Record<string, string> = {
  anchor: "text-[#8B7355] bg-[#FBF8F3] border-[#C5A572]/40",
  complement: "text-[#5E5E5E] bg-[#F9F8F6] border-[#E8E4DE]",
  enabler: "text-blue-700 bg-blue-50 border-blue-200",
};

export default function ProjectBuilderPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [metaProjects, setMetaProjects] = useState<MetaProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [importerOpen, setImporterOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [expandedMeta, setExpandedMeta] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const [projRes, metaRes] = await Promise.all([
        fetch("/api/projects"),
        fetch("/api/meta-projects"),
      ]);
      const projData = await projRes.json();
      const metaData = await metaRes.json();
      setProjects(projData?.projects ?? []);
      setMetaProjects((metaData?.metaProjects ?? []).filter((mp: MetaProject) => mp.status === "active"));
    } catch (error) {
      console.error("Error fetching projects:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleMeta = (id: string) => {
    setExpandedMeta((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
    <div className="ql-page">
      <Header title="Project Builder" />

      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="ql-h1">Constructor de Proyectos</h1>
            <p className="ql-body mt-1">Framework PM Ágil — agrupado por tipo</p>
          </div>
          <div className="flex items-center gap-3">
            {/* View Toggle */}
            <div className="flex rounded-md border border-ql-sand/40 bg-white p-1 gap-0.5">
              <button
                onClick={() => setView("grid")}
                className={`rounded p-2 transition-colors ${
                  view === "grid"
                    ? "bg-ql-charcoal text-white"
                    : "text-ql-muted hover:bg-ql-cream hover:text-ql-slate"
                }`}
                aria-label="Vista en cuadrícula"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                onClick={() => setView("list")}
                className={`rounded p-2 transition-colors ${
                  view === "list"
                    ? "bg-ql-charcoal text-white"
                    : "text-ql-muted hover:bg-ql-cream hover:text-ql-slate"
                }`}
                aria-label="Vista en lista"
              >
                <List className="h-4 w-4" />
              </button>
            </div>
            <button
              onClick={() => setImporterOpen(true)}
              className="ql-btn-secondary"
            >
              <CloudDownload className="h-4 w-4" />
              Importar desde Drive
            </button>
            <Link
              href="/project-builder/new"
              className="ql-btn-primary"
            >
              <Plus className="h-4 w-4" />
              Nuevo Proyecto
            </Link>
          </div>
        </div>

        {/* PM Ágil Type Legend */}
        <div className="ql-card">
          <p className="ql-label mb-3">Framework PM Ágil</p>
          <div className="grid gap-2 sm:grid-cols-4">
            {PROJECT_TYPE_ORDER.map((type) => {
              const info = PROJECT_TYPES[type];
              const count = projects.filter((p) => (p.projectType || "idea") === type).length;
              return (
                <div key={type} className={`flex items-center gap-2 rounded-md border px-3 py-2 ${info.borderColor} ${info.bgColor}`}>
                  <span className={`h-2 w-2 shrink-0 rounded-full ${info.dotColor}`} />
                  <div className="min-w-0">
                    <p className={`text-xs font-semibold ${info.color}`}>{info.label}</p>
                    <p className="ql-caption normal-case tracking-normal">{count} proyecto{count !== 1 ? "s" : ""}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Programas (MetaProjects) */}
        {metaProjects.length > 0 && (
          <div className="space-y-3">
            <p className="ql-label">Programas</p>
            {metaProjects.map((mp) => {
              const isExpanded = expandedMeta.has(mp.id);
              const doneMilestones = mp.milestones.filter((m) => m.status === "done").length;
              return (
                <div key={mp.id} className="rounded-lg border border-[#C5A572]/30 bg-white overflow-hidden">
                  <button
                    onClick={() => toggleMeta(mp.id)}
                    className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-[#FBF8F3]/50 transition-colors"
                  >
                    <span className="inline-flex items-center rounded-full border border-[#C5A572]/40 bg-[#FBF8F3] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[#8B7355]">
                      Programa
                    </span>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-medium text-[#1A1A1A] truncate">{mp.name}</h3>
                      <p className="text-xs text-[#5E5E5E] mt-0.5 line-clamp-1">{mp.narrative}</p>
                    </div>
                    {mp.revenueScore != null && (
                      <span className="text-lg font-light text-[#C5A572] tabular-nums shrink-0">
                        {mp.revenueScore}<span className="text-xs text-[#5E5E5E]/50">/10</span>
                      </span>
                    )}
                    {isExpanded ? <ChevronDown className="h-4 w-4 text-[#5E5E5E]/50 shrink-0" /> : <ChevronRight className="h-4 w-4 text-[#5E5E5E]/50 shrink-0" />}
                  </button>
                  {isExpanded && (
                    <div className="border-t border-[#E8E4DE] px-5 py-4 space-y-3">
                      <div className="flex flex-wrap gap-2">
                        {mp.components.map((comp) => (
                          <Link
                            key={comp.id}
                            href={`/project-builder/${comp.project.id}`}
                            className="inline-flex items-center gap-1.5 rounded-full border border-[#E8E4DE] bg-[#F9F8F6] px-2.5 py-1 text-xs text-[#5E5E5E] hover:border-[#C5A572]/40 transition-colors"
                          >
                            {comp.project.title}
                            <span className={`inline-flex items-center rounded-full border px-1.5 py-0 text-[9px] uppercase ${ROLE_BADGE[comp.role] || ROLE_BADGE.complement}`}>
                              {comp.role}
                            </span>
                          </Link>
                        ))}
                      </div>
                      {mp.milestones.length > 0 && (
                        <p className="text-xs text-[#5E5E5E]/70">
                          {doneMilestones}/{mp.milestones.length} milestones completados
                        </p>
                      )}
                      <Link
                        href={`/project-builder/meta/${mp.id}`}
                        className="inline-flex items-center gap-1 text-xs text-[#C5A572] hover:text-[#8B7355]"
                      >
                        Ver detalle <ExternalLink className="h-3 w-3" />
                      </Link>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Projects */}
        {loading ? (
          <div className="flex items-center gap-2 py-12 justify-center">
            <span className="ql-status-thinking" />
            <span className="ql-loading">Cargando proyectos...</span>
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-ql-sand py-16 text-center">
            <FolderKanban className="mb-3 h-8 w-8 text-ql-muted" strokeWidth={1} />
            <p className="ql-body font-medium">No tienes proyectos aún</p>
            <p className="ql-caption mt-1 mb-6">Crea tu primer proyecto y empieza a trabajar</p>
            <Link href="/project-builder/new" className="ql-btn-primary">
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
                    <div className={`flex items-center gap-2 rounded-md border px-3 py-1.5 ${info.borderColor} ${info.bgColor}`}>
                      <span className={`h-2 w-2 rounded-full ${info.dotColor}`} />
                      <span className={`text-sm font-semibold ${info.color}`}>{info.label}</span>
                      <span className={`rounded-full px-1.5 py-0.5 text-xs font-medium ${info.bgColor} ${info.color} border ${info.borderColor}`}>
                        {groupProjects.length}
                      </span>
                    </div>
                    <div className="flex-1 border-t border-ql-sand/20" />
                    {isCollapsed ? (
                      <ChevronRight className="h-4 w-4 text-ql-muted" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-ql-muted" />
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
                            className="ql-card flex items-center gap-4 hover:border-ql-sand/40"
                          >
                            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${info.bgColor}`}>
                              <span className={`h-2.5 w-2.5 rounded-full ${info.dotColor}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-ql-charcoal truncate">{project.title}</p>
                              <p className="ql-caption normal-case tracking-normal">Paso {project.currentStep} de 5</p>
                            </div>
                            <div className="flex items-center gap-4 shrink-0">
                              <div className="text-right">
                                <p className="text-sm font-medium text-ql-graphite">{project.progress}%</p>
                                <div className="mt-1 h-1 w-24 overflow-hidden rounded-full bg-ql-cream">
                                  <div
                                    className="h-full bg-ql-accent transition-all"
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
