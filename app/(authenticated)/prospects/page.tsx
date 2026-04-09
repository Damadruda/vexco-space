"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/ui/header";
import { Target, Plus, X } from "lucide-react";
import Link from "next/link";

interface Prospect {
  id: string;
  name: string;
  company: string | null;
  source: string | null;
  stage: string;
  estimatedDealValue: number | null;
  currency: string;
  fits: Array<{ fitScore: number; isPrimary: boolean; project: { id: string; title: string } }>;
  channel: { id: string; name: string } | null;
}

const STAGE_STYLES: Record<string, string> = {
  discovery: "text-[#5E5E5E] bg-[#F9F8F6] border-[#E8E4DE]",
  qualified: "text-blue-700 bg-blue-50 border-blue-200",
  proposal: "text-amber-700 bg-amber-50 border-amber-200",
  negotiation: "text-[#8B7355] bg-[#FBF8F3] border-[#C5A572]/40",
  won: "text-emerald-700 bg-emerald-50 border-emerald-200",
  lost: "text-red-600 bg-red-50 border-red-200",
};

export default function ProspectsPage() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: "", company: "", source: "INBOUND", stage: "discovery", estimatedDealValue: "", currency: "EUR", notes: "" });

  useEffect(() => {
    fetch("/api/prospects")
      .then((r) => r.json())
      .then((d) => setProspects(d.prospects || []))
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    const res = await fetch("/api/prospects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      const { prospect } = await res.json();
      setProspects((prev) => [{ ...prospect, fits: [], channel: null }, ...prev]);
      setShowModal(false);
      setForm({ name: "", company: "", source: "INBOUND", stage: "discovery", estimatedDealValue: "", currency: "EUR", notes: "" });
    }
  };

  const primaryFit = (p: Prospect) => p.fits.find((f) => f.isPrimary) || p.fits[0];

  return (
    <div className="ql-page">
      <Header title="Prospects" subtitle="Pipeline comercial" />

      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-[#5E5E5E]">
            {prospects.length} prospect{prospects.length !== 1 ? "s" : ""}
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-[#C5A572]/40 bg-white px-4 py-2 text-sm text-[#8B7355] hover:border-[#C5A572] transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Nuevo prospect
          </button>
        </div>

        {loading ? (
          <div className="py-12 text-center">
            <span className="ql-status-thinking mr-2" />
            <span className="ql-loading">Cargando prospects...</span>
          </div>
        ) : prospects.length === 0 ? (
          <div className="rounded-lg border border-[#E8E4DE] bg-white p-12 text-center">
            <Target className="h-8 w-8 text-[#5E5E5E]/30 mx-auto mb-3" />
            <p className="text-sm text-[#5E5E5E]">No hay prospects registrados.</p>
            <p className="text-xs text-[#5E5E5E]/60 mt-1">
              Los prospects representan oportunidades comerciales para tus proyectos.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {prospects.map((pr) => {
              const pf = primaryFit(pr);
              return (
                <Link
                  key={pr.id}
                  href={`/prospects/${pr.id}`}
                  className="group rounded-lg border border-[#E8E4DE] bg-white p-5 hover:border-[#C5A572]/40 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="text-sm font-medium text-[#1A1A1A] group-hover:text-[#8B7355] transition-colors">
                        {pr.name}
                      </h3>
                      {pr.company && (
                        <p className="text-xs text-[#5E5E5E]/70">{pr.company}</p>
                      )}
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                        STAGE_STYLES[pr.stage] || STAGE_STYLES.discovery
                      }`}
                    >
                      {pr.stage}
                    </span>
                  </div>
                  {pr.estimatedDealValue != null && (
                    <p className="text-lg font-light text-[#1A1A1A] tabular-nums mb-2">
                      {pr.estimatedDealValue.toLocaleString("es-ES")} {pr.currency}
                    </p>
                  )}
                  {pf && (
                    <p className="text-xs text-[#C5A572]">
                      Fit: {pf.project.title} ({pf.fitScore}/100)
                    </p>
                  )}
                  <div className="flex items-center justify-between mt-3 text-xs text-[#5E5E5E]/60">
                    {pr.source && <span>{pr.source}</span>}
                    {pr.channel && <span>via {pr.channel.name}</span>}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1A1A1A]/40">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-[#1A1A1A]" style={{ fontFamily: "var(--font-heading)" }}>
                Nuevo prospect
              </h3>
              <button onClick={() => setShowModal(false)} className="text-[#5E5E5E] hover:text-[#1A1A1A]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="ql-label mb-1 block">Nombre</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Nombre del prospect"
                  className="w-full bg-transparent border-b border-transparent hover:border-[#5E5E5E]/30 focus:border-[#1A1A1A] outline-none py-2 text-sm"
                />
              </div>
              <div>
                <label className="ql-label mb-1 block">Empresa</label>
                <input
                  value={form.company}
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
                  placeholder="Empresa (opcional)"
                  className="w-full bg-transparent border-b border-transparent hover:border-[#5E5E5E]/30 focus:border-[#1A1A1A] outline-none py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="ql-label mb-1 block">Deal value estimado</label>
                  <input
                    value={form.estimatedDealValue}
                    onChange={(e) => setForm({ ...form, estimatedDealValue: e.target.value })}
                    placeholder="0"
                    type="number"
                    className="w-full bg-transparent border-b border-transparent hover:border-[#5E5E5E]/30 focus:border-[#1A1A1A] outline-none py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="ql-label mb-1 block">Moneda</label>
                  <select
                    value={form.currency}
                    onChange={(e) => setForm({ ...form, currency: e.target.value })}
                    className="w-full bg-transparent border-b border-[#E8E4DE] focus:border-[#1A1A1A] outline-none py-2 text-sm"
                  >
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                    <option value="MXN">MXN</option>
                    <option value="COP">COP</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="ql-label mb-1 block">Fuente</label>
                  <select
                    value={form.source}
                    onChange={(e) => setForm({ ...form, source: e.target.value })}
                    className="w-full bg-transparent border-b border-[#E8E4DE] focus:border-[#1A1A1A] outline-none py-2 text-sm"
                  >
                    <option value="MANUAL">Manual</option>
                    <option value="REFERRAL">Referral</option>
                    <option value="INBOUND">Inbound</option>
                    <option value="OUTBOUND">Outbound</option>
                    <option value="EVENT">Evento</option>
                    <option value="CHANNEL">Canal</option>
                    <option value="APOLLO">Apollo</option>
                    <option value="LINKEDIN">LinkedIn</option>
                    <option value="CORPUS">Corpus</option>
                  </select>
                </div>
                <div>
                  <label className="ql-label mb-1 block">Stage</label>
                  <select
                    value={form.stage}
                    onChange={(e) => setForm({ ...form, stage: e.target.value })}
                    className="w-full bg-transparent border-b border-[#E8E4DE] focus:border-[#1A1A1A] outline-none py-2 text-sm"
                  >
                    <option value="discovery">Discovery</option>
                    <option value="qualified">Qualified</option>
                    <option value="proposal">Proposal</option>
                    <option value="negotiation">Negotiation</option>
                    <option value="won">Won</option>
                    <option value="lost">Lost</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="ql-label mb-1 block">Notas</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Notas sobre el prospect (opcional)"
                  rows={2}
                  maxLength={2000}
                  className="w-full bg-transparent border-b border-transparent hover:border-[#5E5E5E]/30 focus:border-[#1A1A1A] outline-none py-2 text-sm resize-none"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-[#5E5E5E] hover:text-[#1A1A1A]">
                  Cancelar
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!form.name.trim()}
                  className="px-4 py-2 text-sm rounded-lg bg-[#1A1A1A] text-white hover:bg-[#333] disabled:opacity-30 transition-colors"
                >
                  Crear prospect
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
