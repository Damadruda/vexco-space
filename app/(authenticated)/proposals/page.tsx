"use client";

import { useState, useEffect, useMemo } from "react";
import { Header } from "@/components/ui/header";
import { Inbox, Plus, ChevronDown } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Proposal {
  id: string;
  sourceType: string;
  sourceRef: string | null;
  targetType: string;
  targetRef: string | null;
  title: string;
  rationale: string;
  proposedChange: string;
  epistemicRegister: string | null;
  confidence: number;
  status: string;
  createdAt: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_TABS = ["PENDING", "ACCEPTED", "REJECTED", "APPLIED", "all"] as const;

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  PENDING: { label: "Pendiente", className: "text-amber-600 bg-amber-50" },
  ACCEPTED: { label: "Aceptada", className: "text-emerald-600 bg-emerald-50" },
  REJECTED: { label: "Rechazada", className: "text-red-600 bg-red-50" },
  APPLIED: { label: "Aplicada", className: "text-[#8B7355] bg-[#FBF8F3]" },
};

const TARGET_TYPES = ["AGENT_DNA", "FRAMEWORK", "CORPUS", "PRODUCT_BACKLOG"] as const;

const TAB_LABELS: Record<string, string> = {
  PENDING: "Pendientes",
  ACCEPTED: "Aceptadas",
  REJECTED: "Rechazadas",
  APPLIED: "Aplicadas",
  all: "Todas",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProposalsPage() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("PENDING");
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // New proposal form state
  const [title, setTitle] = useState("");
  const [rationale, setRationale] = useState("");
  const [proposedChange, setProposedChange] = useState("");
  const [targetType, setTargetType] = useState<string>("AGENT_DNA");
  const [epistemicRegister, setEpistemicRegister] = useState("");

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/proposals");
      const data = await r.json();
      setProposals(data?.proposals ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (filterStatus === "all") return proposals;
    return proposals.filter((p) => p.status === filterStatus);
  }, [proposals, filterStatus]);

  async function act(id: string, action: "accept" | "reject" | "apply") {
    try {
      await fetch(`/api/proposals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      await load();
    } catch (e) {
      console.error(e);
    }
  }

  async function submit() {
    if (!title.trim() || !rationale.trim() || !proposedChange.trim()) return;
    setSubmitting(true);
    try {
      await fetch("/api/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          rationale,
          proposedChange,
          targetType,
          sourceType: "MANUAL",
          epistemicRegister: epistemicRegister.trim() || undefined,
        }),
      });
      setTitle("");
      setRationale("");
      setProposedChange("");
      setTargetType("AGENT_DNA");
      setEpistemicRegister("");
      setFormOpen(false);
      await load();
    } catch (e) {
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Loading state ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-screen items-center gap-2 justify-center bg-[#F9F8F6]">
        <span className="ql-status-thinking" />
        <span className="ql-loading">Cargando propuestas...</span>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="ql-page">
      <Header title="Propuestas" subtitle="Bandeja de mejoras del Lab" />

      <div className="p-8 space-y-6">
        {/* Tabs + New proposal toggle */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-1">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setFilterStatus(tab)}
                className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
                  filterStatus === tab
                    ? "bg-[#1A1A1A] text-[#FAFAF8]"
                    : "text-[#5E5E5E] hover:text-[#1A1A1A]"
                }`}
              >
                {TAB_LABELS[tab]}
              </button>
            ))}
          </div>

          <button
            onClick={() => setFormOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 text-sm text-[#B8860B] hover:text-[#1A1A1A] transition-colors"
          >
            <Plus className="h-4 w-4" strokeWidth={1.5} />
            Nueva propuesta manual
          </button>
        </div>

        {/* New proposal form */}
        {formOpen && (
          <div className="rounded-lg bg-white/60 p-6 space-y-4" style={{ border: "1px solid rgba(184, 178, 168, 0.2)" }}>
            <div className="space-y-1">
              <label className="text-[11px] uppercase tracking-[0.1em] text-[#5E5E5E]">Título</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Título de la propuesta"
                className="w-full bg-transparent border-b border-transparent hover:border-[#5E5E5E]/30 focus:border-[#1A1A1A] outline-none text-sm text-[#1A1A1A] py-1.5"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] uppercase tracking-[0.1em] text-[#5E5E5E]">Justificación</label>
              <textarea
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
                placeholder="Por qué importa"
                rows={2}
                className="w-full bg-transparent border-b border-transparent hover:border-[#5E5E5E]/30 focus:border-[#1A1A1A] outline-none text-sm text-[#1A1A1A] py-1.5 resize-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] uppercase tracking-[0.1em] text-[#5E5E5E]">Cambio propuesto</label>
              <textarea
                value={proposedChange}
                onChange={(e) => setProposedChange(e.target.value)}
                placeholder="Qué cambiar concretamente"
                rows={2}
                className="w-full bg-transparent border-b border-transparent hover:border-[#5E5E5E]/30 focus:border-[#1A1A1A] outline-none text-sm text-[#1A1A1A] py-1.5 resize-none"
              />
            </div>

            <div className="flex flex-wrap items-end gap-6">
              <div className="space-y-1">
                <label className="text-[11px] uppercase tracking-[0.1em] text-[#5E5E5E] block">Destino</label>
                <div className="relative">
                  <select
                    value={targetType}
                    onChange={(e) => setTargetType(e.target.value)}
                    className="appearance-none bg-transparent border-b border-transparent hover:border-[#5E5E5E]/30 focus:border-[#1A1A1A] outline-none text-sm text-[#1A1A1A] py-1.5 pr-7 pl-1 cursor-pointer transition-colors"
                  >
                    {TARGET_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-0 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#5E5E5E] pointer-events-none" />
                </div>
              </div>

              <div className="space-y-1 flex-1 min-w-[200px]">
                <label className="text-[11px] uppercase tracking-[0.1em] text-[#5E5E5E] block">Registro epistémico (opcional)</label>
                <input
                  value={epistemicRegister}
                  onChange={(e) => setEpistemicRegister(e.target.value)}
                  placeholder="HECHO VERIFICADO / AFIRMADO POR / ESTIMACIÓN"
                  className="w-full bg-transparent border-b border-transparent hover:border-[#5E5E5E]/30 focus:border-[#1A1A1A] outline-none text-sm text-[#1A1A1A] py-1.5"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={submit}
                disabled={submitting || !title.trim() || !rationale.trim() || !proposedChange.trim()}
                className="px-4 py-1.5 text-sm rounded-full bg-[#1A1A1A] text-[#FAFAF8] hover:bg-[#B8860B] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? "Creando..." : "Crear propuesta"}
              </button>
              <button
                onClick={() => setFormOpen(false)}
                className="text-sm text-[#5E5E5E] hover:text-[#1A1A1A] transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Count */}
        <div className="flex items-center gap-3 text-sm text-[#5E5E5E]">
          <span className="font-medium text-[#1A1A1A]">
            {filtered.length} propuesta{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Empty state */}
        {filtered.length === 0 && (
          <div className="text-center py-16">
            <Inbox className="h-8 w-8 text-[#5E5E5E]/40 mx-auto mb-4" strokeWidth={1} />
            <p className="text-sm text-[#1A1A1A] font-medium mb-1">
              {proposals.length === 0
                ? "No hay propuestas"
                : "Ninguna propuesta coincide con el filtro"}
            </p>
            {proposals.length === 0 && (
              <p className="text-xs text-[#5E5E5E] max-w-md mx-auto">
                Las propuestas alimentan mejoras al ADN de agentes, frameworks, corpus y backlog de producto.
              </p>
            )}
          </div>
        )}

        {/* Cards */}
        {filtered.length > 0 && (
          <div className="space-y-4">
            {filtered.map((p) => {
              const statusCfg = STATUS_CONFIG[p.status] ?? {
                label: p.status,
                className: "text-[#5E5E5E] bg-[#F9F8F6]",
              };
              return (
                <div
                  key={p.id}
                  className="rounded-lg bg-white/60 p-5 space-y-3"
                  style={{ border: "1px solid rgba(184, 178, 168, 0.15)" }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="text-sm font-medium text-[#1A1A1A]">{p.title}</h3>
                    <span
                      className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusCfg.className}`}
                    >
                      {statusCfg.label}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium text-[#5E5E5E] bg-[#F1EEE9]">
                      {p.sourceType}
                    </span>
                    <span className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium text-[#8B7355] bg-[#FBF8F3]">
                      {p.targetType}
                    </span>
                    {p.epistemicRegister && (
                      <span className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium text-[#5E5E5E] bg-[#E8E4DE]">
                        {p.epistemicRegister}
                      </span>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div>
                      <span className="text-[11px] uppercase tracking-[0.1em] text-[#5E5E5E]">Justificación</span>
                      <p className="text-sm text-[#1A1A1A] mt-0.5 whitespace-pre-wrap">{p.rationale}</p>
                    </div>
                    <div>
                      <span className="text-[11px] uppercase tracking-[0.1em] text-[#5E5E5E]">Cambio propuesto</span>
                      <p className="text-sm text-[#1A1A1A] mt-0.5 whitespace-pre-wrap">{p.proposedChange}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4 pt-1">
                    <div className="flex items-center gap-3 text-xs text-[#5E5E5E]/70">
                      <span>Confianza {p.confidence}%</span>
                      <span>·</span>
                      <span>{timeAgo(p.createdAt)}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {p.status === "PENDING" && (
                        <>
                          <button
                            onClick={() => act(p.id, "accept")}
                            className="px-3 py-1 text-xs rounded-full bg-[#1A1A1A] text-[#FAFAF8] hover:bg-[#B8860B] transition-colors"
                          >
                            Aprobar
                          </button>
                          <button
                            onClick={() => act(p.id, "reject")}
                            className="px-3 py-1 text-xs rounded-full text-[#5E5E5E] hover:text-[#1A1A1A] transition-colors"
                          >
                            Rechazar
                          </button>
                        </>
                      )}
                      {p.status === "ACCEPTED" && (
                        <button
                          onClick={() => act(p.id, "apply")}
                          className="px-3 py-1 text-xs rounded-full bg-[#8B7355] text-[#FAFAF8] hover:bg-[#B8860B] transition-colors"
                        >
                          Marcar aplicada
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
