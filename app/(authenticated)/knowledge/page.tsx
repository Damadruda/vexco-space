"use client";

import { useState, useEffect, useMemo } from "react";
import { Header } from "@/components/ui/header";
import Link from "next/link";
import {
  Brain,
  Plus,
  Check,
  Pencil,
  Ban,
  FolderKanban,
  Search,
  ArrowRight,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FirmInsight {
  id: string;
  title: string;
  content: string;
  insightType: string;
  domain: string | null;
  tags: string[];
  confidence: number;
  sourceProjectId: string | null;
  sourceProject: { id: string; title: string } | null;
  sourceAgentId: string | null;
  validatedByUser: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const INSIGHT_TYPE_CONFIG: Record<string, { label: string; emoji: string; className: string }> = {
  finding: { label: "Hallazgo", emoji: "🔍", className: "text-blue-600 bg-blue-50" },
  segment: { label: "Segmento", emoji: "👥", className: "text-purple-600 bg-purple-50" },
  decision: { label: "Decisión", emoji: "⚡", className: "text-amber-600 bg-amber-50" },
  error: { label: "Error", emoji: "⚠️", className: "text-red-600 bg-red-50" },
  pattern: { label: "Patrón", emoji: "🔄", className: "text-green-600 bg-green-50" },
  contrarian_moat: { label: "Variable Analógica", emoji: "🎯", className: "text-[#8B7355] bg-[#FBF8F3]" },
};

const AGENT_LABELS: Record<string, string> = {
  strategist: "Strategist",
  revenue: "Revenue & Growth",
  redteam: "Challenger",
  infrastructure: "Product & Tech",
  design: "Design & Experience",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `hace ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `hace ${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `hace ${weeks} sem`;
  return new Date(dateStr).toLocaleDateString("es-ES");
}

// ─── Confidence Bar ──────────────────────────────────────────────────────────

function ConfidenceBar({ value }: { value: number }) {
  const blocks = 5;
  const filled = Math.round((value / 100) * blocks);
  return (
    <div className="flex items-center gap-1">
      <div className="flex gap-0.5">
        {Array.from({ length: blocks }).map((_, i) => (
          <div
            key={i}
            className={`h-2.5 w-2 rounded-sm ${
              i < filled ? "bg-[#C5A572]" : "bg-[#E8E4DE]"
            }`}
          />
        ))}
      </div>
      <span className="text-[10px] text-[#5E5E5E] ml-0.5">{value}</span>
    </div>
  );
}

// ─── Insight Card ────────────────────────────────────────────────────────────

function InsightCard({
  insight,
  onValidate,
  onDeactivate,
  onUpdate,
}: {
  insight: FirmInsight;
  onValidate: (id: string) => void;
  onDeactivate: (id: string) => void;
  onUpdate: (id: string, data: { title?: string; content?: string }) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(insight.title);
  const [editContent, setEditContent] = useState(insight.content);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  const typeCfg = INSIGHT_TYPE_CONFIG[insight.insightType] ?? {
    label: insight.insightType,
    emoji: "📌",
    className: "text-[#5E5E5E] bg-[#F9F8F6]",
  };

  const agentLabel = insight.sourceAgentId
    ? AGENT_LABELS[insight.sourceAgentId] ?? insight.sourceAgentId
    : null;

  const sourceLabel = insight.sourceProject?.title ?? "Cross-project";
  const needsTruncation = insight.content.length > 200;

  const handleSaveEdit = () => {
    if (!editTitle.trim() || !editContent.trim()) return;
    onUpdate(insight.id, { title: editTitle, content: editContent });
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="rounded-lg bg-white p-5" style={{ border: "1px solid rgba(184, 178, 168, 0.15)" }}>
        <input
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          className="ql-input mb-3 font-medium"
        />
        <textarea
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          rows={4}
          className="ql-textarea text-sm"
        />
        <div className="mt-3 flex gap-2 justify-end">
          <button
            onClick={() => setEditing(false)}
            className="ql-btn-ghost text-xs py-1.5 px-3"
          >
            Cancelar
          </button>
          <button
            onClick={handleSaveEdit}
            disabled={!editTitle.trim() || !editContent.trim()}
            className="ql-btn-primary text-xs py-1.5 px-3 disabled:opacity-50"
          >
            Guardar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-white p-5" style={{ border: "1px solid rgba(184, 178, 168, 0.15)" }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${typeCfg.className}`}>
            {typeCfg.emoji} {typeCfg.label}
          </span>
          {insight.validatedByUser && (
            <span className="inline-flex items-center gap-1 rounded-full border border-[#C5A572]/40 bg-[#FBF8F3] px-2 py-0.5 text-[10px] font-medium text-[#8B7355]">
              <Check className="h-3 w-3" /> Validado
            </span>
          )}
          {insight.domain && (
            <span className="inline-flex rounded-full bg-[#F9F8F6] px-2 py-0.5 text-[10px] text-[#5E5E5E]">
              {insight.domain}
            </span>
          )}
        </div>
        <ConfidenceBar value={insight.confidence} />
      </div>

      {/* Body */}
      <h3 className="mt-3 text-sm font-medium text-[#1A1A1A] leading-snug">
        {insight.title}
      </h3>
      <p className="mt-1.5 text-sm text-[#5E5E5E] leading-relaxed">
        {needsTruncation && !expanded
          ? insight.content.slice(0, 200) + "..."
          : insight.content}
        {needsTruncation && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="ml-1 text-xs text-[#C5A572] hover:underline inline-flex items-center gap-0.5"
          >
            {expanded ? (
              <>menos <ChevronUp className="h-3 w-3" /></>
            ) : (
              <>más <ChevronDown className="h-3 w-3" /></>
            )}
          </button>
        )}
      </p>

      {/* Footer */}
      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[11px] text-[#5E5E5E]/70">
          {sourceLabel}{agentLabel ? ` · ${agentLabel}` : ""} · {timeAgo(insight.updatedAt)}
        </span>
      </div>

      {insight.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {insight.tags.slice(0, 6).map((tag) => (
            <span key={tag} className="inline-flex rounded bg-[#F9F8F6] px-1.5 py-0.5 text-[10px] text-[#5E5E5E]">
              {tag}
            </span>
          ))}
          {insight.tags.length > 6 && (
            <span className="text-[10px] text-[#5E5E5E]/50">
              +{insight.tags.length - 6}
            </span>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="mt-3 flex items-center gap-2 border-t border-ql-sand/10 pt-3">
        {!insight.validatedByUser ? (
          <button
            onClick={() => onValidate(insight.id)}
            className="inline-flex items-center gap-1 text-xs text-[#5E5E5E] hover:text-[#C5A572] transition-colors"
          >
            <Check className="h-3.5 w-3.5" /> Validar
          </button>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-[#C5A572]">
            <Check className="h-3.5 w-3.5" /> Validado
          </span>
        )}
        <button
          onClick={() => {
            setEditTitle(insight.title);
            setEditContent(insight.content);
            setEditing(true);
          }}
          className="inline-flex items-center gap-1 text-xs text-[#5E5E5E] hover:text-[#1A1A1A] transition-colors"
        >
          <Pencil className="h-3.5 w-3.5" /> Editar
        </button>
        {!confirmDeactivate ? (
          <button
            onClick={() => setConfirmDeactivate(true)}
            className="inline-flex items-center gap-1 text-xs text-[#5E5E5E] hover:text-red-500 transition-colors ml-auto"
          >
            <Ban className="h-3.5 w-3.5" /> Desactivar
          </button>
        ) : (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[10px] text-[#5E5E5E]">¿Seguro?</span>
            <button
              onClick={() => onDeactivate(insight.id)}
              className="text-xs text-red-500 hover:text-red-700 font-medium"
            >
              Sí
            </button>
            <button
              onClick={() => setConfirmDeactivate(false)}
              className="text-xs text-[#5E5E5E]"
            >
              No
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Add Insight Form ────────────────────────────────────────────────────────

function AddInsightForm({
  projects,
  onSuccess,
  onClose,
}: {
  projects: { id: string; title: string }[];
  onSuccess: (insight: FirmInsight) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [insightType, setInsightType] = useState("finding");
  const [domain, setDomain] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [sourceProjectId, setSourceProjectId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    setError("");

    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      const res = await fetch("/api/firm-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          content,
          insightType,
          domain: domain || undefined,
          tags,
          sourceProjectId: sourceProjectId || undefined,
          confidence: 50,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al crear");
      }

      const data = await res.json();
      onSuccess(data.insight);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg bg-white p-5" style={{ border: "1px solid rgba(184, 178, 168, 0.15)" }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-[#1A1A1A]">Añadir insight</h3>
        <button onClick={onClose} className="ql-btn-ghost p-1">
          <X className="h-4 w-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="text"
          placeholder="Título del insight"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className="ql-input"
        />

        <div className="flex gap-2 flex-wrap">
          <select
            value={insightType}
            onChange={(e) => setInsightType(e.target.value)}
            className="ql-input w-auto text-sm"
          >
            {Object.entries(INSIGHT_TYPE_CONFIG).map(([key, cfg]) => (
              <option key={key} value={key}>
                {cfg.emoji} {cfg.label}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Dominio (opcional)"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            className="ql-input flex-1 text-sm"
          />
        </div>

        <textarea
          placeholder="Contenido del insight..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={4}
          required
          className="ql-textarea text-sm"
        />

        <div className="flex gap-2 flex-wrap">
          <input
            type="text"
            placeholder="Tags: b2b, pricing, saas"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            className="ql-input flex-1 text-sm"
          />
          <select
            value={sourceProjectId}
            onChange={(e) => setSourceProjectId(e.target.value)}
            className="ql-input w-auto text-sm"
          >
            <option value="">Sin proyecto</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="ql-btn-ghost text-xs py-1.5 px-3">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving || !title.trim() || !content.trim()}
            className="ql-btn-primary text-xs py-1.5 px-3 disabled:opacity-50"
          >
            {saving && <span className="ql-status-thinking mr-1" />}
            Crear insight
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

type SortMode = "recent" | "confidence";

export default function KnowledgePage() {
  const [insights, setInsights] = useState<FirmInsight[]>([]);
  const [projects, setProjects] = useState<{ id: string; title: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Filters
  const [filterType, setFilterType] = useState("all");
  const [filterDomain, setFilterDomain] = useState("all");
  const [filterProject, setFilterProject] = useState("all");
  const [filterConfidence, setFilterConfidence] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("recent");

  useEffect(() => {
    Promise.all([
      fetch("/api/firm-insights").then((r) => r.json()),
      fetch("/api/projects").then((r) => r.json()),
    ])
      .then(([insightsData, projectsData]) => {
        setInsights(insightsData?.insights ?? []);
        setProjects(
          (projectsData?.projects ?? []).map((p: { id: string; title: string }) => ({
            id: p.id,
            title: p.title,
          }))
        );
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Derived: unique domains
  const domains = useMemo(() => {
    const set = new Set<string>();
    insights.forEach((i) => {
      if (i.domain) set.add(i.domain);
    });
    return Array.from(set).sort();
  }, [insights]);

  // Derived: projects that have insights
  const sourceProjects = useMemo(() => {
    const map = new Map<string, string>();
    insights.forEach((i) => {
      if (i.sourceProject) map.set(i.sourceProject.id, i.sourceProject.title);
    });
    return Array.from(map.entries()).map(([id, title]) => ({ id, title }));
  }, [insights]);

  // Filtered + sorted
  const filtered = useMemo(() => {
    let result = insights.filter((i) => {
      if (filterType !== "all" && i.insightType !== filterType) return false;
      if (filterDomain !== "all" && i.domain !== filterDomain) return false;
      if (filterProject !== "all" && i.sourceProjectId !== filterProject) return false;
      if (filterConfidence === "high" && i.confidence < 70) return false;
      if (filterConfidence === "medium" && (i.confidence < 30 || i.confidence >= 70)) return false;
      if (filterConfidence === "low" && i.confidence >= 30) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!i.title.toLowerCase().includes(q) && !i.content.toLowerCase().includes(q))
          return false;
      }
      return true;
    });

    if (sortMode === "confidence") {
      result = [...result].sort((a, b) => b.confidence - a.confidence);
    }
    // "recent" is default from API (updatedAt desc)

    return result;
  }, [insights, filterType, filterDomain, filterProject, filterConfidence, searchQuery, sortMode]);

  // Stats
  const stats = useMemo(() => {
    return {
      total: filtered.length,
      validated: filtered.filter((i) => i.validatedByUser).length,
      projects: new Set(filtered.map((i) => i.sourceProjectId).filter(Boolean)).size,
      contrarian: filtered.filter((i) => i.insightType === "contrarian_moat").length,
    };
  }, [filtered]);

  // Actions
  const handleValidate = async (id: string) => {
    const res = await fetch("/api/firm-insights", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, validatedByUser: true, confidence: 80 }),
    });
    if (res.ok) {
      setInsights((prev) =>
        prev.map((i) => (i.id === id ? { ...i, validatedByUser: true, confidence: 80 } : i))
      );
    }
  };

  const handleDeactivate = async (id: string) => {
    const res = await fetch("/api/firm-insights", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, isActive: false }),
    });
    if (res.ok) {
      setInsights((prev) => prev.filter((i) => i.id !== id));
    }
  };

  const handleUpdate = async (id: string, data: { title?: string; content?: string }) => {
    const res = await fetch("/api/firm-insights", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...data }),
    });
    if (res.ok) {
      const updated = await res.json();
      setInsights((prev) =>
        prev.map((i) => (i.id === id ? { ...i, ...data, ...updated.insight } : i))
      );
    }
  };

  const handleCreated = (insight: FirmInsight) => {
    setInsights((prev) => [insight, ...prev]);
    setShowForm(false);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center gap-2 justify-center bg-ql-offwhite">
        <span className="ql-status-thinking" />
        <span className="ql-loading">Cargando conocimiento...</span>
      </div>
    );
  }

  return (
    <div className="ql-page">
      <Header title="Conocimiento" subtitle="Inteligencia institucional" />

      <div className="p-8 space-y-8">
        {/* Page heading */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="ql-h1">Conocimiento Institucional</h1>
            <p className="ql-body mt-1">
              La inteligencia acumulada de Vex&Co a través de proyectos.
            </p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="ql-btn-primary"
          >
            <Plus className="h-4 w-4" />
            Añadir insight
          </button>
        </div>

        {/* Add form */}
        {showForm && (
          <AddInsightForm
            projects={projects}
            onSuccess={handleCreated}
            onClose={() => setShowForm(false)}
          />
        )}

        {/* Stats */}
        <div className="flex flex-wrap items-center gap-3 text-sm text-[#5E5E5E]">
          <span className="font-medium text-[#1A1A1A]">{stats.total} insights</span>
          <span>·</span>
          <span>{stats.validated} validados</span>
          <span>·</span>
          <span>{stats.projects} proyectos</span>
          <span>·</span>
          <span>{stats.contrarian} contrarian</span>
        </div>

        {/* Filters + Sort */}
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="ql-input text-sm py-1.5 px-3"
          >
            <option value="all">Todos los tipos</option>
            {Object.entries(INSIGHT_TYPE_CONFIG).map(([key, cfg]) => (
              <option key={key} value={key}>
                {cfg.emoji} {cfg.label}
              </option>
            ))}
          </select>

          {domains.length > 0 && (
            <select
              value={filterDomain}
              onChange={(e) => setFilterDomain(e.target.value)}
              className="ql-input text-sm py-1.5 px-3"
            >
              <option value="all">Todos los dominios</option>
              {domains.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          )}

          {sourceProjects.length > 0 && (
            <select
              value={filterProject}
              onChange={(e) => setFilterProject(e.target.value)}
              className="ql-input text-sm py-1.5 px-3"
            >
              <option value="all">Todos los proyectos</option>
              {sourceProjects.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          )}

          <select
            value={filterConfidence}
            onChange={(e) => setFilterConfidence(e.target.value)}
            className="ql-input text-sm py-1.5 px-3"
          >
            <option value="all">Toda confianza</option>
            <option value="high">Alta (70+)</option>
            <option value="medium">Media (30-69)</option>
            <option value="low">Baja (&lt;30)</option>
          </select>

          <div className="relative flex-1 min-w-[140px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#5E5E5E]" />
            <input
              type="text"
              placeholder="Buscar..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="ql-input text-sm py-1.5 pl-9 pr-3 w-full"
            />
          </div>

          {/* Sort toggle */}
          <div className="flex rounded-md border border-ql-sand/30 overflow-hidden text-xs">
            <button
              onClick={() => setSortMode("recent")}
              className={`px-3 py-1.5 transition-colors ${
                sortMode === "recent"
                  ? "bg-[#1A1A1A] text-white"
                  : "bg-white text-[#5E5E5E] hover:bg-[#F9F8F6]"
              }`}
            >
              Recientes
            </button>
            <button
              onClick={() => setSortMode("confidence")}
              className={`px-3 py-1.5 transition-colors ${
                sortMode === "confidence"
                  ? "bg-[#1A1A1A] text-white"
                  : "bg-white text-[#5E5E5E] hover:bg-[#F9F8F6]"
              }`}
            >
              Más confiables
            </button>
          </div>
        </div>

        {/* Empty state */}
        {filtered.length === 0 && !loading && (
          <div className="text-center py-16">
            <Brain className="h-8 w-8 text-[#5E5E5E]/40 mx-auto mb-4" strokeWidth={1} />
            <p className="text-sm text-[#1A1A1A] font-medium mb-1">
              {insights.length === 0
                ? "Vex&Co aún no ha acumulado conocimiento institucional"
                : "Ningún insight coincide con los filtros"}
            </p>
            {insights.length === 0 && (
              <p className="text-xs text-[#5E5E5E] mb-4 max-w-md mx-auto">
                Los agentes generan insights automáticamente cuando diagnostican proyectos en el War Room.
                Abre un proyecto y pide al Strategist que lo analice.
              </p>
            )}
            <Link href="/project-builder" className="ql-btn-primary inline-flex">
              <FolderKanban className="h-4 w-4" />
              Ver proyectos
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}

        {/* Insight cards */}
        <div className="space-y-4">
          {filtered.map((insight) => (
            <InsightCard
              key={insight.id}
              insight={insight}
              onValidate={handleValidate}
              onDeactivate={handleDeactivate}
              onUpdate={handleUpdate}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
