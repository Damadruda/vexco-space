"use client";

import { useState, useEffect, use } from "react";
import { Header } from "@/components/ui/header";
import { ArrowLeft, Trash2, Save } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface ChannelDetail {
  id: string;
  name: string;
  type: string;
  reachDescription: string | null;
  relationshipStage: string;
  notes: string | null;
  channelProjects: Array<{
    id: string;
    activationStatus: string;
    fitRationale: string | null;
    project: { id: string; title: string; revenueProximityScore: number | null };
  }>;
  prospects: Array<{ id: string; name: string; company: string | null; stage: string }>;
}

const STAGE_STYLES: Record<string, string> = {
  cold: "text-[#5E5E5E] bg-[#F9F8F6] border-[#E8E4DE]",
  warm: "text-amber-700 bg-amber-50 border-amber-200",
  activated: "text-[#8B7355] bg-[#FBF8F3] border-[#C5A572]/40",
  producing: "text-emerald-700 bg-emerald-50 border-emerald-200",
};

const RELATIONSHIP_STAGES = ["cold", "warm", "activated", "producing"];
const TYPE_OPTIONS = ["individual", "firm", "community", "platform"];
const TYPE_LABELS: Record<string, string> = {
  individual: "Individual", firm: "Firma", community: "Comunidad", platform: "Plataforma",
};

export default function ChannelDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [channel, setChannel] = useState<ChannelDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    name: "", type: "individual", reachDescription: "", relationshipStage: "cold", notes: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/channels/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.channel) {
          setChannel(d.channel);
          setDraft({
            name: d.channel.name || "",
            type: d.channel.type || "individual",
            reachDescription: d.channel.reachDescription || "",
            relationshipStage: d.channel.relationshipStage || "cold",
            notes: d.channel.notes || "",
          });
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  const handleDelete = async () => {
    if (!confirm("Eliminar este canal?")) return;
    await fetch(`/api/channels/${id}`, { method: "DELETE" });
    router.push("/channels");
  };

  const handleSave = async () => {
    setSaving(true);
    const res = await fetch(`/api/channels/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: draft.name,
        type: draft.type,
        reachDescription: draft.reachDescription || null,
        relationshipStage: draft.relationshipStage,
        notes: draft.notes || null,
      }),
    });
    if (res.ok) {
      const { channel: updated } = await res.json();
      setChannel((prev) => prev ? { ...prev, ...updated } : prev);
      setEditing(false);
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="ql-page">
        <Header title="Canal" subtitle="Cargando..." />
        <div className="p-6 text-center"><span className="ql-loading">Cargando...</span></div>
      </div>
    );
  }

  if (!channel) {
    return (
      <div className="ql-page">
        <Header title="Canal no encontrado" />
        <div className="p-6"><Link href="/channels" className="text-sm text-[#C5A572]">Volver a canales</Link></div>
      </div>
    );
  }

  const channelProjects = channel.channelProjects ?? [];
  const prospects = channel.prospects ?? [];

  return (
    <div className="ql-page">
      <Header title={channel.name} subtitle="Canal de distribucion" />
      <div className="p-6 max-w-4xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <Link href="/channels" className="inline-flex items-center gap-1.5 text-xs text-[#C5A572] hover:text-[#8B7355]">
            <ArrowLeft className="h-3 w-3" /> Canales
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
                  <label className="ql-label mb-1 block">Tipo</label>
                  <select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}
                    className="w-full bg-transparent border-b border-[#E8E4DE] focus:border-[#1A1A1A] outline-none py-1.5 text-sm">
                    {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="ql-label mb-1 block">Etapa de relacion</label>
                <select value={draft.relationshipStage} onChange={(e) => setDraft({ ...draft, relationshipStage: e.target.value })}
                  className="w-full bg-transparent border-b border-[#E8E4DE] focus:border-[#1A1A1A] outline-none py-1.5 text-sm">
                  {RELATIONSHIP_STAGES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="ql-label mb-1 block">Descripcion de alcance</label>
                <textarea value={draft.reachDescription} onChange={(e) => setDraft({ ...draft, reachDescription: e.target.value })} rows={2}
                  className="w-full bg-transparent border border-[#E8E4DE] rounded-lg p-2 text-sm outline-none focus:border-[#C5A572] resize-none" />
              </div>
              <div>
                <label className="ql-label mb-1 block">Notas</label>
                <textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} rows={3}
                  className="w-full bg-transparent border border-[#E8E4DE] rounded-lg p-2 text-sm outline-none focus:border-[#C5A572] resize-none" />
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <span className="text-xs text-[#5E5E5E]/70 uppercase tracking-wide">{TYPE_LABELS[channel.type] || channel.type}</span>
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${STAGE_STYLES[channel.relationshipStage] || STAGE_STYLES.cold}`}>
                  {channel.relationshipStage}
                </span>
              </div>
              {channel.reachDescription ? (
                <p className="text-sm text-[#5E5E5E]">{channel.reachDescription}</p>
              ) : (
                <p className="text-xs text-[#5E5E5E]/40">Sin descripcion de alcance</p>
              )}
              {channel.notes ? (
                <p className="text-xs text-[#5E5E5E]/70 border-t border-[#E8E4DE] pt-3">{channel.notes}</p>
              ) : (
                <p className="text-xs text-[#5E5E5E]/40 border-t border-[#E8E4DE] pt-3">Sin notas</p>
              )}
            </>
          )}
        </div>

        {/* Linked Projects */}
        <section>
          <p className="ql-label mb-3">Proyectos vinculados ({channelProjects.length})</p>
          {channelProjects.length === 0 ? (
            <p className="text-xs text-[#5E5E5E]/60">No hay proyectos vinculados a este canal.</p>
          ) : (
            <div className="rounded-lg border border-[#E8E4DE] bg-white divide-y divide-[#E8E4DE]">
              {channelProjects.map((cp) => (
                <Link key={cp.id} href={`/project-builder/${cp.project.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-[#FBF8F3]/50 transition-colors">
                  <div>
                    <p className="text-sm text-[#1A1A1A]">{cp.project.title}</p>
                    {cp.fitRationale && <p className="text-xs text-[#5E5E5E]/70 mt-0.5">{cp.fitRationale}</p>}
                  </div>
                  <span className="text-[10px] text-[#5E5E5E]/60 uppercase tracking-wide">{cp.activationStatus}</span>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Prospects */}
        <section>
          <p className="ql-label mb-3">Prospects ({prospects.length})</p>
          {prospects.length === 0 ? (
            <p className="text-xs text-[#5E5E5E]/60">No hay prospects asociados a este canal.</p>
          ) : (
            <div className="rounded-lg border border-[#E8E4DE] bg-white divide-y divide-[#E8E4DE]">
              {prospects.map((pr) => (
                <Link key={pr.id} href={`/prospects/${pr.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-[#FBF8F3]/50 transition-colors">
                  <div>
                    <p className="text-sm text-[#1A1A1A]">{pr.name}</p>
                    {pr.company && <p className="text-xs text-[#5E5E5E]/70">{pr.company}</p>}
                  </div>
                  <span className="text-[10px] text-[#5E5E5E]/60 uppercase tracking-wide">{pr.stage}</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
