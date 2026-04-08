"use client";

import { useState, useEffect, use } from "react";
import { Header } from "@/components/ui/header";
import { ArrowLeft, Trash2, Save } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface ProspectDetail {
  id: string;
  name: string;
  company: string | null;
  source: string | null;
  stage: string;
  estimatedDealValue: number | null;
  currency: string;
  notes: string | null;
  fits: Array<{
    id: string;
    fitScore: number;
    rationale: string;
    isPrimary: boolean;
    project: { id: string; title: string; revenueProximityScore: number | null };
  }>;
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

const STAGES = ["discovery", "qualified", "proposal", "negotiation", "won", "lost"];
const SOURCES = ["referral", "inbound", "outbound", "event", "channel"];

export default function ProspectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [prospect, setProspect] = useState<ProspectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    name: "", company: "", source: "", stage: "discovery",
    estimatedDealValue: "", currency: "EUR", notes: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/prospects/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.prospect) {
          setProspect(d.prospect);
          setDraft({
            name: d.prospect.name || "",
            company: d.prospect.company || "",
            source: d.prospect.source || "",
            stage: d.prospect.stage || "discovery",
            estimatedDealValue: d.prospect.estimatedDealValue != null ? String(d.prospect.estimatedDealValue) : "",
            currency: d.prospect.currency || "EUR",
            notes: d.prospect.notes || "",
          });
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  const handleDelete = async () => {
    if (!confirm("Eliminar este prospect?")) return;
    await fetch(`/api/prospects/${id}`, { method: "DELETE" });
    router.push("/prospects");
  };

  const handleSave = async () => {
    setSaving(true);
    const res = await fetch(`/api/prospects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: draft.name,
        company: draft.company || null,
        source: draft.source || null,
        stage: draft.stage,
        estimatedDealValue: draft.estimatedDealValue || null,
        currency: draft.currency,
        notes: draft.notes || null,
      }),
    });
    if (res.ok) {
      const { prospect: updated } = await res.json();
      setProspect((prev) => prev ? { ...prev, ...updated } : prev);
      setEditing(false);
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="ql-page">
        <Header title="Prospect" subtitle="Cargando..." />
        <div className="p-6 text-center"><span className="ql-loading">Cargando...</span></div>
      </div>
    );
  }

  if (!prospect) {
    return (
      <div className="ql-page">
        <Header title="Prospect no encontrado" />
        <div className="p-6"><Link href="/prospects" className="text-sm text-[#C5A572]">Volver a prospects</Link></div>
      </div>
    );
  }

  const fits = prospect.fits ?? [];

  return (
    <div className="ql-page">
      <Header title={prospect.name} subtitle={prospect.company || "Prospect"} />
      <div className="p-6 max-w-4xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <Link href="/prospects" className="inline-flex items-center gap-1.5 text-xs text-[#C5A572] hover:text-[#8B7355]">
            <ArrowLeft className="h-3 w-3" /> Prospects
          </Link>
          <div className="flex items-center gap-3">
            {editing ? (
              <>
                <button onClick={() => setEditing(false)} className="text-xs text-[#5E5E5E] hover:text-[#1A1A1A]">Cancelar</button>
                <button onClick={handleSave} disabled={saving} className="text-xs text-[#8B7355] hover:text-[#1A1A1A] inline-flex items-center gap-1">
                  <Save className="h-3 w-3" /> {saving ? "Guardando..." : "Guardar"}
                </button>
              </>
            ) : (
              <button onClick={() => setEditing(true)} className="text-xs text-[#C5A572] hover:text-[#8B7355]">Editar</button>
            )}
            <button onClick={handleDelete} className="text-xs text-red-400 hover:text-red-600 inline-flex items-center gap-1">
              <Trash2 className="h-3 w-3" /> Eliminar
            </button>
          </div>
        </div>

        {/* Info */}
        <div className="rounded-lg border border-[#E8E4DE] bg-white p-5 space-y-4">
          {editing ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="ql-label mb-1 block">Nombre</label>
                  <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    className="w-full bg-transparent border-b border-[#E8E4DE] focus:border-[#1A1A1A] outline-none py-1.5 text-sm" />
                </div>
                <div>
                  <label className="ql-label mb-1 block">Empresa</label>
                  <input value={draft.company} onChange={(e) => setDraft({ ...draft, company: e.target.value })}
                    className="w-full bg-transparent border-b border-[#E8E4DE] focus:border-[#1A1A1A] outline-none py-1.5 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="ql-label mb-1 block">Stage</label>
                  <select value={draft.stage} onChange={(e) => setDraft({ ...draft, stage: e.target.value })}
                    className="w-full bg-transparent border-b border-[#E8E4DE] focus:border-[#1A1A1A] outline-none py-1.5 text-sm">
                    {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="ql-label mb-1 block">Fuente</label>
                  <select value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value })}
                    className="w-full bg-transparent border-b border-[#E8E4DE] focus:border-[#1A1A1A] outline-none py-1.5 text-sm">
                    <option value="">Sin fuente</option>
                    {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="ql-label mb-1 block">Moneda</label>
                  <select value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value })}
                    className="w-full bg-transparent border-b border-[#E8E4DE] focus:border-[#1A1A1A] outline-none py-1.5 text-sm">
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                    <option value="MXN">MXN</option>
                    <option value="COP">COP</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="ql-label mb-1 block">Deal value estimado</label>
                <input type="number" value={draft.estimatedDealValue} onChange={(e) => setDraft({ ...draft, estimatedDealValue: e.target.value })}
                  className="w-full bg-transparent border-b border-[#E8E4DE] focus:border-[#1A1A1A] outline-none py-1.5 text-sm" />
              </div>
              <div>
                <label className="ql-label mb-1 block">Notas</label>
                <textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} rows={3} maxLength={2000}
                  className="w-full bg-transparent border border-[#E8E4DE] rounded-lg p-2 text-sm outline-none focus:border-[#C5A572] resize-none" />
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 flex-wrap">
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${STAGE_STYLES[prospect.stage] || STAGE_STYLES.discovery}`}>
                  {prospect.stage}
                </span>
                {prospect.source && <span className="text-xs text-[#5E5E5E]/70">Fuente: {prospect.source}</span>}
                {prospect.channel ? (
                  <Link href={`/channels/${prospect.channel.id}`} className="text-xs text-[#C5A572] hover:underline">
                    via {prospect.channel.name}
                  </Link>
                ) : (
                  <span className="text-xs text-[#5E5E5E]/40">Sin canal de origen</span>
                )}
              </div>
              {prospect.estimatedDealValue != null && (
                <p className="text-2xl font-light text-[#1A1A1A] tabular-nums">
                  {prospect.estimatedDealValue.toLocaleString("es-ES")} {prospect.currency}
                </p>
              )}
              {prospect.notes ? (
                <p className="text-sm text-[#5E5E5E] border-t border-[#E8E4DE] pt-3">{prospect.notes}</p>
              ) : (
                <p className="text-xs text-[#5E5E5E]/40 border-t border-[#E8E4DE] pt-3">Sin notas</p>
              )}
            </>
          )}
        </div>

        {/* Fits */}
        <section>
          <p className="ql-label mb-3">Project Fits ({fits.length})</p>
          {fits.length === 0 ? (
            <div className="rounded-lg border border-[#E8E4DE] bg-white p-6 text-center">
              <p className="text-xs text-[#5E5E5E]/60">
                Sin fits asignados. Ejecuta un{" "}
                <Link href="/intelligence" className="text-[#C5A572] hover:underline">analisis cruzado</Link>{" "}
                en Inteligencia para generar recomendaciones.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-[#E8E4DE] bg-white divide-y divide-[#E8E4DE]">
              {fits.map((fit) => (
                <Link key={fit.id} href={`/project-builder/${fit.project.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-[#FBF8F3]/50 transition-colors">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-[#1A1A1A]">{fit.project.title}</p>
                      {fit.isPrimary && (
                        <span className="text-[10px] text-[#C5A572] border border-[#C5A572]/30 rounded-full px-1.5">primary</span>
                      )}
                    </div>
                    <p className="text-xs text-[#5E5E5E]/70 mt-0.5 line-clamp-1">{fit.rationale}</p>
                  </div>
                  <div className="text-right ml-4">
                    <span className="text-lg font-light text-[#1A1A1A] tabular-nums">{fit.fitScore}</span>
                    <span className="text-xs text-[#5E5E5E]/50">/100</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
