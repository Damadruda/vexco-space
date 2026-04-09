"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Header } from "@/components/ui/header";
import {
  Database,
  MoreHorizontal,
  FolderInput,
  Archive,
  Filter,
  FileSpreadsheet,
  ChevronDown,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface OperationalSource {
  id: string;
  driveFileId: string;
  driveFileName: string;
  driveFileMimeType: string;
  driveFolderId: string;
  detectedKind: string;
  targetSystem: string;
  status: string;
  notes: string | null;
  discoveredAt: string;
  lastSeenAt: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const KIND_OPTIONS = [
  "PARTNER_LIST",
  "CONTACT_LIST",
  "COMPANY_LIST",
  "CAMPAIGN_DATA",
  "UNKNOWN_TABULAR",
] as const;

const STATUS_OPTIONS = [
  "PENDING",
  "TAGGED",
  "MIGRATED",
  "ARCHIVED",
] as const;

const TARGET_SYSTEM_OPTIONS = [
  "HubSpot",
  "Apollo",
  "Notion",
  "Undecided",
] as const;

const KIND_CONFIG: Record<string, { label: string; color: string }> = {
  PARTNER_LIST:     { label: "Partners",    color: "text-purple-700 bg-purple-50" },
  CONTACT_LIST:     { label: "Contacts",    color: "text-blue-700 bg-blue-50" },
  COMPANY_LIST:     { label: "Companies",   color: "text-emerald-700 bg-emerald-50" },
  CAMPAIGN_DATA:    { label: "Campaigns",   color: "text-amber-700 bg-amber-50" },
  UNKNOWN_TABULAR:  { label: "Tabular",     color: "text-gray-600 bg-gray-100" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  PENDING:  { label: "Pending",  color: "text-amber-700 bg-amber-50" },
  TAGGED:   { label: "Tagged",   color: "text-blue-700 bg-blue-50" },
  MIGRATED: { label: "Migrated", color: "text-emerald-700 bg-emerald-50" },
  ARCHIVED: { label: "Archived", color: "text-gray-600 bg-gray-100" },
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function OperationalSourcesPage() {
  const [sources, setSources] = useState<OperationalSource[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterKind, setFilterKind] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
  const [editingNotesValue, setEditingNotesValue] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  // ─── Fetch ──────────────────────────────────────────────────────────────

  const fetchSources = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterKind) params.set("detectedKind", filterKind);
      if (filterStatus) params.set("status", filterStatus);
      const qs = params.toString();
      const res = await fetch(`/api/operational-sources${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setSources(data.sources ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setSources([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [filterKind, filterStatus]);

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  // ─── Close menu on outside click ───────────────────────────────────────

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ─── Inline Patch ──────────────────────────────────────────────────────

  const patchSource = async (id: string, body: Record<string, unknown>) => {
    try {
      const res = await fetch(`/api/operational-sources/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Patch failed");
      const updated = await res.json();
      setSources((prev) =>
        prev.map((s) => (s.id === id ? { ...s, ...updated } : s))
      );
    } catch {
      // silent — could add toast
    }
  };

  // ─── Actions ───────────────────────────────────────────────────────────

  const handleMoveToCorpus = async (source: OperationalSource) => {
    setOpenMenuId(null);
    if (
      !window.confirm(
        `Mover "${source.driveFileName}" al Firm Corpus? Esta accion no se puede deshacer.`
      )
    )
      return;
    try {
      const res = await fetch(`/api/operational-sources/${source.id}/move-to-corpus`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Move failed");
      fetchSources();
    } catch {
      // silent
    }
  };

  const handleArchive = async (source: OperationalSource) => {
    setOpenMenuId(null);
    if (!window.confirm(`Archivar "${source.driveFileName}"?`)) return;
    await patchSource(source.id, { status: "ARCHIVED" });
  };

  const commitNotes = (id: string) => {
    patchSource(id, { notes: editingNotesValue || null });
    setEditingNotesId(null);
  };

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F9F8F6" }}>
      <Header title="Operational Sources" subtitle="Datos tabulares pre-CRM" />

      <main className="px-8 py-8">
        {/* ── Filters ────────────────────────────────────────────────── */}
        <div className="mb-8 flex items-center gap-4">
          <Filter className="h-4 w-4" style={{ color: "#5E5E5E" }} />

          {/* Kind filter */}
          <div className="relative">
            <select
              value={filterKind}
              onChange={(e) => setFilterKind(e.target.value)}
              className="appearance-none bg-transparent border-b border-transparent hover:border-[#5E5E5E]/30 focus:border-[#1A1A1A] outline-none pr-6 py-1 text-sm transition-colors cursor-pointer"
              style={{ color: filterKind ? "#1A1A1A" : "#5E5E5E" }}
            >
              <option value="">Todos los tipos</option>
              {KIND_OPTIONS.map((k) => (
                <option key={k} value={k}>
                  {KIND_CONFIG[k]?.label ?? k}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: "#5E5E5E" }} />
          </div>

          {/* Status filter */}
          <div className="relative">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="appearance-none bg-transparent border-b border-transparent hover:border-[#5E5E5E]/30 focus:border-[#1A1A1A] outline-none pr-6 py-1 text-sm transition-colors cursor-pointer"
              style={{ color: filterStatus ? "#1A1A1A" : "#5E5E5E" }}
            >
              <option value="">Todos los estados</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {STATUS_CONFIG[s]?.label ?? s}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: "#5E5E5E" }} />
          </div>

          {total > 0 && (
            <span className="ml-auto text-xs tracking-wide" style={{ color: "#5E5E5E" }}>
              {total} fuente{total !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* ── Loading ────────────────────────────────────────────────── */}
        {loading && (
          <div className="flex items-center gap-2 py-16 justify-center">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm" style={{ color: "#5E5E5E" }}>
              Cargando fuentes...
            </span>
          </div>
        )}

        {/* ── Empty State ────────────────────────────────────────────── */}
        {!loading && sources.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <Database className="h-10 w-10" style={{ color: "#5E5E5E" }} strokeWidth={1} />
            <p className="font-serif text-lg" style={{ color: "#1A1A1A" }}>
              Sin fuentes operacionales
            </p>
            <p className="text-sm" style={{ color: "#5E5E5E" }}>
              Los archivos tabulares de Google Drive apareceran aqui al sincronizar.
            </p>
          </div>
        )}

        {/* ── Table ──────────────────────────────────────────────────── */}
        {!loading && sources.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ color: "#1A1A1A" }}>
              <thead>
                <tr
                  className="text-left text-xs tracking-[0.1em] uppercase"
                  style={{ color: "#5E5E5E" }}
                >
                  <th className="pb-3 pr-4 font-normal">Nombre archivo</th>
                  <th className="pb-3 pr-4 font-normal">Tipo</th>
                  <th className="pb-3 pr-4 font-normal">Target System</th>
                  <th className="pb-3 pr-4 font-normal">Status</th>
                  <th className="pb-3 pr-4 font-normal">Notes</th>
                  <th className="pb-3 w-10 font-normal" />
                </tr>
              </thead>
              <tbody>
                {sources.map((source) => (
                  <tr
                    key={source.id}
                    className="group transition-colors hover:bg-black/[0.02]"
                    style={{ borderBottom: "1px solid rgba(0,0,0,0.04)" }}
                  >
                    {/* File name */}
                    <td className="py-3.5 pr-4">
                      <div className="flex items-center gap-2.5">
                        <FileSpreadsheet
                          className="h-4 w-4 flex-shrink-0"
                          style={{ color: "#5E5E5E" }}
                        />
                        <span
                          className="truncate max-w-[280px]"
                          title={source.driveFileName}
                        >
                          {source.driveFileName}
                        </span>
                      </div>
                    </td>

                    {/* Kind badge */}
                    <td className="py-3.5 pr-4">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          KIND_CONFIG[source.detectedKind]?.color ??
                          "text-gray-600 bg-gray-100"
                        }`}
                      >
                        {KIND_CONFIG[source.detectedKind]?.label ??
                          source.detectedKind}
                      </span>
                    </td>

                    {/* Target System — inline editable */}
                    <td className="py-3.5 pr-4">
                      <div className="relative inline-block">
                        <select
                          value={source.targetSystem}
                          onChange={(e) =>
                            patchSource(source.id, {
                              targetSystem: e.target.value,
                            })
                          }
                          className="appearance-none bg-transparent border-b border-transparent hover:border-[#5E5E5E]/30 focus:border-[#1A1A1A] outline-none pr-5 py-0.5 text-sm cursor-pointer transition-colors"
                        >
                          {TARGET_SYSTEM_OPTIONS.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                        <ChevronDown
                          className="pointer-events-none absolute right-0 top-1/2 h-3 w-3 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity"
                          style={{ color: "#5E5E5E" }}
                        />
                      </div>
                    </td>

                    {/* Status badge */}
                    <td className="py-3.5 pr-4">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          STATUS_CONFIG[source.status]?.color ??
                          "text-gray-600 bg-gray-100"
                        }`}
                      >
                        {STATUS_CONFIG[source.status]?.label ?? source.status}
                      </span>
                    </td>

                    {/* Notes — inline editable */}
                    <td className="py-3.5 pr-4 max-w-[220px]">
                      {editingNotesId === source.id ? (
                        <input
                          autoFocus
                          value={editingNotesValue}
                          onChange={(e) => setEditingNotesValue(e.target.value)}
                          onBlur={() => commitNotes(source.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitNotes(source.id);
                            if (e.key === "Escape") setEditingNotesId(null);
                          }}
                          className="w-full bg-transparent border-b border-[#1A1A1A] outline-none text-sm py-0.5"
                        />
                      ) : (
                        <span
                          onClick={() => {
                            setEditingNotesId(source.id);
                            setEditingNotesValue(source.notes ?? "");
                          }}
                          className="block truncate cursor-text py-0.5 border-b border-transparent hover:border-[#5E5E5E]/30 transition-colors"
                          style={{ color: source.notes ? "#1A1A1A" : "#5E5E5E" }}
                        >
                          {source.notes || "Agregar nota..."}
                        </span>
                      )}
                    </td>

                    {/* Actions menu */}
                    <td className="py-3.5 relative">
                      <button
                        onClick={() =>
                          setOpenMenuId(
                            openMenuId === source.id ? null : source.id
                          )
                        }
                        className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-black/[0.04] transition-all"
                      >
                        <MoreHorizontal
                          className="h-4 w-4"
                          style={{ color: "#5E5E5E" }}
                        />
                      </button>

                      {openMenuId === source.id && (
                        <div
                          ref={menuRef}
                          className="absolute right-0 top-full z-20 mt-1 w-52 rounded-lg bg-white py-1"
                          style={{
                            boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
                          }}
                        >
                          <button
                            onClick={() => handleMoveToCorpus(source)}
                            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm hover:bg-black/[0.03] transition-colors text-left"
                            style={{ color: "#1A1A1A" }}
                          >
                            <FolderInput className="h-4 w-4" style={{ color: "#5E5E5E" }} />
                            Mover a Firm Corpus
                          </button>
                          <button
                            onClick={() => handleArchive(source)}
                            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm hover:bg-black/[0.03] transition-colors text-left"
                            style={{ color: "#5E5E5E" }}
                          >
                            <Archive className="h-4 w-4" />
                            Archivar
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
