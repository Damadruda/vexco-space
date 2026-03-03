"use client";

import { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/ui/header";
import {
  Inbox,
  Loader2,
  RefreshCw,
  ExternalLink,
  Archive,
  Trash2,
  ArrowRight,
  Plus,
  Clock,
  Tag,
  AlertCircle,
  Settings,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

// ─── Types ───────────────────────────────────────────────────────────────────

type InboxStatus = "pending" | "processing" | "analyzed" | "archived";

interface InboxItem {
  id: string;
  type: string;
  rawContent: string;
  sourceUrl: string | null;
  sourceTitle: string | null;
  status: InboxStatus;
  priority: number;
  tags: string[];
  createdAt: string;
  analysisResult: {
    summary: string;
    keyInsights: string[];
    suggestedTags: string[];
    category: string | null;
    relevanceScore: number;
  } | null;
}

// ─── Column config ────────────────────────────────────────────────────────────

const COLUMNS: {
  id: InboxStatus;
  label: string;
  sublabel: string;
  accent: string;
  bg: string;
  border: string;
  dot: string;
  nextStatus: InboxStatus | null;
  nextLabel: string | null;
}[] = [
  {
    id: "pending",
    label: "Raw Inbox",
    sublabel: "Recién capturado",
    accent: "text-blue-600",
    bg: "bg-blue-50/60",
    border: "border-blue-100",
    dot: "bg-blue-400",
    nextStatus: "processing",
    nextLabel: "Enviar al War Room",
  },
  {
    id: "processing",
    label: "War Room",
    sublabel: "En procesamiento",
    accent: "text-amber-600",
    bg: "bg-amber-50/60",
    border: "border-amber-100",
    dot: "bg-amber-400",
    nextStatus: "analyzed",
    nextLabel: "Marcar como Validado",
  },
  {
    id: "analyzed",
    label: "Validated",
    sublabel: "Listo para roadmap",
    accent: "text-emerald-600",
    bg: "bg-emerald-50/60",
    border: "border-emerald-100",
    dot: "bg-emerald-400",
    nextStatus: null,
    nextLabel: null,
  },
];

// ─── Card Component ───────────────────────────────────────────────────────────

function InboxCard({
  item,
  column,
  onMove,
  onArchive,
  onDelete,
  moving,
}: {
  item: InboxItem;
  column: (typeof COLUMNS)[0];
  onMove: (id: string, status: InboxStatus) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  moving: string | null;
}) {
  const isProcessing = moving === item.id;
  const excerpt =
    item.rawContent.length > 120
      ? item.rawContent.slice(0, 120) + "…"
      : item.rawContent;

  return (
    <div
      className={`group relative rounded-xl border bg-white/80 backdrop-blur-sm p-4 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 ${column.border}`}
    >
      {/* Type badge + date */}
      <div className="mb-3 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 capitalize">
          <span className={`h-1.5 w-1.5 rounded-full ${column.dot}`} />
          {item.type}
        </span>
        <span className="flex items-center gap-1 text-xs text-gray-400">
          <Clock className="h-3 w-3" />
          {formatDistanceToNow(new Date(item.createdAt), {
            addSuffix: true,
            locale: es,
          })}
        </span>
      </div>

      {/* Title */}
      <h3 className="mb-1.5 line-clamp-2 text-sm font-semibold text-gray-900 leading-snug">
        {item.sourceTitle || "Sin título"}
      </h3>

      {/* Excerpt */}
      <p className="mb-3 text-xs text-gray-500 leading-relaxed line-clamp-3">
        {excerpt}
      </p>

      {/* Source URL */}
      {item.sourceUrl && (
        <a
          href={item.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-3 flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 transition-colors truncate"
        >
          <ExternalLink className="h-3 w-3 shrink-0" />
          <span className="truncate">{new URL(item.sourceUrl).hostname}</span>
        </a>
      )}

      {/* Tags */}
      {item.tags.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {item.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-md bg-gray-50 border border-gray-100 px-2 py-0.5 text-xs text-gray-500"
            >
              <Tag className="h-2.5 w-2.5" />
              {tag}
            </span>
          ))}
          {item.tags.length > 4 && (
            <span className="rounded-md bg-gray-50 border border-gray-100 px-2 py-0.5 text-xs text-gray-400">
              +{item.tags.length - 4}
            </span>
          )}
        </div>
      )}

      {/* Analysis summary (if analyzed) */}
      {item.analysisResult?.summary && (
        <div className="mb-3 rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2">
          <p className="text-xs text-emerald-700 line-clamp-2">
            {item.analysisResult.summary}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1 border-t border-gray-50">
        {column.nextStatus && column.nextLabel && (
          <button
            onClick={() => onMove(item.id, column.nextStatus!)}
            disabled={isProcessing}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${column.bg} ${column.accent} hover:opacity-80`}
          >
            {isProcessing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <ArrowRight className="h-3 w-3" />
            )}
            {column.nextLabel}
          </button>
        )}
        <button
          onClick={() => onArchive(item.id)}
          disabled={isProcessing}
          title="Archivar"
          className="rounded-lg border border-gray-100 p-1.5 text-gray-400 hover:text-amber-600 hover:border-amber-200 hover:bg-amber-50 transition-colors disabled:opacity-50"
        >
          <Archive className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onDelete(item.id)}
          disabled={isProcessing}
          title="Eliminar"
          className="rounded-lg border border-gray-100 p-1.5 text-gray-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-colors disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Empty Column ──────────────────────────────────────────────────────────────

function EmptyColumn({ column }: { column: (typeof COLUMNS)[0] }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 py-12 text-center">
      <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-full ${column.bg}`}>
        <Inbox className={`h-5 w-5 ${column.accent}`} />
      </div>
      <p className="text-sm font-medium text-gray-500">Sin items</p>
      <p className="mt-1 text-xs text-gray-400">
        {column.id === "pending"
          ? "Sincroniza Raindrop para empezar"
          : "Mueve items desde la columna anterior"}
      </p>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function InboxPage() {
  const [items, setItems] = useState<Record<InboxStatus, InboxItem[]>>({
    pending: [],
    processing: [],
    analyzed: [],
    archived: [],
  });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [hasRaindropToken, setHasRaindropToken] = useState(false);

  const fetchColumn = useCallback(async (status: InboxStatus) => {
    const res = await fetch(`/api/inbox?status=${status}&limit=50`);
    if (!res.ok) throw new Error(`Failed to fetch ${status}`);
    const data = await res.json();
    return data.items as InboxItem[];
  }, []);

  const fetchAllColumns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pending, processing, analyzed] = await Promise.all([
        fetchColumn("pending"),
        fetchColumn("processing"),
        fetchColumn("analyzed"),
      ]);
      setItems((prev) => ({ ...prev, pending, processing, analyzed }));
    } catch {
      setError("No se pudieron cargar los items. Verifica tu conexión.");
    } finally {
      setLoading(false);
    }
  }, [fetchColumn]);

  useEffect(() => {
    fetchAllColumns();
    // Check if raindrop is connected
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => setHasRaindropToken(d.hasRaindropToken))
      .catch(() => {});
  }, [fetchAllColumns]);

  const handleMove = async (id: string, newStatus: InboxStatus) => {
    setMoving(id);
    try {
      const res = await fetch(`/api/inbox/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Move failed");

      // Optimistically move the card
      setItems((prev) => {
        const allItems = [...prev.pending, ...prev.processing, ...prev.analyzed];
        const moved = allItems.find((i) => i.id === id);
        if (!moved) return prev;

        const updated = { ...prev };
        // Remove from current column
        (Object.keys(updated) as InboxStatus[]).forEach((col) => {
          updated[col] = updated[col].filter((i) => i.id !== id);
        });
        // Add to new column
        updated[newStatus] = [{ ...moved, status: newStatus }, ...updated[newStatus]];
        return updated;
      });
    } catch {
      // Refresh on failure
      fetchAllColumns();
    } finally {
      setMoving(null);
    }
  };

  const handleArchive = async (id: string) => {
    setMoving(id);
    try {
      await fetch(`/api/inbox/${id}?archive=true`, { method: "DELETE" });
      setItems((prev) => {
        const updated = { ...prev };
        (Object.keys(updated) as InboxStatus[]).forEach((col) => {
          updated[col] = updated[col].filter((i) => i.id !== id);
        });
        return updated;
      });
    } catch {
      fetchAllColumns();
    } finally {
      setMoving(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este item permanentemente?")) return;
    setMoving(id);
    try {
      await fetch(`/api/inbox/${id}`, { method: "DELETE" });
      setItems((prev) => {
        const updated = { ...prev };
        (Object.keys(updated) as InboxStatus[]).forEach((col) => {
          updated[col] = updated[col].filter((i) => i.id !== id);
        });
        return updated;
      });
    } catch {
      fetchAllColumns();
    } finally {
      setMoving(null);
    }
  };

  const handleRaindropSync = async () => {
    setSyncing(true);
    try {
      await fetch("/api/automation/raindrop-sync", { method: "POST" });
      await fetchAllColumns();
    } catch {
      // ignore
    } finally {
      setSyncing(false);
    }
  };

  const totalItems =
    items.pending.length + items.processing.length + items.analyzed.length;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="Inbox V4" subtitle="Bandeja de entrada · Kanban" />

      <div className="p-6">
        {/* Top bar */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <p className="text-sm text-gray-500">
              <span className="font-semibold text-gray-900">{totalItems}</span> items activos
            </p>
            <button
              onClick={fetchAllColumns}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
              Actualizar
            </button>
          </div>

          <div className="flex items-center gap-2">
            {!hasRaindropToken && (
              <Link
                href="/settings"
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 transition-colors"
              >
                <Settings className="h-3.5 w-3.5" />
                Configurar Raindrop
                <ChevronRight className="h-3 w-3" />
              </Link>
            )}
            {hasRaindropToken && (
              <button
                onClick={handleRaindropSync}
                disabled={syncing}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50 transition-colors"
              >
                {syncing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Sync Raindrop
              </button>
            )}
            <Link
              href="/api/inbox"
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Añadir item
            </Link>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Kanban Board */}
        {loading ? (
          <div className="flex items-center justify-center py-32">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            {COLUMNS.map((col) => (
              <div key={col.id}>
                {/* Column Header */}
                <div
                  className={`mb-4 flex items-center justify-between rounded-xl border px-4 py-3 ${col.bg} ${col.border}`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className={`h-2.5 w-2.5 rounded-full ${col.dot}`} />
                    <div>
                      <p className={`text-sm font-semibold ${col.accent}`}>{col.label}</p>
                      <p className="text-xs text-gray-400">{col.sublabel}</p>
                    </div>
                  </div>
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${col.bg} ${col.accent} border ${col.border}`}
                  >
                    {items[col.id].length}
                  </span>
                </div>

                {/* Cards */}
                <div className="space-y-3">
                  {items[col.id].length === 0 ? (
                    <EmptyColumn column={col} />
                  ) : (
                    items[col.id].map((item) => (
                      <InboxCard
                        key={item.id}
                        item={item}
                        column={col}
                        onMove={handleMove}
                        onArchive={handleArchive}
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
