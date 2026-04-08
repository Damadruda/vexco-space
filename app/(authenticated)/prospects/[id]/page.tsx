"use client";

import { useState, useEffect, use } from "react";
import { Header } from "@/components/ui/header";
import { ArrowLeft, Trash2 } from "lucide-react";
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

export default function ProspectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [prospect, setProspect] = useState<ProspectDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/prospects/${id}`)
      .then((r) => r.json())
      .then((d) => setProspect(d.prospect))
      .finally(() => setLoading(false));
  }, [id]);

  const handleDelete = async () => {
    if (!confirm("Eliminar este prospect?")) return;
    await fetch(`/api/prospects/${id}`, { method: "DELETE" });
    router.push("/prospects");
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

  return (
    <div className="ql-page">
      <Header title={prospect.name} subtitle={prospect.company || "Prospect"} />
      <div className="p-6 max-w-4xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <Link href="/prospects" className="inline-flex items-center gap-1.5 text-xs text-[#C5A572] hover:text-[#8B7355]">
            <ArrowLeft className="h-3 w-3" /> Prospects
          </Link>
          <button onClick={handleDelete} className="text-xs text-red-400 hover:text-red-600 inline-flex items-center gap-1">
            <Trash2 className="h-3 w-3" /> Eliminar
          </button>
        </div>

        {/* Info */}
        <div className="rounded-lg border border-[#E8E4DE] bg-white p-5 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${STAGE_STYLES[prospect.stage] || STAGE_STYLES.discovery}`}>
              {prospect.stage}
            </span>
            {prospect.source && <span className="text-xs text-[#5E5E5E]/70">Fuente: {prospect.source}</span>}
            {prospect.channel && (
              <Link href={`/channels/${prospect.channel.id}`} className="text-xs text-[#C5A572] hover:underline">
                via {prospect.channel.name}
              </Link>
            )}
          </div>
          {prospect.estimatedDealValue != null && (
            <p className="text-2xl font-light text-[#1A1A1A] tabular-nums">
              {prospect.estimatedDealValue.toLocaleString("es-ES")} {prospect.currency}
            </p>
          )}
          {prospect.notes && <p className="text-sm text-[#5E5E5E] border-t border-[#E8E4DE] pt-3">{prospect.notes}</p>}
        </div>

        {/* Fits */}
        <section>
          <p className="ql-label mb-3">Project Fits ({prospect.fits.length})</p>
          {prospect.fits.length === 0 ? (
            <p className="text-xs text-[#5E5E5E]/60">Sin fits asignados. Ejecuta un analisis de inteligencia para generar recomendaciones.</p>
          ) : (
            <div className="rounded-lg border border-[#E8E4DE] bg-white divide-y divide-[#E8E4DE]">
              {prospect.fits.map((fit) => (
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
