"use client";

import { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/ui/header";
import {
  KanbanSquare,
  Loader2,
  RefreshCw,
  ArrowRight,
  Trash2,
  AlertCircle,
  Plus,
  Tag,
  Zap,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type TaskStatus = "backlog" | "todo" | "in_progress" | "review" | "done";

interface AgileTask {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: string;
  type: string;
  storyPoints: number | null;
  labels: string[];
  sprint: number | null;
  createdAt: string;
}

// ─── Column config ────────────────────────────────────────────────────────────

const COLUMNS: {
  id: TaskStatus;
  label: string;
  sublabel: string;
  accent: string;
  bg: string;
  border: string;
  dot: string;
  nextStatus: TaskStatus | null;
}[] = [
  {
    id: "backlog",
    label: "Backlog",
    sublabel: "Por priorizar",
    accent: "text-gray-600",
    bg: "bg-gray-50",
    border: "border-gray-200",
    dot: "bg-gray-400",
    nextStatus: "todo",
  },
  {
    id: "todo",
    label: "To Do",
    sublabel: "Listo para empezar",
    accent: "text-blue-600",
    bg: "bg-blue-50/60",
    border: "border-blue-100",
    dot: "bg-blue-400",
    nextStatus: "in_progress",
  },
  {
    id: "in_progress",
    label: "In Progress",
    sublabel: "En ejecución",
    accent: "text-amber-600",
    bg: "bg-amber-50/60",
    border: "border-amber-100",
    dot: "bg-amber-400",
    nextStatus: "review",
  },
  {
    id: "review",
    label: "Review",
    sublabel: "Pendiente revisión",
    accent: "text-purple-600",
    bg: "bg-purple-50/60",
    border: "border-purple-100",
    dot: "bg-purple-400",
    nextStatus: "done",
  },
  {
    id: "done",
    label: "Done",
    sublabel: "Completado",
    accent: "text-emerald-600",
    bg: "bg-emerald-50/60",
    border: "border-emerald-100",
    dot: "bg-emerald-400",
    nextStatus: null,
  },
];

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  critical: { label: "Must Have", color: "bg-red-100 text-red-700 border-red-200" },
  high: { label: "Should Have", color: "bg-orange-100 text-orange-700 border-orange-200" },
  medium: { label: "Could Have", color: "bg-blue-100 text-blue-700 border-blue-200" },
  low: { label: "Won't Have", color: "bg-gray-100 text-gray-600 border-gray-200" },
};

const TYPE_ICONS: Record<string, string> = {
  task: "◆",
  bug: "⬤",
  feature: "★",
  research: "◎",
};

// ─── Task Card ────────────────────────────────────────────────────────────────

function TaskCard({
  task,
  column,
  onMove,
  onDelete,
  moving,
}: {
  task: AgileTask;
  column: (typeof COLUMNS)[0];
  onMove: (id: string, status: TaskStatus) => void;
  onDelete: (id: string) => void;
  moving: string | null;
}) {
  const isMoving = moving === task.id;
  const priority = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.medium;
  const expertLabel = task.labels.find((l) =>
    ["lean-strategist", "tech-futurist", "market-analyst", "risk-assessor",
      "ux-visionary", "financial-expert", "growth-hacker", "operations-expert"].includes(l)
  );

  return (
    <div
      className={`rounded-xl border bg-white p-4 shadow-sm transition-all hover:shadow-md ${column.border}`}
    >
      {/* Top row */}
      <div className="mb-2.5 flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`rounded-md border px-1.5 py-0.5 text-xs font-semibold ${priority.color}`}>
            {priority.label}
          </span>
          <span className="text-xs text-gray-400" title={task.type}>
            {TYPE_ICONS[task.type] ?? "◆"}
          </span>
        </div>
        {task.storyPoints !== null && (
          <span className="shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-600">
            {task.storyPoints}
          </span>
        )}
      </div>

      {/* Title */}
      <p className="text-sm font-medium text-gray-900 leading-snug mb-2">{task.title}</p>

      {/* Expert source tag */}
      {expertLabel && (
        <div className="mb-2.5 flex items-center gap-1">
          <Zap className="h-3 w-3 text-indigo-400" />
          <span className="text-xs text-indigo-600 font-medium capitalize">
            {expertLabel.replace(/-/g, " ")}
          </span>
        </div>
      )}

      {/* Other labels */}
      {task.labels.filter((l) => l !== expertLabel).length > 0 && (
        <div className="mb-2.5 flex flex-wrap gap-1">
          {task.labels.filter((l) => l !== expertLabel).slice(0, 3).map((label) => (
            <span
              key={label}
              className="inline-flex items-center gap-1 rounded-md bg-gray-50 border border-gray-100 px-2 py-0.5 text-xs text-gray-500"
            >
              <Tag className="h-2.5 w-2.5" />
              {label}
            </span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2 border-t border-gray-50">
        {column.nextStatus && (
          <button
            onClick={() => onMove(task.id, column.nextStatus!)}
            disabled={isMoving}
            className={`flex-1 inline-flex items-center justify-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${column.bg} ${column.accent} hover:opacity-80`}
          >
            {isMoving ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <ArrowRight className="h-3 w-3" />
            )}
            {column.nextStatus === "todo"
              ? "Priorizar"
              : column.nextStatus === "in_progress"
              ? "Iniciar"
              : column.nextStatus === "review"
              ? "A Review"
              : "Completar"}
          </button>
        )}
        <button
          onClick={() => onDelete(task.id)}
          disabled={isMoving}
          title="Eliminar"
          className="rounded-lg border border-gray-100 p-1.5 text-gray-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-colors disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AgilePage() {
  const [tasks, setTasks] = useState<Record<TaskStatus, AgileTask[]>>({
    backlog: [],
    todo: [],
    in_progress: [],
    review: [],
    done: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/agile");
      if (!res.ok) throw new Error("Failed");
      const { tasks: all } = await res.json();

      const grouped: Record<TaskStatus, AgileTask[]> = {
        backlog: [],
        todo: [],
        in_progress: [],
        review: [],
        done: [],
      };
      for (const task of all as AgileTask[]) {
        if (task.status in grouped) {
          grouped[task.status as TaskStatus].push(task);
        }
      }
      setTasks(grouped);
    } catch {
      setError("No se pudieron cargar las tareas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleMove = async (id: string, newStatus: TaskStatus) => {
    setMoving(id);
    try {
      const res = await fetch(`/api/agile/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Move failed");

      setTasks((prev) => {
        const allItems = Object.values(prev).flat();
        const moved = allItems.find((t) => t.id === id);
        if (!moved) return prev;

        const updated = { ...prev };
        (Object.keys(updated) as TaskStatus[]).forEach((col) => {
          updated[col] = updated[col].filter((t) => t.id !== id);
        });
        updated[newStatus] = [{ ...moved, status: newStatus }, ...updated[newStatus]];
        return updated;
      });
    } catch {
      fetchTasks();
    } finally {
      setMoving(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar esta tarea?")) return;
    setMoving(id);
    try {
      await fetch(`/api/agile/${id}`, { method: "DELETE" });
      setTasks((prev) => {
        const updated = { ...prev };
        (Object.keys(updated) as TaskStatus[]).forEach((col) => {
          updated[col] = updated[col].filter((t) => t.id !== id);
        });
        return updated;
      });
    } catch {
      fetchTasks();
    } finally {
      setMoving(null);
    }
  };

  const totalTasks = Object.values(tasks).flat().length;
  const doneTasks = tasks.done.length;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="Agile Backlog" subtitle="V4 · Ejecución" />

      <div className="p-6">
        {/* Top bar */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <p className="text-sm text-gray-500">
              <span className="font-semibold text-gray-900">{totalTasks}</span> tareas ·{" "}
              <span className="font-semibold text-emerald-600">{doneTasks} completadas</span>
            </p>
            <button
              onClick={fetchTasks}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
              Actualizar
            </button>
          </div>
          <div className="flex items-center gap-2">
            <KanbanSquare className="h-4 w-4 text-gray-400" />
            <span className="text-xs text-gray-400">Sprint Kanban</span>
          </div>
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Kanban */}
        {loading ? (
          <div className="flex items-center justify-center py-32">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {COLUMNS.map((col) => (
              <div key={col.id}>
                {/* Column header */}
                <div
                  className={`mb-3 flex items-center justify-between rounded-xl border px-3.5 py-2.5 ${col.bg} ${col.border}`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${col.dot}`} />
                    <div>
                      <p className={`text-xs font-semibold ${col.accent}`}>{col.label}</p>
                      <p className="text-xs text-gray-400">{col.sublabel}</p>
                    </div>
                  </div>
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${col.bg} ${col.accent}`}
                  >
                    {tasks[col.id].length}
                  </span>
                </div>

                {/* Cards */}
                <div className="space-y-2.5">
                  {tasks[col.id].length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 py-8 text-center">
                      <Plus className="mb-1 h-4 w-4 text-gray-300" />
                      <p className="text-xs text-gray-400">Sin tareas</p>
                    </div>
                  ) : (
                    tasks[col.id].map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        column={col}
                        onMove={handleMove}
                        onDelete={handleDelete}
                        moving={moving}
                      />
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
