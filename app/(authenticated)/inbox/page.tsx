"use client";

import { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/ui/header";
import {
  Inbox,
  Plus,
  RefreshCw,
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
    <div className="ql-card">
      <h3 className="ql-h3 mb-4">Añadir al Inbox</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex gap-2">
          {(["url", "text"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={type === t ? "ql-btn-primary" : "ql-btn-ghost"}
            >
              {t === "url" ? "URL" : "Texto"}
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
              className="ql-input"
            />
            <input
              type="text"
              placeholder="Título (opcional)"
              value={sourceTitle}
              onChange={(e) => setSourceTitle(e.target.value)}
              className="ql-input"
            />
          </>
        )}

        <textarea
          placeholder={type === "url" ? "Notas sobre este enlace..." : "Escribe tu nota..."}
          value={rawContent}
          onChange={(e) => setRawContent(e.target.value)}
          rows={3}
          required
          className="ql-textarea"
        />

        {error && <p className="text-xs text-ql-danger mt-1">{error}</p>}

        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="ql-btn-ghost">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving || !rawContent.trim()}
            className="ql-btn-primary disabled:opacity-50"
          >
            {saving && <span className="ql-status-thinking" />}
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
    <div className="ql-card">
      {/* Header row */}
      <div
        className="flex cursor-pointer items-start gap-3"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-base">{TYPE_ICONS[item.type] ?? "📌"}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-ql-charcoal text-sm truncate">
              {item.sourceTitle || item.rawContent.slice(0, 80)}
            </p>
            <span
              className={`ql-badge shrink-0 ${
                STATUS_COLORS[item.status] ?? "bg-ql-cream text-ql-slate"
              }`}
            >
              {STATUS_LABELS[item.status] ?? item.status}
            </span>
            {analysis && (
              <span
                className={`ql-badge shrink-0 ${
                  CATEGORY_COLORS[analysis.category] ?? "bg-ql-cream text-ql-slate"
                }`}
              >
                {analysis.category}
              </span>
            )}
            {analysis && (
              <span className="ql-caption shrink-0">
                {Math.round(analysis.relevanceScore * 100)}% relevancia
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <span className="ql-caption">
              {new Date(item.createdAt).toLocaleDateString("es-ES")}
            </span>
            {item.sourceUrl && (
              <a
                href={item.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-0.5 text-xs text-ql-accent hover:text-ql-charcoal transition-colors"
              >
                <ExternalLink className="h-3 w-3" />
                Abrir
              </a>
            )}
            {item.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="ql-badge-default inline-flex items-center gap-0.5">
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
              className="ql-btn-secondary text-xs py-1.5 px-3 disabled:opacity-50"
            >
              {analyzing ? (
                <span className="ql-status-thinking" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              Analizar
            </button>
          )}
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-ql-muted" />
          ) : (
            <ChevronDown className="h-4 w-4 text-ql-muted" />
          )}
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="mt-4 pt-4 border-t border-ql-sand/20 space-y-3">
          <p className="ql-body">{item.rawContent}</p>

          {analyzeError && (
            <p className="text-xs text-ql-danger">{analyzeError}</p>
          )}

          {analysis && (
            <div className="rounded-md bg-ql-offwhite p-4 space-y-3">
              <p className="ql-label">Análisis IA</p>
              <p className="ql-body">{analysis.summary}</p>
              {analysis.keyInsights.length > 0 && (
                <ul className="space-y-1">
                  {analysis.keyInsights.map((insight, i) => (
                    <li key={i} className="flex items-start gap-1.5 ql-body">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ql-accent" />
                      {insight}
                    </li>
                  ))}
                </ul>
              )}
              {analysis.suggestedTags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {analysis.suggestedTags.map((tag) => (
                    <span key={tag} className="ql-badge-default">{tag}</span>
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
    <div className="ql-page">
      <Header title="Inbox" />

      <div className="p-6 space-y-6">
        {/* Page header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="ql-h1">Inbox</h1>
            <p className="ql-body mt-1">
              {unprocessedCount > 0
                ? `${unprocessedCount} item${unprocessedCount > 1 ? "s" : ""} sin procesar`
                : "Todo procesado"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {syncResult && (
              <span className="ql-caption">{syncResult}</span>
            )}
            <button
              onClick={handleSyncRaindrop}
              disabled={syncing}
              className="ql-btn-secondary disabled:opacity-50"
            >
              {syncing ? (
                <span className="ql-status-thinking" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Sync Raindrop
            </button>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="ql-btn-primary"
            >
              <Plus className="h-4 w-4" />
              Añadir
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
              className={filter === f ? "ql-btn-primary text-xs py-1.5 px-3" : "ql-btn-ghost text-xs py-1.5 px-3"}
            >
              {f === "all" ? "Todos" : STATUS_LABELS[f] ?? f}
            </button>
          ))}
        </div>

        {/* Items list */}
        {loading ? (
          <div className="flex items-center gap-2 py-16 justify-center">
            <span className="ql-status-thinking" />
            <span className="ql-loading">Cargando inbox...</span>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-ql-sand py-16 text-center">
            <Inbox className="mb-3 h-8 w-8 text-ql-muted" strokeWidth={1} />
            <p className="ql-body font-medium">El inbox está vacío</p>
            <p className="ql-caption mt-1">
              Añade un item o sincroniza Raindrop
            </p>
          </div>
        ) : (
          <div className="space-y-3">
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
