"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { Header } from "@/components/ui/header";
import { Plus, Trash2, GripVertical } from "lucide-react";

interface AgileTask {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  type: string;
  labels: string[];
}

const COLUMNS = [
  { id: "backlog", label: "Backlog", number: "01", countClass: "ql-badge-default" },
  { id: "in-progress", label: "En Progreso", number: "02", countClass: "ql-badge-accent" },
  { id: "review", label: "Revisión", number: "03", countClass: "ql-badge-warning" },
  { id: "done", label: "Completado", number: "04", countClass: "ql-badge-success" },
];

const PRIORITY_CLASSES: Record<string, string> = {
  high: "ql-moscow-must",
  medium: "ql-moscow-should",
  low: "ql-badge-default",
};

export default function ProjectAgilePage() {
  const params = useParams();
  const projectId = params?.id as string;

  const [tasks, setTasks] = useState<AgileTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectTitle, setProjectTitle] = useState("");
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!projectId) return;
    Promise.all([
      fetch(`/api/projects/${projectId}`).then((r) => r.json()),
      fetch(`/api/agile?projectId=${projectId}`).then((r) => r.json()),
    ])
      .then(([projData, agileData]) => {
        setProjectTitle(projData?.project?.title ?? "Proyecto");
        setTasks(agileData?.tasks ?? []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    if (addingTo) inputRef.current?.focus();
  }, [addingTo]);

  const handleAddTask = async (status: string) => {
    const title = newTitle.trim();
    if (!title) { setAddingTo(null); return; }

    const res = await fetch("/api/agile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, status, projectId }),
    });
    const data = await res.json();
    if (data.task) {
      setTasks((prev) => [...prev, data.task]);
    }
    setNewTitle("");
    setAddingTo(null);
  };

  const handleStatusChange = async (taskId: string, newStatus: string) => {
    setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: newStatus } : t));
    await fetch(`/api/agile/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
  };

  const handleDelete = async (taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    await fetch(`/api/agile/${taskId}`, { method: "DELETE" });
  };

  // Drag and drop
  const handleDragStart = (taskId: string) => setDraggedId(taskId);
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleDrop = (e: React.DragEvent, status: string) => {
    e.preventDefault();
    if (draggedId) {
      handleStatusChange(draggedId, status);
      setDraggedId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center gap-2 justify-center bg-ql-offwhite">
        <span className="ql-status-thinking" />
        <span className="ql-loading">Cargando tablero...</span>
      </div>
    );
  }

  return (
    <div className="ql-page">
      <Header title="Agile" subtitle={projectTitle} />

      <div className="p-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((col) => {
            const colTasks = tasks.filter((t) => t.status === col.id);
            return (
              <div
                key={col.id}
                className="flex flex-col rounded-lg bg-white overflow-hidden"
                style={{ border: "1px solid rgba(184, 178, 168, 0.15)" }}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, col.id)}
              >
                {/* Column header */}
                <div className="flex items-center gap-2 px-4 py-3 border-b border-ql-sand/20">
                  <h3 className="ql-label flex-1">{col.label}</h3>
                  <span className={col.countClass}>{colTasks.length}</span>
                </div>

                {/* Tasks */}
                <div className="flex-1 space-y-2 p-3 min-h-[120px]">
                  {colTasks.map((task) => (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={() => handleDragStart(task.id)}
                      className={`group ql-card p-3 cursor-grab active:cursor-grabbing ${
                        draggedId === task.id ? "opacity-50" : ""
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <GripVertical className="h-3.5 w-3.5 mt-0.5 text-ql-muted shrink-0" strokeWidth={1.5} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-ql-charcoal leading-snug">{task.title}</p>
                          {task.description && (
                            <p className="ql-body mt-1 line-clamp-2">{task.description}</p>
                          )}
                          <div className="mt-2 flex items-center gap-2">
                            <span className={PRIORITY_CLASSES[task.priority] ?? "ql-badge-default"}>
                              {task.priority}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDelete(task.id)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-ql-muted hover:text-ql-danger"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Inline add form */}
                  {addingTo === col.id ? (
                    <div className="ql-card p-3">
                      <input
                        ref={inputRef}
                        type="text"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleAddTask(col.id);
                          if (e.key === "Escape") { setAddingTo(null); setNewTitle(""); }
                        }}
                        placeholder="Título de la tarea..."
                        className="w-full text-sm text-ql-charcoal placeholder:text-ql-muted focus:outline-none bg-transparent"
                      />
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() => handleAddTask(col.id)}
                          className="ql-btn-primary text-xs py-1 px-3"
                        >
                          Agregar
                        </button>
                        <button
                          onClick={() => { setAddingTo(null); setNewTitle(""); }}
                          className="ql-btn-ghost text-xs py-1 px-3"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* Add button */}
                <div className="px-3 pb-3">
                  <button
                    onClick={() => setAddingTo(col.id)}
                    className="flex w-full items-center gap-2 rounded-md border border-dashed border-ql-sand px-3 py-2 text-xs text-ql-muted hover:border-ql-muted hover:text-ql-slate transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Agregar tarea
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
