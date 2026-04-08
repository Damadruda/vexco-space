"use client";

import { useState, useEffect, use } from "react";
import { Header } from "@/components/ui/header";
import { ArrowLeft, Trash2 } from "lucide-react";
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

export default function ChannelDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [channel, setChannel] = useState<ChannelDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/channels/${id}`)
      .then((r) => r.json())
      .then((d) => setChannel(d.channel))
      .finally(() => setLoading(false));
  }, [id]);

  const handleDelete = async () => {
    if (!confirm("Eliminar este canal?")) return;
    await fetch(`/api/channels/${id}`, { method: "DELETE" });
    router.push("/channels");
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

  return (
    <div className="ql-page">
      <Header title={channel.name} subtitle="Canal de distribución" />
      <div className="p-6 max-w-4xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <Link href="/channels" className="inline-flex items-center gap-1.5 text-xs text-[#C5A572] hover:text-[#8B7355]">
            <ArrowLeft className="h-3 w-3" /> Canales
          </Link>
          <button onClick={handleDelete} className="text-xs text-red-400 hover:text-red-600 inline-flex items-center gap-1">
            <Trash2 className="h-3 w-3" /> Eliminar
          </button>
        </div>

        {/* Info */}
        <div className="rounded-lg border border-[#E8E4DE] bg-white p-5 space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-xs text-[#5E5E5E]/70 uppercase tracking-wide">{channel.type}</span>
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${STAGE_STYLES[channel.relationshipStage] || STAGE_STYLES.cold}`}>
              {channel.relationshipStage}
            </span>
          </div>
          {channel.reachDescription && <p className="text-sm text-[#5E5E5E]">{channel.reachDescription}</p>}
          {channel.notes && <p className="text-xs text-[#5E5E5E]/70 border-t border-[#E8E4DE] pt-3">{channel.notes}</p>}
        </div>

        {/* Linked Projects */}
        <section>
          <p className="ql-label mb-3">Proyectos vinculados ({channel.channelProjects.length})</p>
          {channel.channelProjects.length === 0 ? (
            <p className="text-xs text-[#5E5E5E]/60">No hay proyectos vinculados a este canal.</p>
          ) : (
            <div className="rounded-lg border border-[#E8E4DE] bg-white divide-y divide-[#E8E4DE]">
              {channel.channelProjects.map((cp) => (
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

        {/* Prospects from this channel */}
        <section>
          <p className="ql-label mb-3">Prospects ({channel.prospects.length})</p>
          {channel.prospects.length === 0 ? (
            <p className="text-xs text-[#5E5E5E]/60">No hay prospects asociados a este canal.</p>
          ) : (
            <div className="rounded-lg border border-[#E8E4DE] bg-white divide-y divide-[#E8E4DE]">
              {channel.prospects.map((pr) => (
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
