"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/ui/header";
import { ArrowLeft, Check, Circle, Clock, AlertCircle, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface MetaProjectDetail {
  id: string;
  name: string;
  narrative: string;
  status: string;
  revenueScore: number | null;
  affinitySnapshot: Array<{ projectAId: string; projectBId: string; overall: number }>;
  components: Array<{
    id: string;
    role: string;
    project: {
      id: string;
      title: string;
      description: string | null;
      revenueProximityScore: number | null;
      status: string;
      trackType: string;
    };
  }>;
  milestones: Array<{
    id: string;
    title: string;
    description: string | null;
    status: string;
    dependsOnProjectIds: string[];
    dueDate: string | null;
  }>;
}

const ROLE_STYLES: Record<string, string> = {
  anchor: "text-[#8B7355] bg-[#FBF8F3] border-[#C5A572]/40",
  complement: "text-[#5E5E5E] bg-[#F9F8F6] border-[#E8E4DE]",
  enabler: "text-blue-700 bg-blue-50 border-blue-200",
};

const STATUS_ICON: Record<string, typeof Check> = {
  done: Check,
  in_progress: Clock,
  blocked: AlertCircle,
  pending: Circle,
};

export default function MetaProjectDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const [mp, setMp] = useState<MetaProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"resumen" | "componentes" | "milestones">("resumen");
  const [editingNarrative, setEditingNarrative] = useState(false);
  const [narrativeDraft, setNarrativeDraft] = useState("");

  useEffect(() => {
    fetch(`/api/meta-projects/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setMp(d.metaProject);
        setNarrativeDraft(d.metaProject?.narrative || "");
      })
      .finally(() => setLoading(false));
  }, [id]);

  const saveNarrative = async () => {
    if (!mp) return;
    await fetch(`/api/meta-projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ narrative: narrativeDraft }),
    });
    setMp({ ...mp, narrative: narrativeDraft });
    setEditingNarrative(false);
  };

  const updateMilestoneStatus = async (milestoneId: string, status: string) => {
    await fetch(`/api/meta-projects/${id}/milestones/${milestoneId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setMp((prev) =>
      prev ? { ...prev, milestones: prev.milestones.map((m) => (m.id === milestoneId ? { ...m, status } : m)) } : null
    );
  };

  const handleDelete = async () => {
    if (!confirm("Eliminar este programa y todos sus milestones?")) return;
    await fetch(`/api/meta-projects/${id}`, { method: "DELETE" });
    router.push("/project-builder");
  };

  // Build project name map from components
  const projectMap: Record<string, string> = {};
  if (mp) {
    for (const c of mp.components) {
      projectMap[c.project.id] = c.project.title;
    }
  }

  if (loading) {
    return (
      <div className="ql-page">
        <Header title="Programa" subtitle="Cargando..." />
        <div className="p-6 text-center"><span className="ql-loading">Cargando...</span></div>
      </div>
    );
  }

  if (!mp) {
    return (
      <div className="ql-page">
        <Header title="Programa no encontrado" />
        <div className="p-6"><Link href="/project-builder" className="text-sm text-[#C5A572]">Volver a proyectos</Link></div>
      </div>
    );
  }

  return (
    <div className="ql-page">
      <Header title={mp.name} subtitle="Programa" />
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/project-builder" className="inline-flex items-center gap-1.5 text-xs text-[#C5A572] hover:text-[#8B7355]">
            <ArrowLeft className="h-3 w-3" /> Proyectos
          </Link>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center rounded-full border border-[#C5A572]/40 bg-[#FBF8F3] px-2.5 py-0.5 text-[10px] uppercase tracking-wide text-[#8B7355]">
              Programa
            </span>
            <button onClick={handleDelete} className="text-xs text-red-400 hover:text-red-600 inline-flex items-center gap-1">
              <Trash2 className="h-3 w-3" /> Eliminar
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-6 border-b border-[#E8E4DE]">
          {(["resumen", "componentes", "milestones"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`pb-2.5 text-sm transition-colors ${
                tab === t
                  ? "text-[#1A1A1A] border-b-2 border-[#C5A572] -mb-px"
                  : "text-[#5E5E5E] hover:text-[#1A1A1A]"
              }`}
            >
              {t === "resumen" ? "Resumen" : t === "componentes" ? "Componentes" : "Milestones"}
            </button>
          ))}
        </div>

        {/* RESUMEN */}
        {tab === "resumen" && (
          <div className="space-y-6">
            <div className="rounded-lg border border-[#E8E4DE] bg-white p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="ql-label">Narrativa</p>
                {!editingNarrative && (
                  <button onClick={() => setEditingNarrative(true)} className="text-xs text-[#C5A572] hover:text-[#8B7355]">
                    Editar
                  </button>
                )}
              </div>
              {editingNarrative ? (
                <div>
                  <textarea
                    value={narrativeDraft}
                    onChange={(e) => setNarrativeDraft(e.target.value)}
                    rows={5}
                    className="w-full bg-transparent border border-[#E8E4DE] rounded-lg p-3 text-sm outline-none focus:border-[#C5A572]"
                  />
                  <div className="flex justify-end gap-2 mt-2">
                    <button onClick={() => setEditingNarrative(false)} className="text-xs text-[#5E5E5E]">Cancelar</button>
                    <button onClick={saveNarrative} className="text-xs text-[#8B7355]">Guardar</button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-[#5E5E5E] leading-relaxed">{mp.narrative}</p>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="rounded-lg border border-[#E8E4DE] bg-white p-4">
                <p className="ql-label mb-1">Componentes</p>
                <p className="text-2xl font-light text-[#1A1A1A] tabular-nums">{mp.components.length}</p>
              </div>
              <div className="rounded-lg border border-[#E8E4DE] bg-white p-4">
                <p className="ql-label mb-1">Revenue Score</p>
                <p className="text-2xl font-light text-[#1A1A1A] tabular-nums">
                  {mp.revenueScore != null ? mp.revenueScore : "—"}
                </p>
              </div>
              <div className="rounded-lg border border-[#E8E4DE] bg-white p-4">
                <p className="ql-label mb-1">Status</p>
                <p className="text-sm text-[#1A1A1A] capitalize">{mp.status}</p>
              </div>
            </div>

            {mp.affinitySnapshot && Array.isArray(mp.affinitySnapshot) && mp.affinitySnapshot.length > 0 && (
              <div className="rounded-lg border border-[#E8E4DE] bg-white p-5">
                <p className="ql-label mb-3">Snapshot de afinidad al momento de creacion</p>
                <div className="space-y-2">
                  {mp.affinitySnapshot.map((pair, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-[#5E5E5E]">
                        {projectMap[pair.projectAId] || pair.projectAId} × {projectMap[pair.projectBId] || pair.projectBId}
                      </span>
                      <span className="font-mono text-[#C5A572]">{pair.overall}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* COMPONENTES */}
        {tab === "componentes" && (
          <div className="rounded-lg border border-[#E8E4DE] bg-white divide-y divide-[#E8E4DE]">
            {mp.components.map((comp) => (
              <Link
                key={comp.id}
                href={`/project-builder/${comp.project.id}`}
                className="flex items-center justify-between px-5 py-4 hover:bg-[#FBF8F3]/50 transition-colors"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-medium text-[#1A1A1A]">{comp.project.title}</h4>
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${ROLE_STYLES[comp.role] || ROLE_STYLES.complement}`}>
                      {comp.role}
                    </span>
                  </div>
                  {comp.project.description && (
                    <p className="text-xs text-[#5E5E5E]/70 mt-0.5 line-clamp-1">{comp.project.description}</p>
                  )}
                </div>
                <div className="text-right ml-4">
                  {comp.project.revenueProximityScore != null && (
                    <span className="text-lg font-light text-[#C5A572] tabular-nums">
                      {comp.project.revenueProximityScore}<span className="text-xs text-[#5E5E5E]/50">/10</span>
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* MILESTONES */}
        {tab === "milestones" && (
          <div className="space-y-3">
            {mp.milestones.length === 0 ? (
              <p className="text-xs text-[#5E5E5E]/60">No hay milestones definidos para este programa.</p>
            ) : (
              mp.milestones.map((ms) => {
                const Icon = STATUS_ICON[ms.status] || Circle;
                return (
                  <div key={ms.id} className="rounded-lg border border-[#E8E4DE] bg-white p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${
                          ms.status === "done" ? "text-emerald-500" :
                          ms.status === "in_progress" ? "text-[#C5A572]" :
                          ms.status === "blocked" ? "text-red-400" :
                          "text-[#5E5E5E]/30"
                        }`} />
                        <div>
                          <h4 className="text-sm text-[#1A1A1A]">{ms.title}</h4>
                          {ms.description && <p className="text-xs text-[#5E5E5E] mt-0.5">{ms.description}</p>}
                          {ms.dependsOnProjectIds.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {ms.dependsOnProjectIds.map((depId) => (
                                <Link
                                  key={depId}
                                  href={`/project-builder/${depId}`}
                                  className="inline-flex items-center rounded-full bg-[#F9F8F6] border border-[#E8E4DE] px-2 py-0.5 text-[10px] text-[#C5A572] hover:border-[#C5A572]/40"
                                >
                                  {projectMap[depId] || depId}
                                </Link>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <select
                        value={ms.status}
                        onChange={(e) => updateMilestoneStatus(ms.id, e.target.value)}
                        className="text-[10px] bg-transparent border border-[#E8E4DE] rounded px-1.5 py-0.5 text-[#5E5E5E] outline-none focus:border-[#C5A572]"
                      >
                        <option value="pending">Pendiente</option>
                        <option value="in_progress">En progreso</option>
                        <option value="done">Completado</option>
                        <option value="blocked">Bloqueado</option>
                      </select>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
