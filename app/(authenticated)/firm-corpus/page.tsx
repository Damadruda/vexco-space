"use client";

import { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/ui/header";
import {
  Library,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  X,
  AlertCircle,
  FileText,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface CorpusDocument {
  id: string;
  driveFileId: string;
  driveFileName: string;
  driveFileUrl: string;
  mimeType: string;
  documentType: string;
  industry: string | null;
  geography: string | null;
  companySize: string | null;
  outcome: string | null;
  provenance: string;
  archived: boolean;
  reviewedAt: string | null;
  reviewedBy: string | null;
  customTags: string[];
  extractedSummary: string | null;
  keyEntities: { companies?: string[]; people?: string[]; sectors?: string[] } | null;
  embeddingStatus: string;
  lastProcessedAt: string | null;
  processingError: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CorpusStats {
  total: number;
  failedCount: number;
  archivedCount?: number;
  byType: { type: string; count: number }[];
  byOutcome: { outcome: string | null; count: number }[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DOC_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  CASE_STUDY: { label: "Case Study", color: "text-blue-700 bg-blue-50" },
  PROPOSAL_WON: { label: "Propuesta Ganada", color: "text-emerald-700 bg-emerald-50" },
  PROPOSAL_LOST: { label: "Propuesta Perdida", color: "text-red-700 bg-red-50" },
  PROPOSAL_DORMANT: { label: "Propuesta Dormant", color: "text-amber-700 bg-amber-50" },
  INDUSTRY_RESEARCH: { label: "Investigacion", color: "text-purple-700 bg-purple-50" },
  METHODOLOGY: { label: "Metodologia", color: "text-indigo-700 bg-indigo-50" },
  UNCLASSIFIED: { label: "Sin clasificar", color: "text-gray-600 bg-gray-100" },
};

const PROVENANCE_CONFIG: Record<string, { label: string; color: string }> = {
  OWN: { label: "Propio", color: "text-emerald-700 bg-emerald-50" },
  EXTERNAL: { label: "Externo", color: "text-blue-700 bg-blue-50" },
  MIXED: { label: "Mixto", color: "text-amber-700 bg-amber-50" },
  UNKNOWN: { label: "Desconocido", color: "text-gray-600 bg-gray-100" },
};

const OUTCOME_CONFIG: Record<string, { label: string; color: string }> = {
  WON: { label: "Won", color: "text-emerald-700" },
  LOST: { label: "Lost", color: "text-red-700" },
  DORMANT: { label: "Dormant", color: "text-amber-700" },
  IN_PROGRESS: { label: "In Progress", color: "text-blue-700" },
  NA: { label: "N/A", color: "text-gray-500" },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `hace ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `hace ${days}d`;
  return new Date(dateStr).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

// ─── Document Detail Drawer ─────────────────────────────────────────────────

function DocumentDrawer({
  doc,
  onClose,
}: {
  doc: CorpusDocument;
  onClose: () => void;
}) {
  const entities = doc.keyEntities || { companies: [], people: [], sectors: [] };
  const typeConfig = DOC_TYPE_CONFIG[doc.documentType] || DOC_TYPE_CONFIG.UNCLASSIFIED;
  const outcomeConfig = doc.outcome ? OUTCOME_CONFIG[doc.outcome] : null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="w-full max-w-xl bg-white h-full overflow-y-auto shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-start justify-between">
          <div className="flex-1 min-w-0 pr-4">
            <h3 className="font-serif text-lg text-[#1A1A1A] truncate">{doc.driveFileName}</h3>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-xs px-2 py-0.5 rounded-full ${typeConfig.color}`}>
                {typeConfig.label}
              </span>
              {outcomeConfig && (
                <span className={`text-xs font-medium ${outcomeConfig.color}`}>
                  {outcomeConfig.label}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100">
            <X className="h-4 w-4 text-[#5E5E5E]" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Metadata */}
          <div className="grid grid-cols-2 gap-4">
            {doc.industry && (
              <div>
                <p className="text-xs text-[#5E5E5E] uppercase tracking-wider mb-0.5">Industria</p>
                <p className="text-sm text-[#1A1A1A]">{doc.industry}</p>
              </div>
            )}
            {doc.geography && (
              <div>
                <p className="text-xs text-[#5E5E5E] uppercase tracking-wider mb-0.5">Geografia</p>
                <p className="text-sm text-[#1A1A1A]">{doc.geography}</p>
              </div>
            )}
            {doc.companySize && (
              <div>
                <p className="text-xs text-[#5E5E5E] uppercase tracking-wider mb-0.5">Tamano empresa</p>
                <p className="text-sm text-[#1A1A1A]">{doc.companySize}</p>
              </div>
            )}
            {doc.lastProcessedAt && (
              <div>
                <p className="text-xs text-[#5E5E5E] uppercase tracking-wider mb-0.5">Procesado</p>
                <p className="text-sm text-[#1A1A1A]">{timeAgo(doc.lastProcessedAt)}</p>
              </div>
            )}
          </div>

          {/* Summary */}
          {doc.extractedSummary && (
            <div>
              <p className="text-xs text-[#5E5E5E] uppercase tracking-wider mb-2">Resumen</p>
              <p className="text-sm text-[#1A1A1A] leading-relaxed whitespace-pre-line">
                {doc.extractedSummary}
              </p>
            </div>
          )}

          {/* Key Entities */}
          {(entities.companies?.length || entities.people?.length || entities.sectors?.length) && (
            <div>
              <p className="text-xs text-[#5E5E5E] uppercase tracking-wider mb-2">Entidades clave</p>
              <div className="space-y-2">
                {entities.companies && entities.companies.length > 0 && (
                  <div>
                    <p className="text-xs text-[#5E5E5E] mb-1">Empresas</p>
                    <div className="flex flex-wrap gap-1">
                      {entities.companies.map((c, i) => (
                        <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {entities.people && entities.people.length > 0 && (
                  <div>
                    <p className="text-xs text-[#5E5E5E] mb-1">Personas</p>
                    <div className="flex flex-wrap gap-1">
                      {entities.people.map((p, i) => (
                        <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-700">
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {entities.sectors && entities.sectors.length > 0 && (
                  <div>
                    <p className="text-xs text-[#5E5E5E] mb-1">Sectores</p>
                    <div className="flex flex-wrap gap-1">
                      {entities.sectors.map((s, i) => (
                        <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error */}
          {doc.processingError && (
            <div className="p-3 rounded-md bg-red-50 text-sm text-red-700">
              <p className="font-medium mb-1">Error de procesamiento</p>
              <p className="text-xs">{doc.processingError}</p>
            </div>
          )}

          {/* Drive Link */}
          <a
            href={doc.driveFileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-[#5E5E5E] hover:text-[#1A1A1A] transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Abrir en Google Drive
          </a>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function FirmCorpusPage() {
  const [stats, setStats] = useState<CorpusStats | null>(null);
  const [documents, setDocuments] = useState<CorpusDocument[]>([]);
  const [totalDocs, setTotalDocs] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selectedDoc, setSelectedDoc] = useState<CorpusDocument | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterOutcome, setFilterOutcome] = useState("");
  const [filterProvenance, setFilterProvenance] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [filterReviewed, setFilterReviewed] = useState<"all" | "pending" | "reviewed">("pending");
  const [page, setPage] = useState(1);

  // Curation selection + batch state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);

  // Reprocess (per-row Stage A+B re-run)
  const [reprocessingIds, setReprocessingIds] = useState<Set<string>>(new Set());
  const [reprocessError, setReprocessError] = useState<string | null>(null);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/firm-corpus");
      if (res.ok) {
        const data = await res.json();
        setStats(data);
        return data;
      }
    } catch {
      // Silent fail on stats
    }
    return null;
  }, []);

  // Fetch documents
  const fetchDocuments = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "50" });
      if (filterType) params.append("documentType", filterType);
      if (filterOutcome) params.append("outcome", filterOutcome);
      if (filterProvenance) params.append("provenance", filterProvenance);
      if (showArchived) params.append("archived", "true");
      if (filterReviewed === "pending") params.append("reviewed", "false");
      else if (filterReviewed === "reviewed") params.append("reviewed", "true");
      if (searchQuery) params.append("search", searchQuery);

      const res = await fetch(`/api/firm-corpus/documents?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents);
        setTotalDocs(data.total);
        setTotalPages(data.totalPages);
      }
    } catch {
      // Silent fail
    }
  }, [page, filterType, filterOutcome, filterProvenance, showArchived, filterReviewed, searchQuery]);

  // Initial load
  useEffect(() => {
    Promise.all([fetchStats(), fetchDocuments()]).finally(() => setLoading(false));
  }, []);

  // Re-fetch on filter change
  useEffect(() => {
    if (!loading) {
      fetchDocuments();
    }
  }, [page, filterType, filterOutcome, filterProvenance, showArchived, filterReviewed, searchQuery]);

  // Search debounce
  const [searchInput, setSearchInput] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Selection helpers
  const allVisibleIds = documents.map((d) => d.id);
  const allSelected =
    allVisibleIds.length > 0 && allVisibleIds.every((id) => selectedIds.has(id));
  const someSelected = allVisibleIds.some((id) => selectedIds.has(id));

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allVisibleIds));
    }
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Batch actions
  async function runBatchAction(
    action: "archive" | "unarchive" | "mark_reviewed" | "unmark_reviewed"
  ) {
    if (selectedIds.size === 0) return;
    setBatchLoading(true);
    setBatchError(null);
    try {
      const res = await fetch("/api/firm-corpus/documents/batch-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          documentIds: Array.from(selectedIds),
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Accion fallida");
      setSelectedIds(new Set());
      await fetchDocuments();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setBatchError(msg);
    } finally {
      setBatchLoading(false);
    }
  }

  async function handleReprocess(docId: string) {
    setReprocessingIds((prev) => new Set(prev).add(docId));
    setReprocessError(null);
    try {
      const res = await fetch(`/api/firm-corpus/${docId}/reprocess`, {
        method: "POST",
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      await fetchDocuments();
      await fetchStats();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setReprocessError(`Error reprocesando: ${msg}`);
    } finally {
      setReprocessingIds((prev) => {
        const next = new Set(prev);
        next.delete(docId);
        return next;
      });
    }
  }

  async function runMoveToOperational() {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const confirmed = window.confirm(
      `Mover ${ids.length} documento(s) a Operational Sources? Esta accion convierte los documentos en registros operacionales (para HubSpot/Apollo/Notion futuro). Los documentos originales quedan archivados.`
    );
    if (!confirmed) return;

    setBatchLoading(true);
    setBatchError(null);
    let succeeded = 0;
    let failed = 0;
    try {
      // Serial: el endpoint es por-id, y el tamano realista es <50
      for (const id of ids) {
        try {
          const res = await fetch(`/api/firm-corpus/${id}/move-to-operational`, {
            method: "POST",
          });
          if (res.ok) succeeded++;
          else failed++;
        } catch {
          failed++;
        }
      }
      if (failed > 0) {
        setBatchError(`Movidos: ${succeeded}. Fallidos: ${failed}.`);
      }
      setSelectedIds(new Set());
      await Promise.all([fetchStats(), fetchDocuments()]);
    } finally {
      setBatchLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="ql-page">
        <Header title="Firm Corpus" subtitle="Case-book transversal" />
        <div className="flex items-center justify-center py-24">
          <span className="ql-status-thinking" />
        </div>
      </div>
    );
  }

  return (
    <div className="ql-page">
      <Header title="Firm Corpus" subtitle="Case-book transversal de Vex&Co" />

      <div className="p-8 space-y-8">
        {/* ── Header Stats ──────────────────────────────────────────── */}
        <div className="rounded-lg bg-white p-6 border border-gray-100">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-serif text-lg text-[#1A1A1A]">Firm Corpus</h3>
              <p className="text-sm text-[#5E5E5E] mt-1">
                Conocimiento transversal promovido desde proyectos
              </p>
            </div>
            <Library className="h-5 w-5 text-[#5E5E5E]" />
          </div>

          {stats && stats.total > 0 && (
            <div className="flex flex-wrap gap-4 mt-4">
              <div className="text-center">
                <p className="text-2xl font-serif text-[#1A1A1A]">{stats.total}</p>
                <p className="text-xs text-[#5E5E5E]">Documentos</p>
              </div>
              {stats.byType.map((bt) => {
                const cfg = DOC_TYPE_CONFIG[bt.type] || DOC_TYPE_CONFIG.UNCLASSIFIED;
                return (
                  <div key={bt.type} className="text-center">
                    <p className="text-2xl font-serif text-[#1A1A1A]">{bt.count}</p>
                    <p className={`text-xs ${cfg.color} px-1.5 py-0.5 rounded`}>{cfg.label}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Documents Table ────────────────────────────────────────── */}
        <div className="rounded-lg bg-white border border-gray-100">
          {/* Review tabs (curation triage) */}
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-1 text-sm">
            {[
              { key: "pending" as const, label: "Pendientes de revisar" },
              { key: "reviewed" as const, label: "Revisados" },
              { key: "all" as const, label: "Todos" },
            ].map((tab) => {
              const active = filterReviewed === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => {
                    setFilterReviewed(tab.key);
                    setPage(1);
                    setSelectedIds(new Set());
                  }}
                  className={`px-3 py-1.5 rounded-md transition-colors ${
                    active
                      ? "bg-[#1A1A1A] text-white"
                      : "text-[#5E5E5E] hover:bg-[#F9F8F6]"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Toolbar */}
          <div className="p-4 border-b border-gray-100 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar documentos..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full bg-transparent border-b border-transparent hover:border-[#5E5E5E]/30 focus:border-[#1A1A1A] outline-none py-2 pl-9 pr-3 text-sm"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="h-3.5 w-3.5 text-[#5E5E5E]" />
              <select
                value={filterType}
                onChange={(e) => { setFilterType(e.target.value); setPage(1); setSelectedIds(new Set()); }}
                className="text-sm bg-transparent border-b border-transparent hover:border-[#5E5E5E]/30 focus:border-[#1A1A1A] outline-none py-1 pr-6 cursor-pointer text-[#5E5E5E]"
              >
                <option value="">Todos los tipos</option>
                {Object.entries(DOC_TYPE_CONFIG).map(([key, cfg]) => (
                  <option key={key} value={key}>{cfg.label}</option>
                ))}
              </select>

              <select
                value={filterOutcome}
                onChange={(e) => { setFilterOutcome(e.target.value); setPage(1); setSelectedIds(new Set()); }}
                className="text-sm bg-transparent border-b border-transparent hover:border-[#5E5E5E]/30 focus:border-[#1A1A1A] outline-none py-1 pr-6 cursor-pointer text-[#5E5E5E]"
              >
                <option value="">Todos los outcomes</option>
                {Object.entries(OUTCOME_CONFIG).map(([key, cfg]) => (
                  <option key={key} value={key}>{cfg.label}</option>
                ))}
              </select>

              <select
                value={filterProvenance}
                onChange={(e) => { setFilterProvenance(e.target.value); setPage(1); setSelectedIds(new Set()); }}
                className="text-sm bg-transparent border-b border-transparent hover:border-[#5E5E5E]/30 focus:border-[#1A1A1A] outline-none py-1 pr-6 cursor-pointer text-[#5E5E5E]"
              >
                <option value="">Toda provenance</option>
                {Object.entries(PROVENANCE_CONFIG).map(([key, cfg]) => (
                  <option key={key} value={key}>{cfg.label}</option>
                ))}
              </select>

              <label className="flex items-center gap-1.5 text-xs text-[#5E5E5E] cursor-pointer">
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(e) => { setShowArchived(e.target.checked); setPage(1); setSelectedIds(new Set()); }}
                  className="rounded border-gray-300"
                />
                Archivados
              </label>
            </div>
          </div>

          {/* Batch action bar (visible when rows are selected) */}
          {selectedIds.size > 0 && (
            <div className="border-b border-gray-100 bg-[#FBF9F4] px-4 py-3 flex flex-wrap items-center justify-between gap-4">
              <div className="text-sm text-[#1A1A1A]">
                <span className="font-medium">{selectedIds.size}</span>{" "}
                {selectedIds.size === 1 ? "documento seleccionado" : "documentos seleccionados"}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => runBatchAction("mark_reviewed")}
                  disabled={batchLoading}
                  className="text-xs px-3 py-1.5 rounded-md bg-white border border-gray-200 hover:border-[#1A1A1A] hover:text-[#1A1A1A] text-[#5E5E5E] transition-colors disabled:opacity-50"
                >
                  Marcar como revisado
                </button>
                <button
                  onClick={() => runBatchAction("unmark_reviewed")}
                  disabled={batchLoading}
                  className="text-xs px-3 py-1.5 rounded-md bg-white border border-gray-200 hover:border-[#5E5E5E] text-[#5E5E5E] transition-colors disabled:opacity-50"
                >
                  Quitar revisado
                </button>
                <button
                  onClick={runMoveToOperational}
                  disabled={batchLoading}
                  className="text-xs px-3 py-1.5 rounded-md bg-white border border-gray-200 hover:border-[#1A1A1A] hover:text-[#1A1A1A] text-[#5E5E5E] transition-colors disabled:opacity-50"
                >
                  Mover a Operational
                </button>
                <button
                  onClick={() => runBatchAction("archive")}
                  disabled={batchLoading}
                  className="text-xs px-3 py-1.5 rounded-md bg-white border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  Archivar
                </button>
                {showArchived && (
                  <button
                    onClick={() => runBatchAction("unarchive")}
                    disabled={batchLoading}
                    className="text-xs px-3 py-1.5 rounded-md bg-white border border-gray-200 hover:border-[#1A1A1A] text-[#5E5E5E] transition-colors disabled:opacity-50"
                  >
                    Desarchivar
                  </button>
                )}
                <button
                  onClick={() => setSelectedIds(new Set())}
                  disabled={batchLoading}
                  className="text-xs px-2 py-1.5 text-[#5E5E5E] hover:text-[#1A1A1A] transition-colors"
                >
                  Deseleccionar
                </button>
              </div>
            </div>
          )}

          {batchError && (
            <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700 flex items-center justify-between">
              <span>{batchError}</span>
              <button
                onClick={() => setBatchError(null)}
                className="ml-2 text-red-500 hover:text-red-700"
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>
          )}

          {reprocessError && (
            <div className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-sm text-amber-700 flex items-center justify-between">
              <span>{reprocessError}</span>
              <button
                onClick={() => setReprocessError(null)}
                className="ml-2 text-amber-500 hover:text-amber-700"
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>
          )}

          {/* Table */}
          {documents.length === 0 ? (
            <div className="py-16 text-center">
              <Library className="mx-auto h-10 w-10 text-gray-300 mb-3" />
              <p className="text-sm text-[#5E5E5E]">
                {filterReviewed === "pending"
                  ? "No hay documentos pendientes. Promueve archivos desde tus proyectos para alimentar el corpus."
                  : filterReviewed === "reviewed"
                  ? "Aún no has revisado ningún documento."
                  : "El corpus está vacío. Promueve archivos desde tus proyectos."}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-xs text-[#5E5E5E] uppercase tracking-wider border-b border-gray-100">
                      <th className="px-4 py-3 font-normal w-8">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          ref={(el) => {
                            if (el) el.indeterminate = !allSelected && someSelected;
                          }}
                          onChange={toggleSelectAll}
                          onClick={(e) => e.stopPropagation()}
                          className="rounded border-gray-300 cursor-pointer"
                          aria-label="Seleccionar todos"
                        />
                      </th>
                      <th className="px-4 py-3 font-normal">Nombre</th>
                      <th className="px-4 py-3 font-normal">Tipo</th>
                      <th className="px-4 py-3 font-normal hidden md:table-cell">Industria</th>
                      <th className="px-4 py-3 font-normal hidden lg:table-cell">Geografia</th>
                      <th className="px-4 py-3 font-normal hidden md:table-cell">Outcome</th>
                      <th className="px-4 py-3 font-normal hidden lg:table-cell">Provenance</th>
                      <th className="px-4 py-3 font-normal">Actualizado</th>
                      <th className="px-4 py-3 font-normal w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((doc) => {
                      const typeConfig = DOC_TYPE_CONFIG[doc.documentType] || DOC_TYPE_CONFIG.UNCLASSIFIED;
                      const outcomeConfig = doc.outcome ? OUTCOME_CONFIG[doc.outcome] : null;
                      return (
                        <tr
                          key={doc.id}
                          onClick={() => setSelectedDoc(doc)}
                          className="border-b border-gray-50 hover:bg-[#F9F8F6] cursor-pointer transition-colors"
                        >
                          <td
                            className="px-4 py-3 w-8"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={selectedIds.has(doc.id)}
                              onChange={() => toggleOne(doc.id)}
                              className="rounded border-gray-300 cursor-pointer"
                              aria-label={`Seleccionar ${doc.driveFileName}`}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-start gap-2">
                              <FileText className="h-4 w-4 text-[#5E5E5E] flex-shrink-0 mt-0.5" />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm text-[#1A1A1A] truncate max-w-[320px]">
                                    {doc.driveFileName}
                                  </span>
                                  {doc.processingError && (
                                    <AlertCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
                                  )}
                                  {doc.reviewedAt && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 flex-shrink-0">
                                      Revisado
                                    </span>
                                  )}
                                </div>
                                {doc.extractedSummary && (
                                  <p className="text-xs text-[#5E5E5E] mt-1 line-clamp-2 max-w-[480px]">
                                    {doc.extractedSummary}
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${typeConfig.color}`}>
                              {typeConfig.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            <span className="text-sm text-[#5E5E5E]">{doc.industry || "—"}</span>
                          </td>
                          <td className="px-4 py-3 hidden lg:table-cell">
                            <span className="text-sm text-[#5E5E5E]">{doc.geography || "—"}</span>
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            {outcomeConfig ? (
                              <span className={`text-xs font-medium ${outcomeConfig.color}`}>
                                {outcomeConfig.label}
                              </span>
                            ) : (
                              <span className="text-sm text-[#5E5E5E]">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 hidden lg:table-cell">
                            {(() => {
                              const pCfg = PROVENANCE_CONFIG[doc.provenance] || PROVENANCE_CONFIG.UNKNOWN;
                              return (
                                <span className={`text-xs px-2 py-0.5 rounded-full ${pCfg.color}`}>
                                  {pCfg.label}
                                </span>
                              );
                            })()}
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs text-[#5E5E5E]">
                              {doc.lastProcessedAt ? timeAgo(doc.lastProcessedAt) : "—"}
                            </span>
                          </td>
                          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-1.5 justify-end">
                              <button
                                onClick={() => handleReprocess(doc.id)}
                                disabled={reprocessingIds.has(doc.id)}
                                className="text-[10px] px-2 py-0.5 rounded border border-gray-200 text-[#5E5E5E] hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                title="Re-ejecutar Stage A + Stage B sobre este documento"
                              >
                                {reprocessingIds.has(doc.id) ? "Reprocesando..." : "Reprocesar"}
                              </button>
                              <button
                                onClick={() => {
                                  if (window.confirm(`Mover "${doc.driveFileName}" a Operational Sources?`)) {
                                    fetch(`/api/firm-corpus/${doc.id}/move-to-operational`, { method: "POST" })
                                      .then(() => { fetchStats(); fetchDocuments(); });
                                  }
                                }}
                                className="text-xs text-[#5E5E5E] hover:text-[#1A1A1A] transition-colors"
                                title="Mover a Operational Sources"
                              >
                                ⋯
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                  <span className="text-xs text-[#5E5E5E]">
                    {totalDocs} documentos, pagina {page} de {totalPages}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 transition-colors"
                    >
                      <ChevronLeft className="h-4 w-4 text-[#5E5E5E]" />
                    </button>
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages}
                      className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 transition-colors"
                    >
                      <ChevronRight className="h-4 w-4 text-[#5E5E5E]" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Document Detail Drawer */}
      {selectedDoc && <DocumentDrawer doc={selectedDoc} onClose={() => setSelectedDoc(null)} />}
    </div>
  );
}
