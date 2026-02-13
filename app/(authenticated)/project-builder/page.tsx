"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/ui/header";
import { ProjectCard } from "@/components/ui/project-card";
import { DriveProjectImporter } from "@/components/ui/drive-project-importer";
import { Plus, FolderKanban, Loader2, LayoutGrid, List, CloudDownload } from "lucide-react";
import Link from "next/link";

interface Project {
  id: string;
  title: string;
  description?: string | null;
  status: string;
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

  return (
    <div className="min-h-screen">
      <Header title="Project Builder" />

      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Constructor de Proyectos</h2>
            <p className="text-slate-500">Framework de 5 pasos para estructurar tus ideas</p>
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

        {/* Framework Info */}
        <div className="rounded-xl bg-gray-900 p-6 text-white">
          <h3 className="font-serif text-lg font-medium">Framework de 5 Pasos</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-5">
            {[
              { step: 1, title: "Concepto", desc: "¿Qué problema resuelve?" },
              { step: 2, title: "Mercado", desc: "¿Quién lo necesita?" },
              { step: 3, title: "Modelo", desc: "¿Cómo genera valor?" },
              { step: 4, title: "Acción", desc: "¿Cómo lo ejecuto?" },
              { step: 5, title: "Recursos", desc: "¿Qué necesito?" }
            ].map(({ step, title, desc }) => (
              <div key={step} className="rounded-lg bg-white/10 p-3">
                <div className="mb-1 flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-sm font-bold">
                  {step}
                </div>
                <h4 className="font-medium">{title}</h4>
                <p className="text-xs text-gray-300">{desc}</p>
              </div>
            ))}
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
        ) : view === "grid" ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                {...project}
                onDelete={handleDelete}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/project-builder/${project.id}`}
                className="flex items-center gap-4 rounded-xl bg-white p-4 shadow-sm border border-slate-200 hover:shadow-md transition-shadow"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                  <FolderKanban className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-slate-800">{project.title}</h4>
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