"use client";

import { useState, useEffect } from "react";
import { ProjectCard } from "./project-card";
import { Plus, Loader2 } from "lucide-react";
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
}

const columns = [
  { id: "idea", title: "Ideas", number: "01" },
  { id: "development", title: "En Desarrollo", number: "02" },
  { id: "execution", title: "Ejecución", number: "03" },
  { id: "completed", title: "Completado", number: "04" }
];

export function KanbanBoard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [draggedProject, setDraggedProject] = useState<string | null>(null);

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

  const handleDragStart = (e: React.DragEvent, projectId: string) => {
    setDraggedProject(projectId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = async (e: React.DragEvent, newStatus: string) => {
    e.preventDefault();
    if (!draggedProject) return;

    const project = projects.find((p) => p.id === draggedProject);
    if (!project || project.status === newStatus) {
      setDraggedProject(null);
      return;
    }

    // Optimistic update
    setProjects((prev) =>
      prev.map((p) => (p.id === draggedProject ? { ...p, status: newStatus } : p))
    );

    try {
      await fetch(`/api/projects/${draggedProject}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus })
      });
    } catch (error) {
      console.error("Error updating project:", error);
      fetchProjects(); // Revert on error
    }

    setDraggedProject(null);
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

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
      {columns.map((column) => {
        const columnProjects = projects.filter((p) => p.status === column.id);
        return (
          <div
            key={column.id}
            className="flex flex-col"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, column.id)}
          >
            {/* Column Header */}
            <div className="mb-4 flex items-center gap-3 border-b border-gray-200 pb-3">
              <span className="text-xs font-light text-gray-300">[{column.number}]</span>
              <h3 className="text-sm font-medium text-gray-700">{column.title}</h3>
              <span className="ml-auto text-xs text-gray-400">
                {columnProjects.length}
              </span>
            </div>

            {/* Cards */}
            <div className="flex-1 space-y-3 min-h-[200px]">
              {columnProjects.map((project) => (
                <div
                  key={project.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, project.id)}
                  className="cursor-grab active:cursor-grabbing"
                >
                  <ProjectCard
                    {...project}
                    isDragging={draggedProject === project.id}
                    onDelete={handleDelete}
                  />
                </div>
              ))}

              {/* Add Button */}
              {column.id === "idea" && (
                <Link
                  href="/project-builder/new"
                  className="flex items-center justify-center gap-2 border border-dashed border-gray-300 py-4 text-sm text-gray-400 transition-all hover:border-gray-400 hover:text-gray-600"
                >
                  <Plus className="h-4 w-4" />
                  Nuevo Proyecto
                </Link>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}