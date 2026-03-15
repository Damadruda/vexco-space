"use client";

import { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/ui/header";
import {
  BookOpen,
  Plus,
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
  draft: "bg-ql-warning/10 text-ql-warning",
  published: "bg-ql-success/10 text-ql-success",
  archived: "bg-ql-cream text-ql-muted",
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
    <div className="ql-card">
      <div className="flex items-center justify-between mb-6">
        <h3 className="ql-h3">
          {isEditing ? "Editar artículo" : "Nuevo artículo"}
        </h3>
        <button onClick={onClose} className="ql-btn-ghost p-1.5">
          <X className="h-4 w-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="text"
          placeholder="Título del artículo"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className="ql-input"
        />

        <div className="flex gap-2 flex-wrap">
          <select
            value={contentType}
            onChange={(e) => setContentType(e.target.value)}
            className="ql-input w-auto"
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
            className="ql-input flex-1"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="ql-input w-auto"
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
          className="ql-textarea font-mono"
        />

        <input
          type="text"
          placeholder="Tags separados por coma: ai, strategy, b2b"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          className="ql-input"
        />

        {error && <p className="text-xs text-ql-danger">{error}</p>}

        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="ql-btn-ghost">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving || !title.trim() || !content.trim()}
            className="ql-btn-primary disabled:opacity-50"
          >
            {saving && <span className="ql-status-thinking" />}
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
        className="ql-btn-ghost text-xs py-1.5 px-3"
      >
        <ChevronLeft className="h-4 w-4" />
        Volver
      </button>

      <div className="ql-card space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="ql-h2">{article.title}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="ql-caption">{TYPE_LABELS[article.contentType] ?? article.contentType}</span>
              {article.category && <span className="ql-caption">· {article.category}</span>}
              <span className={`ql-badge ${STATUS_COLORS[article.status] ?? "bg-ql-cream text-ql-slate"}`}>
                {article.status}
              </span>
              <span className="ql-caption inline-flex items-center gap-1">
                <Eye className="h-3 w-3" />
                {article.viewCount} visitas
              </span>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={onEdit} className="ql-btn-secondary text-xs py-1.5 px-3">
              <Pencil className="h-3.5 w-3.5" />
              Editar
            </button>
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="ql-btn-ghost text-xs py-1.5 px-3 text-ql-danger hover:text-ql-danger"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Eliminar
              </button>
            ) : (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="ql-btn-primary bg-ql-danger hover:bg-ql-danger/90 text-xs py-1.5 px-3 disabled:opacity-50"
              >
                {deleting ? <span className="ql-status-thinking" /> : "¿Confirmar?"}
              </button>
            )}
          </div>
        </div>

        {article.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {article.tags.map((tag) => (
              <span key={tag} className="ql-badge-default inline-flex items-center gap-1">
                <Tag className="h-3 w-3" />
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="rounded-md bg-ql-offwhite p-4 ql-body whitespace-pre-wrap font-mono text-xs">
          {article.content}
        </div>

        <p className="ql-caption">
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
      <div className="ql-page">
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
      <div className="ql-page">
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
    <div className="ql-page">
      <Header title="Knowledge Base" />

      <div className="p-6 space-y-6">
        {/* Page header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="ql-h1">Knowledge Base</h1>
            <p className="ql-body mt-1">{articles.length} artículo{articles.length !== 1 ? "s" : ""}</p>
          </div>
          <button onClick={() => setShowForm(!showForm)} className="ql-btn-primary">
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
              className={filter === f ? "ql-btn-primary text-xs py-1.5 px-3" : "ql-btn-ghost text-xs py-1.5 px-3"}
            >
              {f === "all" ? "Todos" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Articles grid */}
        {loading ? (
          <div className="flex items-center gap-2 justify-center py-16">
            <span className="ql-status-thinking" />
            <span className="ql-loading">Cargando artículos...</span>
          </div>
        ) : articles.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-ql-sand py-16 text-center">
            <BookOpen className="mb-3 h-8 w-8 text-ql-muted" strokeWidth={1} />
            <p className="ql-body font-medium">No hay artículos</p>
            <p className="ql-caption mt-1">Crea tu primer artículo</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {articles.map((article) => (
              <button
                key={article.id}
                onClick={() => handleSelectArticle(article)}
                className="ql-card group text-left"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="ql-h3 text-sm leading-snug">
                    {article.title}
                  </h3>
                  <span
                    className={`ql-badge shrink-0 ${
                      STATUS_COLORS[article.status] ?? "bg-ql-cream text-ql-slate"
                    }`}
                  >
                    {article.status}
                  </span>
                </div>

                {article.summary && (
                  <p className="ql-body mt-1.5 line-clamp-2">{article.summary}</p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span className="ql-caption">{TYPE_LABELS[article.contentType] ?? article.contentType}</span>
                  {article.category && <span className="ql-caption">· {article.category}</span>}
                  <span className="ql-caption ml-auto inline-flex items-center gap-0.5">
                    <Eye className="h-3 w-3" />
                    {article.viewCount}
                  </span>
                </div>

                {article.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {article.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className="ql-badge-default">{tag}</span>
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
