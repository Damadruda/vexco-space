"use client";

import { useState, useEffect, useCallback } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  useDroppable,
  useDraggable,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
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
  GripVertical,
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
  dropRing: string;
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
    dropRing: "ring-gray-300",
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
    dropRing: "ring-blue-300",
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
    dropRing: "ring-amber-300",
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
    dropRing: "ring-purple-300",
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
    dropRing: "ring-emerald-300",
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

// ─── Pure Task Card (no DnD — used inside DragOverlay too) ───────────────────

function TaskCardContent({
  task,
  column,
  onMove,
  onDelete,
  moving,
  isDragging = false,
}: {
  task: AgileTask;
  column: (typeof COLUMNS)[0];
  onMove?: (id: string, status: TaskStatus) => void;
  onDelete?: (id: string) => void;
  moving: string | null;
  isDragging?: boolean;
}) {
  const isMoving = moving === task.id;
  const priority = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.medium;
  const expertLabel = task.labels.find((l) =>
    ["lean-strategist","tech-futurist","market-analyst","risk-assessor",
     "ux-visionary","financial-expert","growth-hacker","operations-expert"].includes(l)
  );

  return (
    <div
      className={`rounded-xl border bg-white p-4 shadow-sm transition-all ${
        isDragging ? "shadow-xl ring-2 ring-indigo-300 rotate-1 scale-105" : "hover:shadow-md"
      } ${column.border}`}
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

      <p className="text-sm font-medium text-gray-900 leading-snug mb-2">{task.title}</p>

      {expertLabel && (
        <div className="mb-2.5 flex items-center gap-1">
          <Zap className="h-3 w-3 text-indigo-400" />
          <span className="text-xs text-indigo-600 font-medium capitalize">
            {expertLabel.replace(/-/g, " ")}
          </span>
        </div>
      )}

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

      {!isDragging && onMove && onDelete && (
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
              {column.nextStatus === "todo" ? "Priorizar"
                : column.nextStatus === "in_progress" ? "Iniciar"
                : column.nextStatus === "review" ? "A Review"
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
      )}
    </div>
  );
}

// ─── Draggable Card Wrapper ───────────────────────────────────────────────────

function DraggableCard({
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
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { task, columnId: column.id },
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={isDragging ? "opacity-30" : ""}
    >
      <div className="relative">
        {/* Drag handle */}
        <button
          {...listeners}
          {...attributes}
          className="absolute -left-1 top-1/2 -translate-y-1/2 z-10 flex h-6 w-4 cursor-grab items-center justify-center rounded text-gray-300 hover:text-gray-500 active:cursor-grabbing touch-none focus:outline-none"
          title="Arrastrar"
          tabIndex={-1}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <div className="pl-3">
          <TaskCardContent
            task={task}
            column={column}
            onMove={onMove}
            onDelete={onDelete}
            moving={moving}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Droppable Column ─────────────────────────────────────────────────────────

function DroppableColumn({
  column,
  tasks,
  onMove,
  onDelete,
  moving,
  activeTaskId,
}: {
  column: (typeof COLUMNS)[0];
  tasks: AgileTask[];
  onMove: (id: string, status: TaskStatus) => void;
  onDelete: (id: string) => void;
  moving: string | null;
  activeTaskId: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <div>
      {/* Header */}
      <div
        className={`mb-3 flex items-center justify-between rounded-xl border px-3.5 py-2.5 transition-all ${column.bg} ${column.border} ${
          isOver ? `ring-2 ${column.dropRing}` : ""
        }`}
      >
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${column.dot}`} />
          <div>
            <p className={`text-xs font-semibold ${column.accent}`}>{column.label}</p>
            <p className="text-xs text-gray-400">{column.sublabel}</p>
          </div>
        </div>
        <span className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${column.bg} ${column.accent}`}>
          {tasks.length}
        </span>
      </div>

      {/* Drop area */}
      <div
        ref={setNodeRef}
        className={`min-h-[80px] space-y-2.5 rounded-xl transition-all ${
          isOver ? `bg-indigo-50/40 ring-2 ring-inset ${column.dropRing}` : ""
        }`}
      >
        {tasks.length === 0 ? (
          <div
            className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-8 text-center transition-all ${
              isOver ? "border-indigo-300 bg-indigo-50" : "border-gray-200"
            }`}
          >
            <Plus className="mb-1 h-4 w-4 text-gray-300" />
            <p className="text-xs text-gray-400">
              {isOver ? "Soltar aquí" : "Sin tareas"}
            </p>
          </div>
        ) : (
          tasks.map((task) => (
            <DraggableCard
              key={task.id}
              task={task}
              column={column}
              onMove={onMove}
              onDelete={onDelete}
              moving={moving}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AgilePage() {
  const [tasks, setTasks] = useState<Record<TaskStatus, AgileTask[]>>({
    backlog: [], todo: [], in_progress: [], review: [], done: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [activeTask, setActiveTask] = useState<AgileTask | null>(null);
  const [activeColumn, setActiveColumn] = useState<(typeof COLUMNS)[0] | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/agile");
      if (!res.ok) throw new Error("Failed");
      const { tasks: all } = await res.json();

      const grouped: Record<TaskStatus, AgileTask[]> = {
        backlog: [], todo: [], in_progress: [], review: [], done: [],
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

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const handleMove = useCallback(async (id: string, newStatus: TaskStatus) => {
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
  }, [fetchTasks]);

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

  // ── DnD handlers ────────────────────────────────────────────────────────────

  function handleDragStart(event: DragStartEvent) {
    const { active } = event;
    const taskId = active.id as string;
    const allTasks = Object.values(tasks).flat();
    const task = allTasks.find((t) => t.id === taskId) ?? null;
    const col = COLUMNS.find((c) => tasks[c.id].some((t) => t.id === taskId)) ?? null;
    setActiveTask(task);
    setActiveColumn(col);
  }

  function handleDragOver(_event: DragOverEvent) {
    // No-op: we move on dragEnd only
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveTask(null);
    setActiveColumn(null);

    if (!over) return;

    const taskId = active.id as string;
    const targetColumnId = over.id as TaskStatus;

    // Validate target is a column
    if (!COLUMNS.some((c) => c.id === targetColumnId)) return;

    // Find current column
    const currentColumnId = (Object.keys(tasks) as TaskStatus[]).find((col) =>
      tasks[col].some((t) => t.id === taskId)
    );

    if (!currentColumnId || currentColumnId === targetColumnId) return;

    handleMove(taskId, targetColumnId);
  }

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
            <GripVertical className="h-4 w-4 text-gray-300" />
            <KanbanSquare className="h-4 w-4 text-gray-400" />
            <span className="text-xs text-gray-400">Drag & Drop activado</span>
          </div>
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Kanban con DnD */}
        {loading ? (
          <div className="flex items-center justify-center py-32">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {COLUMNS.map((col) => (
                <DroppableColumn
                  key={col.id}
                  column={col}
                  tasks={tasks[col.id]}
                  onMove={handleMove}
                  onDelete={handleDelete}
                  moving={moving}
                  activeTaskId={activeTask?.id ?? null}
                />
              ))}
            </div>

            {/* Floating overlay while dragging */}
            <DragOverlay dropAnimation={{ duration: 200, easing: "ease" }}>
              {activeTask && activeColumn ? (
                <div className="w-64 rotate-2">
                  <TaskCardContent
                    task={activeTask}
                    column={activeColumn}
                    moving={null}
                    isDragging
                  />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>
    </div>
  );
}
