"use client";

import { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/ui/header";
import {
  BookOpen,
  Plus,
  Loader2,
  Pencil,
  Trash2,
  X,
  Eye,
  Tag,
  ChevronLeft,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Article {
  id: string;
  title: string;
  content: string;
  contentType: string;
  category?: string;
  tags: string[];
  status: string;
  summary?: string;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
}

type StatusFilter = "all" | "draft" | "published" | "archived";

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-amber-100 text-amber-700",
  published: "bg-green-100 text-green-700",
  archived: "bg-slate-100 text-slate-500",
};

const TYPE_LABELS: Record<string, string> = {
  article: "Artículo",
  snippet: "Snippet",
  template: "Plantilla",
  reference: "Referencia",
};

// ─── Article Form ─────────────────────────────────────────────────────────────

function ArticleForm({
  initial,
  onSuccess,
  onClose,
}: {
  initial?: Partial<Article>;
  onSuccess: (article: Article) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [contentType, setContentType] = useState(initial?.contentType ?? "article");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [tagsInput, setTagsInput] = useState(initial?.tags?.join(", ") ?? "");
  const [status, setStatus] = useState(initial?.status ?? "draft");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isEditing = !!initial?.id;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    setError("");

    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const body = { title, content, contentType, category: category || undefined, tags, status };

    try {
      const res = await fetch(
        isEditing ? `/api/knowledge/${initial.id}` : "/api/knowledge",
        {
          method: isEditing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al guardar");
      }

      const data = await res.json();
      onSuccess(data.article);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-800">
          {isEditing ? "Editar artículo" : "Nuevo artículo"}
        </h3>
        <button onClick={onClose} className="rounded p-1 hover:bg-slate-100">
          <X className="h-4 w-4 text-slate-400" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="text"
          placeholder="Título del artículo"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
        />

        <div className="flex gap-2">
          <select
            value={contentType}
            onChange={(e) => setContentType(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
          >
            {Object.entries(TYPE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Categoría (opcional)"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
          >
            <option value="draft">Borrador</option>
            <option value="published">Publicado</option>
            <option value="archived">Archivado</option>
          </select>
        </div>

        <textarea
          placeholder="Contenido del artículo..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={8}
          required
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 resize-y font-mono"
        />

        <input
          type="text"
          placeholder="Tags separados por coma: ai, strategy, b2b"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
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
            disabled={saving || !title.trim() || !content.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
            {isEditing ? "Guardar cambios" : "Crear artículo"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Article Detail ───────────────────────────────────────────────────────────

function ArticleDetail({
  article,
  onEdit,
  onDelete,
  onBack,
}: {
  article: Article;
  onEdit: () => void;
  onDelete: () => void;
  onBack: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await fetch(`/api/knowledge/${article.id}`, { method: "DELETE" });
      onDelete();
    } catch {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
      >
        <ChevronLeft className="h-4 w-4" />
        Volver
      </button>

      <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-800">{article.title}</h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-slate-400">
              <span>{TYPE_LABELS[article.contentType] ?? article.contentType}</span>
              {article.category && <span>· {article.category}</span>}
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[article.status] ?? ""}`}>
                {article.status}
              </span>
              <span className="inline-flex items-center gap-1">
                <Eye className="h-3.5 w-3.5" />
                {article.viewCount} visitas
              </span>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={onEdit}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
            >
              <Pencil className="h-3.5 w-3.5" />
              Editar
            </button>
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Eliminar
              </button>
            ) : (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "¿Confirmar?"}
              </button>
            )}
          </div>
        </div>

        {article.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {article.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500"
              >
                <Tag className="h-3 w-3" />
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="prose prose-sm max-w-none rounded-lg bg-slate-50 p-4 text-slate-700 whitespace-pre-wrap font-mono text-sm">
          {article.content}
        </div>

        <p className="text-xs text-slate-400">
          Actualizado {new Date(article.updatedAt).toLocaleDateString("es-ES")}
        </p>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function KnowledgePage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<Article | null>(null);
  const [editing, setEditing] = useState(false);

  const fetchArticles = useCallback(async () => {
    setLoading(true);
    try {
      const params = filter !== "all" ? `?status=${filter}` : "";
      const res = await fetch(`/api/knowledge${params}`);
      const data = await res.json();
      setArticles(data.articles ?? []);
    } catch (err) {
      console.error("Error fetching knowledge:", err);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  const handleSelectArticle = async (article: Article) => {
    try {
      const res = await fetch(`/api/knowledge/${article.id}`);
      const data = await res.json();
      setSelected(data.article);
      setEditing(false);
    } catch {
      setSelected(article);
    }
  };

  const handleCreated = (article: Article) => {
    setArticles((prev) => [article, ...prev]);
    setShowForm(false);
  };

  const handleUpdated = (article: Article) => {
    setArticles((prev) => prev.map((a) => (a.id === article.id ? article : a)));
    setSelected(article);
    setEditing(false);
  };

  const handleDeleted = () => {
    setArticles((prev) => prev.filter((a) => a.id !== selected?.id));
    setSelected(null);
  };

  const filters: StatusFilter[] = ["all", "draft", "published", "archived"];

  if (selected && !editing) {
    return (
      <div className="min-h-screen">
        <Header title="Knowledge Base" />
        <div className="p-6">
          <ArticleDetail
            article={selected}
            onEdit={() => setEditing(true)}
            onDelete={handleDeleted}
            onBack={() => setSelected(null)}
          />
        </div>
      </div>
    );
  }

  if (editing && selected) {
    return (
      <div className="min-h-screen">
        <Header title="Knowledge Base" />
        <div className="p-6">
          <ArticleForm
            initial={selected}
            onSuccess={handleUpdated}
            onClose={() => setEditing(false)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header title="Knowledge Base" />

      <div className="p-6 space-y-6">
        {/* Page header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Knowledge Base</h2>
            <p className="text-slate-500">{articles.length} artículo{articles.length !== 1 ? "s" : ""}</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            <Plus className="h-4 w-4" />
            Nuevo artículo
          </button>
        </div>

        {showForm && (
          <ArticleForm
            onSuccess={handleCreated}
            onClose={() => setShowForm(false)}
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
              {f === "all" ? "Todos" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Articles grid */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : articles.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 py-16 text-center">
            <BookOpen className="mb-3 h-10 w-10 text-slate-300" />
            <p className="font-medium text-slate-500">No hay artículos</p>
            <p className="mt-1 text-sm text-slate-400">
              Crea tu primer artículo en la Knowledge Base
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {articles.map((article) => (
              <button
                key={article.id}
                onClick={() => handleSelectArticle(article)}
                className="group rounded-xl border border-slate-200 bg-white p-4 text-left transition-all hover:border-slate-300 hover:shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-slate-800 text-sm leading-snug group-hover:text-slate-900">
                    {article.title}
                  </h3>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      STATUS_COLORS[article.status] ?? "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {article.status}
                  </span>
                </div>

                {article.summary && (
                  <p className="mt-1.5 text-xs text-slate-500 line-clamp-2">{article.summary}</p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                  <span>{TYPE_LABELS[article.contentType] ?? article.contentType}</span>
                  {article.category && <span>· {article.category}</span>}
                  <span className="ml-auto inline-flex items-center gap-0.5">
                    <Eye className="h-3 w-3" />
                    {article.viewCount}
                  </span>
                </div>

                {article.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {article.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-400"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
