"use client";

import { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/ui/header";
import {
  Microscope,
  ExternalLink,
  Tag,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  AlertCircle,
  Sparkles,
  TrendingUp,
  FlaskConical,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface KnowledgeItem {
  id: string;
  title: string;
  content: string;
  summary: string | null;
  route: string | null;
  tags: string[];
  sourceUrl: string | null;
  status: string;
  createdAt: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const ROUTE_CONFIG: Record<
  string,
  { label: string; icon: React.ElementType; color: string; bg: string; border: string; description: string }
> = {
  B: {
    label: "Tendencia Conocida",
    icon: TrendingUp,
    color: "text-blue-600",
    bg: "bg-blue-50",
    border: "border-blue-200",
    description: "Tendencia de industria relevante para tu radar estratégico",
  },
  C: {
    label: "Descubrimiento",
    icon: FlaskConical,
    color: "text-violet-600",
    bg: "bg-violet-50",
    border: "border-violet-200",
    description: "Insight poco conocido en cuarentena pendiente de validación",
  },
};

// ─── Discovery Card ───────────────────────────────────────────────────────────

function DiscoveryCard({
  item,
  onApprove,
  onReject,
  loading,
}: {
  item: KnowledgeItem;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  loading: boolean;
}) {
  const routeCfg = ROUTE_CONFIG[item.route ?? "C"] ?? ROUTE_CONFIG.C;
  const RouteIcon = routeCfg.icon;

  const isQuarantine = item.status === "pending_review";

  return (
    <div
      className={`group relative flex flex-col rounded-2xl border bg-white shadow-sm transition-all duration-200 hover:shadow-md overflow-hidden ${routeCfg.border}`}
    >
      {/* Top accent stripe */}
      <div className={`h-1 w-full ${routeCfg.bg}`} />

      <div className="flex flex-col flex-1 p-5 gap-3">
        {/* Route badge */}
        <div className="flex items-start justify-between gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border ${routeCfg.bg} ${routeCfg.color} ${routeCfg.border}`}
          >
            <RouteIcon className="h-3 w-3" />
            {routeCfg.label}
          </span>
          {isQuarantine && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs text-amber-600 font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
              Cuarentena
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2">
          {item.title}
        </h3>

        {/* Summary */}
        {item.summary && (
          <p className="text-xs text-gray-500 leading-relaxed line-clamp-3 flex-1">
            {item.summary}
          </p>
        )}

        {/* Tags */}
        {item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <Tag className="h-3 w-3 text-gray-300 mt-0.5 shrink-0" />
            {item.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-500"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Source URL */}
        {item.sourceUrl && (
          <a
            href={item.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 hover:underline truncate"
          >
            <ExternalLink className="h-3 w-3 shrink-0" />
            <span className="truncate">{item.sourceUrl}</span>
          </a>
        )}

        {/* Date */}
        <p className="text-xs text-gray-300">
          {new Date(item.createdAt).toLocaleDateString("es-ES", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </p>
      </div>

      {/* Actions — only for quarantine items */}
      {isQuarantine && (
        <div className="border-t border-gray-100 flex divide-x divide-gray-100">
          <button
            onClick={() => onApprove(item.id)}
            disabled={loading}
            className="flex-1 inline-flex items-center justify-center gap-1.5 py-3 text-xs font-medium text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-40"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Aprobar
          </button>
          <button
            onClick={() => onReject(item.id)}
            disabled={loading}
            className="flex-1 inline-flex items-center justify-center gap-1.5 py-3 text-xs font-medium text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
          >
            <XCircle className="h-3.5 w-3.5" />
            Rechazar
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────

function StatsBar({
  quarantine,
  active,
}: {
  quarantine: number;
  active: number;
}) {
  return (
    <div className="grid grid-cols-3 gap-4 mb-6">
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
        <p className="text-xs text-amber-600 font-medium mb-0.5">En Cuarentena</p>
        <p className="text-2xl font-bold text-amber-700">{quarantine}</p>
      </div>
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <p className="text-xs text-emerald-600 font-medium mb-0.5">Aprobados</p>
        <p className="text-2xl font-bold text-emerald-700">{active}</p>
      </div>
      <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
        <p className="text-xs text-gray-500 font-medium mb-0.5">Total</p>
        <p className="text-2xl font-bold text-gray-700">{quarantine + active}</p>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DiscoveryPage() {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"quarantine" | "approved">(
    "quarantine"
  );

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/knowledge-base");
      if (!res.ok) throw new Error("Failed");
      const { items: data } = await res.json();
      setItems(data);
    } catch {
      setError("No se pudieron cargar los descubrimientos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleApprove = async (id: string) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/knowledge-base/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      });
      if (!res.ok) throw new Error("Failed");
      setItems((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, status: "active" } : item
        )
      );
    } catch {
      setError("Error al aprobar el ítem.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (id: string) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/knowledge-base/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed");
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch {
      setError("Error al rechazar el ítem.");
    } finally {
      setActionLoading(false);
    }
  };

  const quarantineItems = items.filter((i) => i.status === "pending_review");
  const activeItems = items.filter((i) => i.status === "active");
  const displayItems = activeTab === "quarantine" ? quarantineItems : activeItems;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        title="Knowledge Discovery"
        subtitle="V4 · Sala de Cuarentena estratégica"
      />

      <div className="p-6">
        {/* Stats */}
        <StatsBar quarantine={quarantineItems.length} active={activeItems.length} />

        {/* Tabs + Actions */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex rounded-lg border border-gray-200 bg-white overflow-hidden">
            <button
              onClick={() => setActiveTab("quarantine")}
              className={`px-4 py-2 text-xs font-medium transition-colors ${
                activeTab === "quarantine"
                  ? "bg-gray-900 text-white"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <span className="flex items-center gap-1.5">
                <FlaskConical className="h-3 w-3" />
                Cuarentena ({quarantineItems.length})
              </span>
            </button>
            <button
              onClick={() => setActiveTab("approved")}
              className={`px-4 py-2 text-xs font-medium transition-colors ${
                activeTab === "approved"
                  ? "bg-gray-900 text-white"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <span className="flex items-center gap-1.5">
                <Sparkles className="h-3 w-3" />
                Aprobados ({activeItems.length})
              </span>
            </button>
          </div>

          <button
            onClick={fetchItems}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-32">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : displayItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 py-24 text-center">
            <Microscope className="mb-3 h-10 w-10 text-gray-300" />
            <p className="text-sm font-medium text-gray-500">
              {activeTab === "quarantine"
                ? "No hay ítems en cuarentena"
                : "No hay ítems aprobados aún"}
            </p>
            <p className="mt-1 text-xs text-gray-400 max-w-xs">
              {activeTab === "quarantine"
                ? "Sincroniza Raindrop desde Configuración para activar el AI Triage."
                : "Aprueba ítems de la cuarentena para verlos aquí."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {displayItems.map((item) => (
              <DiscoveryCard
                key={item.id}
                item={item}
                onApprove={handleApprove}
                onReject={handleReject}
                loading={actionLoading}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
