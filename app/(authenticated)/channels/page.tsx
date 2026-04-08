"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/ui/header";
import { Network, Plus, X, ArrowRight } from "lucide-react";
import Link from "next/link";

interface Channel {
  id: string;
  name: string;
  type: string;
  reachDescription: string | null;
  relationshipStage: string;
  notes: string | null;
  channelProjects: Array<{ project: { id: string; title: string } }>;
  _count: { prospects: number };
}

const STAGE_STYLES: Record<string, string> = {
  cold: "text-[#5E5E5E] bg-[#F9F8F6] border-[#E8E4DE]",
  warm: "text-amber-700 bg-amber-50 border-amber-200",
  activated: "text-[#8B7355] bg-[#FBF8F3] border-[#C5A572]/40",
  producing: "text-emerald-700 bg-emerald-50 border-emerald-200",
};

const TYPE_LABELS: Record<string, string> = {
  individual: "Individual",
  firm: "Firma",
  community: "Comunidad",
  platform: "Plataforma",
};

export default function ChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: "", type: "individual", reachDescription: "", notes: "" });

  useEffect(() => {
    fetch("/api/channels")
      .then((r) => r.json())
      .then((d) => setChannels(d.channels || []))
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    const res = await fetch("/api/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      const { channel } = await res.json();
      setChannels((prev) => [{ ...channel, channelProjects: [], _count: { prospects: 0 } }, ...prev]);
      setShowModal(false);
      setForm({ name: "", type: "individual", reachDescription: "", notes: "" });
    }
  };

  return (
    <div className="ql-page">
      <Header title="Canales" subtitle="Distribución" />

      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-[#5E5E5E]">
            {channels.length} canal{channels.length !== 1 ? "es" : ""} registrado{channels.length !== 1 ? "s" : ""}
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-[#C5A572]/40 bg-white px-4 py-2 text-sm text-[#8B7355] hover:border-[#C5A572] transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Nuevo canal
          </button>
        </div>

        {loading ? (
          <div className="py-12 text-center">
            <span className="ql-status-thinking mr-2" />
            <span className="ql-loading">Cargando canales...</span>
          </div>
        ) : channels.length === 0 ? (
          <div className="rounded-lg border border-[#E8E4DE] bg-white p-12 text-center">
            <Network className="h-8 w-8 text-[#5E5E5E]/30 mx-auto mb-3" />
            <p className="text-sm text-[#5E5E5E]">No hay canales registrados.</p>
            <p className="text-xs text-[#5E5E5E]/60 mt-1">
              Los canales representan vias de distribucion para tus proyectos.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {channels.map((ch) => (
              <Link
                key={ch.id}
                href={`/channels/${ch.id}`}
                className="group rounded-lg border border-[#E8E4DE] bg-white p-5 hover:border-[#C5A572]/40 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-medium text-[#1A1A1A] group-hover:text-[#8B7355] transition-colors">
                      {ch.name}
                    </h3>
                    <p className="text-xs text-[#5E5E5E]/70 mt-0.5">
                      {TYPE_LABELS[ch.type] || ch.type}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                      STAGE_STYLES[ch.relationshipStage] || STAGE_STYLES.cold
                    }`}
                  >
                    {ch.relationshipStage}
                  </span>
                </div>
                {ch.reachDescription && (
                  <p className="text-xs text-[#5E5E5E] mb-3 line-clamp-2">{ch.reachDescription}</p>
                )}
                <div className="flex items-center justify-between text-xs text-[#5E5E5E]/60">
                  <span>{ch.channelProjects.length} proyecto{ch.channelProjects.length !== 1 ? "s" : ""}</span>
                  <span>{ch._count.prospects} prospect{ch._count.prospects !== 1 ? "s" : ""}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1A1A1A]/40">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-[#1A1A1A]" style={{ fontFamily: "var(--font-heading)" }}>
                Nuevo canal
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
                  placeholder="Nombre del canal"
                  className="w-full bg-transparent border-b border-transparent hover:border-[#5E5E5E]/30 focus:border-[#1A1A1A] outline-none py-2 text-sm"
                />
              </div>
              <div>
                <label className="ql-label mb-1 block">Tipo</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="w-full bg-transparent border-b border-[#E8E4DE] focus:border-[#1A1A1A] outline-none py-2 text-sm"
                >
                  <option value="individual">Individual</option>
                  <option value="firm">Firma</option>
                  <option value="community">Comunidad</option>
                  <option value="platform">Plataforma</option>
                </select>
              </div>
              <div>
                <label className="ql-label mb-1 block">Descripcion de alcance</label>
                <textarea
                  value={form.reachDescription}
                  onChange={(e) => setForm({ ...form, reachDescription: e.target.value })}
                  placeholder="Audiencia, tamano estimado, contexto..."
                  rows={2}
                  className="w-full bg-transparent border-b border-transparent hover:border-[#5E5E5E]/30 focus:border-[#1A1A1A] outline-none py-2 text-sm resize-none"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm text-[#5E5E5E] hover:text-[#1A1A1A]"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!form.name.trim()}
                  className="px-4 py-2 text-sm rounded-lg bg-[#1A1A1A] text-white hover:bg-[#333] disabled:opacity-30 transition-colors"
                >
                  Crear canal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
