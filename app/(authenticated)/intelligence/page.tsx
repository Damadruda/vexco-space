"use client";

import { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/ui/header";
import { BrainCircuit, Play, Check, ExternalLink, X, Clock } from "lucide-react";
import Link from "next/link";

// ─── Types ───────────────────────────────────────────────────────────────────

interface AffinityPair {
  projectAId: string;
  projectBId: string;
  audience: number;
  valueProp: number;
  channels: number;
  deliverables: number;
  overall: number;
  rationale: string;
}

interface MetaProjectProposal {
  name: string;
  narrative: string;
  componentProjectIds: string[];
  roles?: Record<string, string>;
  suggestedMilestones: Array<{ title: string; description?: string; dependsOnProjectIds?: string[] }>;
  rationale: string;
  clusterAvgScore: number;
}

interface ChannelRouting {
  channelId: string;
  recommendedProjectIds: string[];
  rationale: string;
  nextAction: string;
}

interface ProspectRouting {
  prospectId: string;
  fits: Array<{ projectId: string; fitScore: number; rationale: string }>;
  primaryProjectId: string;
  nextAction: string;
}

interface Analysis {
  id: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
  affinityMatrix: AffinityPair[];
  metaProjectProposals: MetaProjectProposal[];
  channelRouting: ChannelRouting[];
  prospectRouting: ProspectRouting[];
}

interface ProjectMap {
  [id: string]: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function affinityColor(score: number): string {
  if (score >= 80) return "bg-[#B8860B] text-white";
  if (score >= 60) return "bg-[#C5A572]/60 text-[#1A1A1A]";
  if (score >= 40) return "bg-[#C5A572]/30 text-[#1A1A1A]";
  if (score >= 20) return "bg-[#E8E4DE] text-[#5E5E5E]";
  return "bg-[#F9F8F6] text-[#5E5E5E]/60";
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function IntelligencePage() {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [projectMap, setProjectMap] = useState<ProjectMap>({});
  const [channelMap, setChannelMap] = useState<Record<string, string>>({});
  const [prospectMap, setProspectMap] = useState<Record<string, string>>({});
  const [instantiated, setInstantiated] = useState<Record<number, string>>({});
  const [appliedChannels, setAppliedChannels] = useState<Set<number>>(new Set());
  const [appliedProspects, setAppliedProspects] = useState<Set<number>>(new Set());
  const [selectedCell, setSelectedCell] = useState<AffinityPair | null>(null);
  const [instantiateModal, setInstantiateModal] = useState<{ index: number; proposal: MetaProjectProposal } | null>(null);
  const [editName, setEditName] = useState("");
  const [editNarrative, setEditNarrative] = useState("");

  const fetchLatest = useCallback(async () => {
    try {
      const [analysisRes, projectsRes, channelsRes, prospectsRes] = await Promise.all([
        fetch("/api/intelligence/cross-portfolio/latest"),
        fetch("/api/projects"),
        fetch("/api/channels"),
        fetch("/api/prospects"),
      ]);
      const aData = await analysisRes.json();
      const pData = await projectsRes.json();
      const cData = await channelsRes.json();
      const prData = await prospectsRes.json();

      if (aData.analysis) setAnalysis(aData.analysis);

      // Use server-resolved projectMap from /latest as primary, client-side as fallback
      const pm: ProjectMap = aData.projectMap ?? {};
      for (const p of pData.projects || pData || []) {
        if (!pm[p.id]) pm[p.id] = p.title;
      }
      setProjectMap(pm);

      const cm: Record<string, string> = {};
      for (const c of cData.channels || []) {
        cm[c.id] = c.name;
      }
      setChannelMap(cm);

      const prm: Record<string, string> = {};
      for (const pr of prData.prospects || []) {
        prm[pr.id] = `${pr.name}${pr.company ? ` (${pr.company})` : ""}`;
      }
      setProspectMap(prm);
    } catch (e) {
      console.error("Failed to fetch intelligence data:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLatest();
  }, [fetchLatest]);

  const handleRun = async () => {
    setRunning(true);
    try {
      const res = await fetch("/api/intelligence/cross-portfolio", { method: "POST" });
      const data = await res.json();
      if (data.status === "completed") {
        await fetchLatest();
      } else {
        alert(data.errorMessage || "Analisis fallido");
      }
    } catch (e) {
      console.error("Run failed:", e);
    } finally {
      setRunning(false);
    }
  };

  const handleInstantiate = async () => {
    if (!instantiateModal || !analysis) return;
    const res = await fetch(`/api/intelligence/cross-portfolio/${analysis.id}/instantiate-metaproject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        proposalIndex: instantiateModal.index,
        name: editName,
        narrative: editNarrative,
      }),
    });
    if (res.ok) {
      const { metaProjectId } = await res.json();
      setInstantiated((prev) => ({ ...prev, [instantiateModal.index]: metaProjectId }));
    }
    setInstantiateModal(null);
  };

  const handleApplyChannel = async (idx: number) => {
    if (!analysis) return;
    await fetch(`/api/intelligence/cross-portfolio/${analysis.id}/apply-channel-routing`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ routingIndex: idx }),
    });
    setAppliedChannels((prev) => new Set(prev).add(idx));
  };

  const handleApplyProspect = async (idx: number) => {
    if (!analysis) return;
    await fetch(`/api/intelligence/cross-portfolio/${analysis.id}/apply-prospect-routing`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ routingIndex: idx }),
    });
    setAppliedProspects((prev) => new Set(prev).add(idx));
  };

  // Build heatmap data
  const projectIds = Object.keys(projectMap);
  const matrix = analysis?.affinityMatrix || [];

  const getScore = (a: string, b: string): AffinityPair | undefined =>
    matrix.find(
      (m) => (m.projectAId === a && m.projectBId === b) || (m.projectAId === b && m.projectBId === a)
    );

  return (
    <div className="ql-page">
      <Header title="Inteligencia de portafolio" subtitle="Cross-portfolio" />

      <div className="p-6 max-w-7xl mx-auto space-y-10">
        {/* Header bar */}
        <div className="flex items-center justify-between">
          <div>
            {analysis && (
              <p className="text-xs text-[#5E5E5E]">
                Ultimo analisis: {new Date(analysis.completedAt || analysis.createdAt).toLocaleDateString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
          </div>
          <button
            onClick={handleRun}
            disabled={running}
            className="inline-flex items-center gap-2 rounded-lg bg-[#1A1A1A] px-5 py-2.5 text-sm text-white hover:bg-[#333] disabled:opacity-50 transition-colors"
          >
            {running ? (
              <>
                <span className="ql-status-thinking" />
                Analizando...
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" />
                Ejecutar analisis
              </>
            )}
          </button>
        </div>

        {loading ? (
          <div className="py-12 text-center">
            <span className="ql-status-thinking mr-2" />
            <span className="ql-loading">Cargando...</span>
          </div>
        ) : !analysis ? (
          <div className="rounded-lg border border-[#E8E4DE] bg-white p-12 text-center">
            <BrainCircuit className="h-10 w-10 text-[#5E5E5E]/20 mx-auto mb-4" />
            <p className="text-sm text-[#5E5E5E]">No hay analisis previos.</p>
            <p className="text-xs text-[#5E5E5E]/60 mt-1">
              Ejecuta el primer analisis cruzado para descubrir sinergias entre tus proyectos.
            </p>
          </div>
        ) : (
          <>
            {/* 1. AFFINITY MATRIX */}
            <section>
              <p className="ql-label mb-2">Sinergias</p>
              <h2 className="ql-h2 mb-5">Matriz de afinidad</h2>

              {projectIds.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-[#E8E4DE] bg-white">
                  <table className="w-full text-xs">
                    <thead>
                      <tr>
                        <th className="p-2 text-left text-[#5E5E5E]/70 font-normal"></th>
                        {projectIds.map((pid) => (
                          <th key={pid} className="p-2 text-center font-normal text-[#5E5E5E]/70 max-w-[100px]">
                            <span className="block truncate">{projectMap[pid]}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {projectIds.map((rowId) => (
                        <tr key={rowId}>
                          <td className="p-2 text-[#5E5E5E]/70 font-normal max-w-[120px]">
                            <span className="block truncate">{projectMap[rowId]}</span>
                          </td>
                          {projectIds.map((colId) => {
                            if (rowId === colId) {
                              return <td key={colId} className="p-1"><div className="w-10 h-10 bg-[#E8E4DE]/30 rounded mx-auto" /></td>;
                            }
                            const pair = getScore(rowId, colId);
                            return (
                              <td key={colId} className="p-1">
                                <button
                                  onClick={() => pair && setSelectedCell(pair)}
                                  className={`w-10 h-10 rounded flex items-center justify-center text-[10px] font-mono mx-auto cursor-pointer hover:ring-1 hover:ring-[#C5A572] transition-all ${
                                    pair ? affinityColor(pair.overall) : "bg-[#F9F8F6] text-[#5E5E5E]/30"
                                  }`}
                                  title={pair ? `${projectMap[pair.projectAId]} × ${projectMap[pair.projectBId]}: ${pair.overall}` : "Sin datos"}
                                >
                                  {pair ? pair.overall : "—"}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* 2. META-PROJECT PROPOSALS */}
            <section>
              <p className="ql-label mb-2">Clusters</p>
              <h2 className="ql-h2 mb-5">Programas propuestos</h2>

              {analysis.metaProjectProposals.length === 0 ? (
                <p className="text-xs text-[#5E5E5E]/60">No se identificaron clusters con afinidad suficiente (umbral: 70).</p>
              ) : (
                <div className="space-y-4">
                  {analysis.metaProjectProposals.map((proposal, idx) => (
                    <div key={idx} className="rounded-lg border border-[#E8E4DE] bg-white p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="text-sm font-medium text-[#1A1A1A]">{proposal.name}</h3>
                          <p className="text-xs text-[#5E5E5E] mt-1">{proposal.narrative}</p>
                        </div>
                        <span className="shrink-0 text-lg font-light text-[#C5A572] tabular-nums ml-4">
                          {proposal.clusterAvgScore}<span className="text-xs text-[#5E5E5E]/50">/100</span>
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {proposal.componentProjectIds.map((pid) => (
                          <span key={pid} className="inline-flex items-center rounded-full bg-[#F9F8F6] border border-[#E8E4DE] px-2 py-0.5 text-[10px] text-[#5E5E5E]">
                            {projectMap[pid] || pid}
                            {proposal.roles?.[pid] && (
                              <span className="ml-1 text-[#C5A572]">{proposal.roles[pid]}</span>
                            )}
                          </span>
                        ))}
                      </div>

                      <div className="mb-3">
                        <p className="text-[10px] text-[#5E5E5E]/70 uppercase tracking-wide mb-1">Milestones sugeridos</p>
                        <ul className="space-y-0.5">
                          {proposal.suggestedMilestones.map((ms, mIdx) => (
                            <li key={mIdx} className="text-xs text-[#5E5E5E] flex items-start gap-1.5">
                              <span className="text-[#C5A572] mt-0.5">·</span>
                              {ms.title}
                            </li>
                          ))}
                        </ul>
                      </div>

                      {instantiated[idx] ? (
                        <Link
                          href={`/project-builder/meta/${instantiated[idx]}`}
                          className="inline-flex items-center gap-1.5 text-xs text-emerald-600"
                        >
                          <Check className="h-3 w-3" /> Instanciado
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      ) : (
                        <button
                          onClick={() => {
                            setInstantiateModal({ index: idx, proposal });
                            setEditName(proposal.name);
                            setEditNarrative(proposal.narrative);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[#C5A572]/40 px-3 py-1.5 text-xs text-[#8B7355] hover:border-[#C5A572] transition-colors"
                        >
                          Instanciar como Programa
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* 3. CHANNEL ROUTING */}
            <section>
              <p className="ql-label mb-2">Distribucion</p>
              <h2 className="ql-h2 mb-5">Ruteo de canales</h2>

              {analysis.channelRouting.length === 0 ? (
                <div className="rounded-lg border border-[#E8E4DE] bg-white p-8 text-center">
                  <p className="text-xs text-[#5E5E5E]/60">
                    No hay canales registrados.{" "}
                    <Link href="/channels" className="text-[#C5A572] hover:underline">Crear canales</Link> para activar el ruteo.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {analysis.channelRouting.map((cr, idx) => (
                    <div key={idx} className="rounded-lg border border-[#E8E4DE] bg-white p-5">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h4 className="text-sm font-medium text-[#1A1A1A]">{channelMap[cr.channelId] || cr.channelId}</h4>
                          <p className="text-xs text-[#5E5E5E] mt-1">{cr.rationale}</p>
                        </div>
                        {appliedChannels.has(idx) ? (
                          <span className="text-xs text-emerald-600 flex items-center gap-1"><Check className="h-3 w-3" /> Aplicado</span>
                        ) : (
                          <button
                            onClick={() => handleApplyChannel(idx)}
                            className="shrink-0 text-xs text-[#8B7355] border border-[#C5A572]/40 rounded px-2 py-1 hover:border-[#C5A572]"
                          >
                            Aplicar ruteo
                          </button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {cr.recommendedProjectIds.map((pid) => (
                          <span key={pid} className="inline-flex items-center rounded-full bg-[#F9F8F6] border border-[#E8E4DE] px-2 py-0.5 text-[10px] text-[#5E5E5E]">
                            {projectMap[pid] || pid}
                          </span>
                        ))}
                      </div>
                      <p className="text-[10px] text-[#C5A572] mt-2">{cr.nextAction}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* 4. PROSPECT ROUTING */}
            <section>
              <p className="ql-label mb-2">Pipeline</p>
              <h2 className="ql-h2 mb-5">Ruteo de prospects</h2>

              {analysis.prospectRouting.length === 0 ? (
                <div className="rounded-lg border border-[#E8E4DE] bg-white p-8 text-center">
                  <p className="text-xs text-[#5E5E5E]/60">
                    No hay prospects registrados.{" "}
                    <Link href="/prospects" className="text-[#C5A572] hover:underline">Crear prospects</Link> para activar el ruteo.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {analysis.prospectRouting.map((pr, idx) => (
                    <div key={idx} className="rounded-lg border border-[#E8E4DE] bg-white p-5">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h4 className="text-sm font-medium text-[#1A1A1A]">{prospectMap[pr.prospectId] || pr.prospectId}</h4>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {pr.fits.map((f) => (
                              <span key={f.projectId} className="text-xs text-[#5E5E5E]">
                                {projectMap[f.projectId] || f.projectId}: <span className="text-[#C5A572] font-mono">{f.fitScore}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                        {appliedProspects.has(idx) ? (
                          <span className="text-xs text-emerald-600 flex items-center gap-1"><Check className="h-3 w-3" /> Aplicado</span>
                        ) : (
                          <button
                            onClick={() => handleApplyProspect(idx)}
                            className="shrink-0 text-xs text-[#8B7355] border border-[#C5A572]/40 rounded px-2 py-1 hover:border-[#C5A572]"
                          >
                            Aplicar fits
                          </button>
                        )}
                      </div>
                      <p className="text-[10px] text-[#C5A572] mt-1">{pr.nextAction}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* History link */}
            <div className="text-center pt-4">
              <Link href="#" className="text-xs text-[#C5A572] hover:text-[#8B7355]">
                <Clock className="h-3 w-3 inline mr-1" />
                Ver historial de analisis
              </Link>
            </div>
          </>
        )}
      </div>

      {/* Affinity Cell Detail Modal */}
      {selectedCell && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1A1A1A]/40" onClick={() => setSelectedCell(null)}>
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-[#1A1A1A]">
                {projectMap[selectedCell.projectAId]} × {projectMap[selectedCell.projectBId]}
              </h3>
              <button onClick={() => setSelectedCell(null)} className="text-[#5E5E5E] hover:text-[#1A1A1A]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              {[
                { label: "Audiencia", score: selectedCell.audience },
                { label: "Propuesta de valor", score: selectedCell.valueProp },
                { label: "Canales", score: selectedCell.channels },
                { label: "Entregables", score: selectedCell.deliverables },
              ].map((axis) => (
                <div key={axis.label} className="flex items-center justify-between">
                  <span className="text-xs text-[#5E5E5E]">{axis.label}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-1.5 rounded-full bg-[#E8E4DE] overflow-hidden">
                      <div className="h-full rounded-full bg-[#C5A572]" style={{ width: `${axis.score}%` }} />
                    </div>
                    <span className="text-xs font-mono text-[#1A1A1A] w-8 text-right">{axis.score}</span>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-[#E8E4DE] pt-3">
                <span className="text-xs font-medium text-[#1A1A1A]">Overall</span>
                <span className="text-lg font-light text-[#C5A572] tabular-nums">{selectedCell.overall}</span>
              </div>
              <p className="text-xs text-[#5E5E5E] border-t border-[#E8E4DE] pt-3">{selectedCell.rationale}</p>
            </div>
          </div>
        </div>
      )}

      {/* Instantiate Modal */}
      {instantiateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1A1A1A]/40">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-[#1A1A1A]" style={{ fontFamily: "var(--font-heading)" }}>
                Crear Programa
              </h3>
              <button onClick={() => setInstantiateModal(null)} className="text-[#5E5E5E] hover:text-[#1A1A1A]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="ql-label mb-1 block">Nombre del programa</label>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-transparent border-b border-transparent hover:border-[#5E5E5E]/30 focus:border-[#1A1A1A] outline-none py-2 text-sm"
                />
              </div>
              <div>
                <label className="ql-label mb-1 block">Narrativa</label>
                <textarea
                  value={editNarrative}
                  onChange={(e) => setEditNarrative(e.target.value)}
                  rows={4}
                  className="w-full bg-transparent border-b border-transparent hover:border-[#5E5E5E]/30 focus:border-[#1A1A1A] outline-none py-2 text-sm resize-none"
                />
              </div>
              <div>
                <p className="ql-label mb-1">Componentes</p>
                <div className="flex flex-wrap gap-1.5">
                  {instantiateModal.proposal.componentProjectIds.map((pid) => (
                    <span key={pid} className="inline-flex items-center rounded-full bg-[#F9F8F6] border border-[#E8E4DE] px-2 py-0.5 text-[10px] text-[#5E5E5E]">
                      {projectMap[pid] || pid}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <p className="ql-label mb-1">Milestones sugeridos</p>
                <ul className="space-y-0.5">
                  {instantiateModal.proposal.suggestedMilestones.map((ms, mIdx) => (
                    <li key={mIdx} className="text-xs text-[#5E5E5E]">· {ms.title}</li>
                  ))}
                </ul>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setInstantiateModal(null)} className="px-4 py-2 text-sm text-[#5E5E5E] hover:text-[#1A1A1A]">
                  Cancelar
                </button>
                <button
                  onClick={handleInstantiate}
                  className="px-4 py-2 text-sm rounded-lg bg-[#1A1A1A] text-white hover:bg-[#333] transition-colors"
                >
                  Crear Programa
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
