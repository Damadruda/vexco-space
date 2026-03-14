"use client";

import { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/ui/header";
import {
  Inbox,
  Plus,
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Tag,
  ExternalLink,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AnalysisResult {
  id: string;
  summary: string;
  keyInsights: string[];
  suggestedTags: string[];
  category: string;
  sentiment: string;
  relevanceScore: number;
}

interface InboxItem {
  id: string;
  type: string;
  rawContent: string;
  sourceUrl?: string;
  sourceTitle?: string;
  status: string;
  priority: string;
  tags: string[];
  createdAt: string;
  analysis?: AnalysisResult | null;
}

type StatusFilter = "all" | "unprocessed" | "processed" | "archived";

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  unprocessed: "Sin procesar",
  processing: "Procesando",
  processed: "Procesado",
  archived: "Archivado",
};

const STATUS_COLORS: Record<string, string> = {
  unprocessed: "bg-amber-100 text-amber-700",
  processing: "bg-blue-100 text-blue-700",
  processed: "bg-green-100 text-green-700",
  archived: "bg-slate-100 text-slate-500",
};

const CATEGORY_COLORS: Record<string, string> = {
  project: "bg-purple-100 text-purple-700",
  trend: "bg-blue-100 text-blue-700",
  discovery: "bg-green-100 text-green-700",
  noise: "bg-slate-100 text-slate-500",
};

const TYPE_ICONS: Record<string, string> = {
  url: "🔗",
  text: "📝",
  document: "📄",
  image: "🖼️",
};

// ─── Add Form ─────────────────────────────────────────────────────────────────

function AddItemForm({ onSuccess, onClose }: { onSuccess: () => void; onClose: () => void }) {
  const [type, setType] = useState<"url" | "text">("url");
  const [rawContent, setRawContent] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceTitle, setSourceTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawContent.trim()) return;
    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          rawContent,
          sourceUrl: sourceUrl || undefined,
          sourceTitle: sourceTitle || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al guardar");
      }

      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="mb-4 font-semibold text-slate-800">Añadir al Inbox</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex gap-2">
          {(["url", "text"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                type === t
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {t === "url" ? "🔗 URL" : "📝 Texto"}
            </button>
          ))}
        </div>

        {type === "url" && (
          <>
            <input
              type="url"
              placeholder="https://..."
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
            />
            <input
              type="text"
              placeholder="Título (opcional)"
              value={sourceTitle}
              onChange={(e) => setSourceTitle(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
            />
          </>
        )}

        <textarea
          placeholder={type === "url" ? "Descripción o notas sobre este enlace..." : "Escribe tu nota..."}
          value={rawContent}
          onChange={(e) => setRawContent(e.target.value)}
          rows={3}
          required
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 resize-none"
        />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving || !rawContent.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
            Guardar
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Item Card ────────────────────────────────────────────────────────────────

function ItemCard({
  item,
  onAnalyzed,
}: {
  item: InboxItem;
  onAnalyzed: (id: string, analysis: AnalysisResult) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState("");

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setAnalyzeError("");
    try {
      const res = await fetch(`/api/inbox/${item.id}/analyze`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error en el análisis");
      }
      const data = await res.json();
      onAnalyzed(item.id, data.analysis);
      setExpanded(true);
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : "Error");
    } finally {
      setAnalyzing(false);
    }
  };

  const analysis = item.analysis;

  return (
    <div className="rounded-xl border border-slate-200 bg-white transition-all hover:border-slate-300">
      {/* Header row */}
      <div
        className="flex cursor-pointer items-start gap-3 p-4"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-lg">{TYPE_ICONS[item.type] ?? "📌"}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-slate-800 text-sm truncate">
              {item.sourceTitle || item.rawContent.slice(0, 80)}
            </p>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                STATUS_COLORS[item.status] ?? "bg-slate-100 text-slate-500"
              }`}
            >
              {STATUS_LABELS[item.status] ?? item.status}
            </span>
            {analysis && (
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                  CATEGORY_COLORS[analysis.category] ?? "bg-slate-100 text-slate-500"
                }`}
              >
                {analysis.category}
              </span>
            )}
            {analysis && (
              <span className="shrink-0 text-xs text-slate-400">
                {Math.round(analysis.relevanceScore * 100)}% relevancia
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-400">
              {new Date(item.createdAt).toLocaleDateString("es-ES")}
            </span>
            {item.sourceUrl && (
              <a
                href={item.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-0.5 text-xs text-blue-500 hover:text-blue-700"
              >
                <ExternalLink className="h-3 w-3" />
                Abrir
              </a>
            )}
            {item.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="inline-flex items-center gap-0.5 text-xs text-slate-400">
                <Tag className="h-2.5 w-2.5" />
                {tag}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {item.status === "unprocessed" && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleAnalyze();
              }}
              disabled={analyzing}
              className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {analyzing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              Analizar
            </button>
          )}
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          )}
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-3">
          <p className="text-sm text-slate-600">{item.rawContent}</p>

          {analyzeError && (
            <p className="text-xs text-red-600">{analyzeError}</p>
          )}

          {analysis && (
            <div className="rounded-lg bg-slate-50 p-3 space-y-2">
              <p className="text-sm font-medium text-slate-700">Análisis IA</p>
              <p className="text-sm text-slate-600">{analysis.summary}</p>
              {analysis.keyInsights.length > 0 && (
                <ul className="space-y-1">
                  {analysis.keyInsights.map((insight, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-slate-600">
                      <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400" />
                      {insight}
                    </li>
                  ))}
                </ul>
              )}
              {analysis.suggestedTags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {analysis.suggestedTags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-white border border-slate-200 px-2 py-0.5 text-xs text-slate-500"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InboxPage() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [showAddForm, setShowAddForm] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string>("");

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = filter !== "all" ? `?status=${filter}` : "";
      const res = await fetch(`/api/inbox${params}`);
      const data = await res.json();
      setItems(data.items ?? []);
    } catch (err) {
      console.error("Error fetching inbox:", err);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleSyncRaindrop = async () => {
    setSyncing(true);
    setSyncResult("");
    try {
      const res = await fetch("/api/inbox/sync-raindrop", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setSyncResult(`Error: ${data.error}`);
      } else {
        setSyncResult(`${data.imported} importados, ${data.skipped} omitidos`);
        fetchItems();
      }
    } catch {
      setSyncResult("Error de red");
    } finally {
      setSyncing(false);
    }
  };

  const handleAnalyzed = (id: string, analysis: AnalysisResult) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, status: "processed", analysis } : item
      )
    );
  };

  const filters: StatusFilter[] = ["all", "unprocessed", "processed", "archived"];

  const unprocessedCount = items.filter((i) => i.status === "unprocessed").length;

  return (
    <div className="min-h-screen">
      <Header title="Inbox" />

      <div className="p-6 space-y-6">
        {/* Page header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Inbox de Captura</h2>
            <p className="text-slate-500">
              {unprocessedCount > 0
                ? `${unprocessedCount} item${unprocessedCount > 1 ? "s" : ""} sin procesar`
                : "Todo procesado"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {syncResult && (
              <span className="text-sm text-slate-500">{syncResult}</span>
            )}
            <button
              onClick={handleSyncRaindrop}
              disabled={syncing}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {syncing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Sync Raindrop
            </button>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              <Plus className="h-4 w-4" />
              Añadir manual
            </button>
          </div>
        </div>

        {/* Add form */}
        {showAddForm && (
          <AddItemForm
            onSuccess={fetchItems}
            onClose={() => setShowAddForm(false)}
          />
        )}

        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                filter === f
                  ? "bg-slate-900 text-white"
                  : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {f === "all" ? "Todos" : STATUS_LABELS[f] ?? f}
            </button>
          ))}
        </div>

        {/* Items list */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 py-16 text-center">
            <Inbox className="mb-3 h-10 w-10 text-slate-300" />
            <p className="font-medium text-slate-500">El inbox está vacío</p>
            <p className="mt-1 text-sm text-slate-400">
              Añade un item manualmente o sincroniza Raindrop
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                onAnalyzed={handleAnalyzed}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
