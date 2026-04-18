"use client";

import { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/ui/header";
import {
  Library,
  FolderSync,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  X,
  Folder,
  ArrowLeft,
  Loader2,
  AlertCircle,
  FileText,
  RefreshCw,
} from "lucide-react";
import { signIn } from "next-auth/react";

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
  byType: { type: string; count: number }[];
  byOutcome: { outcome: string | null; count: number }[];
  lastSyncedAt: string | null;
  syncStatus: string;
  syncProgress: { processed: number; total: number; currentBatch: number } | null;
  driveFolderId: string | null;
  driveFolderUrl: string | null;
}

interface DriveFolder {
  id: string;
  name: string;
  mimeType: string;
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

// ─── Drive Folder Picker (inline) ───────────────────────────────────────────

function DriveFolderPicker({
  onSelect,
  onCancel,
}: {
  onSelect: (folderId: string, folderName: string) => void;
  onCancel: () => void;
}) {
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [parentStack, setParentStack] = useState<{ id: string; name: string }[]>([]);
  const [search, setSearch] = useState("");

  const currentParentId = parentStack.length > 0 ? parentStack[parentStack.length - 1].id : "";

  const fetchFolders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        mimeType: "application/vnd.google-apps.folder",
      });
      if (currentParentId) params.append("parentId", currentParentId);
      if (search) params.append("query", search);

      const res = await fetch(`/api/drive?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401 || data.needsGoogleAuth) {
          setNeedsAuth(true);
          return;
        }
        setError(data.error || "Error loading folders");
        return;
      }

      setFolders(data.files || []);
    } catch {
      setError("Connection error");
    } finally {
      setLoading(false);
    }
  }, [currentParentId, search]);

  useEffect(() => {
    fetchFolders();
  }, [fetchFolders]);

  if (needsAuth) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
        <AlertCircle className="mx-auto h-8 w-8 text-gray-400 mb-3" />
        <p className="text-sm text-[#5E5E5E] mb-4">Conecta tu cuenta de Google para acceder a Drive</p>
        <button
          onClick={() => signIn("google", { callbackUrl: "/firm-corpus" })}
          className="ql-btn-primary"
        >
          Conectar Google Drive
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {parentStack.length > 0 && (
          <button
            onClick={() => setParentStack((s) => s.slice(0, -1))}
            className="p-1.5 rounded hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 text-[#5E5E5E]" />
          </button>
        )}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar carpeta..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-transparent border-b border-transparent hover:border-[#5E5E5E]/30 focus:border-[#1A1A1A] outline-none py-2 pl-9 pr-3 text-sm"
          />
        </div>
      </div>

      {parentStack.length > 0 && (
        <div className="text-xs text-[#5E5E5E] truncate">
          {parentStack.map((p) => p.name).join(" / ")}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-[#5E5E5E]" />
        </div>
      ) : error ? (
        <p className="text-sm text-red-600 py-4 text-center">{error}</p>
      ) : folders.length === 0 ? (
        <p className="text-sm text-[#5E5E5E] py-4 text-center">No hay carpetas aqui</p>
      ) : (
        <div className="max-h-60 overflow-y-auto space-y-1">
          {folders.map((folder) => (
            <div
              key={folder.id}
              className="flex items-center gap-3 p-2.5 rounded-md hover:bg-[#F9F8F6] cursor-pointer group transition-colors"
              onClick={() => setParentStack((s) => [...s, { id: folder.id, name: folder.name }])}
            >
              <Folder className="h-4 w-4 text-amber-500 flex-shrink-0" />
              <span className="text-sm text-[#1A1A1A] flex-1 truncate">{folder.name}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(folder.id, folder.name);
                }}
                className="opacity-0 group-hover:opacity-100 text-xs px-2.5 py-1 rounded bg-[#1A1A1A] text-white transition-opacity"
              >
                Vincular
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-between items-center pt-2 border-t border-gray-100">
        {parentStack.length > 0 && (
          <button
            onClick={() => {
              const current = parentStack[parentStack.length - 1];
              onSelect(current.id, current.name);
            }}
            className="text-xs px-3 py-1.5 rounded bg-[#1A1A1A] text-white hover:bg-[#333] transition-colors"
          >
            Vincular carpeta actual
          </button>
        )}
        <button onClick={onCancel} className="text-xs text-[#5E5E5E] hover:text-[#1A1A1A] ml-auto">
          Cancelar
        </button>
      </div>
    </div>
  );
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
  const [syncing, setSyncing] = useState(false);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
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

  // Poll during sync
  useEffect(() => {
    if (!syncing) return;
    const interval = setInterval(async () => {
      const res = await fetch("/api/firm-corpus/status");
      if (res.ok) {
        const data = await res.json();
        setStats((prev) => (prev ? { ...prev, ...data } : prev));
        if (data.syncStatus !== "running") {
          setSyncing(false);
          fetchStats();
          fetchDocuments();
        }
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [syncing]);

  // Link Drive folder
  const handleLinkFolder = async (folderId: string, folderName: string) => {
    setShowFolderPicker(false);
    try {
      await fetch("/api/firm-corpus", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driveFolderId: folderId,
          driveFolderUrl: `https://drive.google.com/drive/folders/${folderId}`,
          description: `Linked to Drive folder: ${folderName}`,
        }),
      });
      fetchStats();
    } catch {
      // Handle error
    }
  };

  // Trigger sync
  const handleSync = async (mode: "full" | "incremental" = "incremental") => {
    setSyncing(true);
    try {
      const res = await fetch("/api/firm-corpus/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driveFolderId: stats?.driveFolderId,
          mode,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        if (data.syncStatus === "running") {
          // Already running, just poll
          return;
        }
        setSyncing(false);
        alert(data.error || "Error al sincronizar");
        return;
      }

      // Import completed (for small folders, may complete within the request)
      setSyncing(false);
      fetchStats();
      fetchDocuments();
    } catch {
      setSyncing(false);
    }
  };

  // Reclassify failed
  const [reclassifying, setReclassifying] = useState(false);
  const handleReclassifyFailed = async () => {
    const count = stats?.failedCount || 0;
    if (!window.confirm(`Re-ejecutar clasificacion de ${count} documentos con error?`)) return;
    setReclassifying(true);
    try {
      const res = await fetch("/api/firm-corpus/reclassify-failed", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        alert(`Reclasificacion completada: ${data.reclassified} exitosos, ${data.stillFailing} siguen fallando`);
      } else {
        const data = await res.json();
        alert(data.error || "Error al reclasificar");
      }
      fetchStats();
      fetchDocuments();
    } catch {
      alert("Error de conexion");
    } finally {
      setReclassifying(false);
    }
  };

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

  const syncProgress = stats?.syncProgress as { processed: number; total: number; currentBatch: number } | null;

  return (
    <div className="ql-page">
      <Header title="Firm Corpus" subtitle="Case-book transversal de Vex&Co" />

      <div className="p-8 space-y-8">
        {/* ── Sync Card ──────────────────────────────────────────────── */}
        <div className="rounded-lg bg-white p-6 border border-gray-100">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-serif text-lg text-[#1A1A1A]">Sincronizacion</h3>
              <p className="text-sm text-[#5E5E5E] mt-1">
                {stats?.driveFolderId
                  ? `Vinculado a Google Drive`
                  : "Sin carpeta vinculada"}
              </p>
            </div>
            <FolderSync className="h-5 w-5 text-[#5E5E5E]" />
          </div>

          {/* Stats row */}
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

          {/* Last synced */}
          {stats?.lastSyncedAt && (
            <p className="text-xs text-[#5E5E5E] mt-3">
              Ultima sincronizacion: {timeAgo(stats.lastSyncedAt)}
            </p>
          )}

          {/* Sync progress */}
          {syncing && syncProgress && (
            <div className="mt-4">
              <div className="flex items-center gap-2 mb-2">
                <Loader2 className="h-4 w-4 animate-spin text-[#5E5E5E]" />
                <span className="text-sm text-[#5E5E5E]">
                  Procesando... {syncProgress.processed}/{syncProgress.total} documentos
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1.5">
                <div
                  className="bg-[#1A1A1A] h-1.5 rounded-full transition-all duration-500"
                  style={{
                    width: syncProgress.total > 0
                      ? `${(syncProgress.processed / syncProgress.total) * 100}%`
                      : "0%",
                  }}
                />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-3 mt-5">
            {!stats?.driveFolderId ? (
              <button
                onClick={() => setShowFolderPicker(true)}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-[#1A1A1A] text-white rounded-md hover:bg-[#333] transition-colors"
              >
                <Folder className="h-3.5 w-3.5" />
                Vincular carpeta de Drive
              </button>
            ) : (
              <>
                <button
                  onClick={() => handleSync("incremental")}
                  disabled={syncing}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-[#1A1A1A] text-white rounded-md hover:bg-[#333] transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
                  Sincronizar
                </button>
                <button
                  onClick={() => {
                    if (window.confirm("Esto borrara todos los documentos procesados y volvera a importarlos desde Drive. ¿Continuar?")) {
                      handleSync("full");
                    }
                  }}
                  disabled={syncing}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm border border-gray-200 text-[#5E5E5E] rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Re-sincronizar completo
                </button>
                {(stats?.failedCount ?? 0) > 0 && (
                  <button
                    onClick={handleReclassifyFailed}
                    disabled={reclassifying || syncing}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm border border-amber-200 text-amber-700 rounded-md hover:bg-amber-50 transition-colors disabled:opacity-50"
                  >
                    <AlertCircle className="h-3.5 w-3.5" />
                    Reclasificar fallados ({stats?.failedCount})
                  </button>
                )}
                <button
                  onClick={() => setShowFolderPicker(true)}
                  className="inline-flex items-center gap-2 px-3 py-2 text-xs text-[#5E5E5E] hover:text-[#1A1A1A] transition-colors"
                >
                  Cambiar carpeta
                </button>
              </>
            )}
          </div>

          {/* Folder Picker */}
          {showFolderPicker && (
            <div className="mt-4 p-4 rounded-lg border border-gray-200 bg-[#F9F8F6]">
              <DriveFolderPicker
                onSelect={handleLinkFolder}
                onCancel={() => setShowFolderPicker(false)}
              />
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

          {/* Table */}
          {documents.length === 0 ? (
            <div className="py-16 text-center">
              <Library className="mx-auto h-10 w-10 text-gray-300 mb-3" />
              <p className="text-sm text-[#5E5E5E]">
                {!stats?.driveFolderId
                  ? "Vincula una carpeta de Drive para comenzar."
                  : filterReviewed === "pending"
                  ? "No hay documentos pendientes de revisar. Todo el corpus esta curado."
                  : filterReviewed === "reviewed"
                  ? "Aun no has revisado ningun documento."
                  : "No hay documentos. Sincroniza para importar."}
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
                          <td className="px-4 py-3">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (window.confirm(`Mover "${doc.driveFileName}" a Operational Sources?`)) {
                                  fetch(`/api/firm-corpus/${doc.id}/move-to-operational`, { method: "POST" })
                                    .then(() => { fetchStats(); fetchDocuments(); });
                                }
                              }}
                              className="text-xs text-[#5E5E5E] hover:text-[#1A1A1A] opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Mover a Operational Sources"
                            >
                              ⋯
                            </button>
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
