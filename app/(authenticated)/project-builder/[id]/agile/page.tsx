"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { Header } from "@/components/ui/header";
import { Plus, Loader2, Trash2, GripVertical, Flag } from "lucide-react";

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
  { id: "backlog", label: "Backlog", number: "01", color: "bg-gray-100 text-gray-600" },
  { id: "in-progress", label: "En Progreso", number: "02", color: "bg-blue-50 text-blue-600" },
  { id: "review", label: "Revisión", number: "03", color: "bg-amber-50 text-amber-600" },
  { id: "done", label: "Completado", number: "04", color: "bg-green-50 text-green-600" },
];

const PRIORITY_COLORS: Record<string, string> = {
  high: "text-red-500",
  medium: "text-amber-500",
  low: "text-gray-400",
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
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header title="Agile" subtitle={projectTitle} />

      <div className="p-6">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((col) => {
            const colTasks = tasks.filter((t) => t.status === col.id);
            return (
              <div
                key={col.id}
                className="flex flex-col rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden"
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, col.id)}
              >
                {/* Column header */}
                <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
                  <span className="text-xs font-light text-gray-300">[{col.number}]</span>
                  <h3 className="flex-1 text-sm font-semibold text-slate-700">{col.label}</h3>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${col.color}`}>
                    {colTasks.length}
                  </span>
                </div>

                {/* Tasks */}
                <div className="flex-1 space-y-2 p-3 min-h-[120px]">
                  {colTasks.map((task) => (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={() => handleDragStart(task.id)}
                      className={`group rounded-lg border border-slate-200 bg-white p-3 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md transition-shadow ${
                        draggedId === task.id ? "opacity-50" : ""
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <GripVertical className="h-3.5 w-3.5 mt-0.5 text-gray-300 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 leading-snug">{task.title}</p>
                          {task.description && (
                            <p className="mt-1 text-xs text-slate-400 line-clamp-2">{task.description}</p>
                          )}
                          <div className="mt-2 flex items-center gap-2">
                            <Flag className={`h-3 w-3 ${PRIORITY_COLORS[task.priority] ?? "text-gray-400"}`} />
                            <span className="text-xs text-slate-400 capitalize">{task.priority}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDelete(task.id)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-slate-300 hover:text-red-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Inline add form */}
                  {addingTo === col.id ? (
                    <div className="rounded-lg border border-slate-300 bg-white p-3 shadow-sm">
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
                        className="w-full text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
                      />
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() => handleAddTask(col.id)}
                          className="rounded-md bg-slate-800 px-3 py-1 text-xs font-medium text-white hover:bg-slate-700"
                        >
                          Agregar
                        </button>
                        <button
                          onClick={() => { setAddingTo(null); setNewTitle(""); }}
                          className="rounded-md px-3 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
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
                    className="flex w-full items-center gap-2 rounded-lg border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-400 hover:border-slate-400 hover:text-slate-600 transition-colors"
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
