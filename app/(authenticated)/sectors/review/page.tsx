"use client";

import { useState, useEffect } from "react";
import { NAICS_SECTORS, getNaicsLabel } from "@/lib/firm-insights/naics";

interface PendingProject {
  id: string;
  title: string;
  description: string | null;
  naicsSector: string | null;
  naicsSectorConfidence: number | null;
  naicsSectorReviewed: boolean;
}

interface PendingInsight {
  id: string;
  title: string;
  content: string;
  insightType: string;
  naicsSector: string | null;
  naicsSectorConfidence: number | null;
  naicsSectorReviewed: boolean;
  sourceProject: { title: string } | null;
}

export default function SectorReviewPage() {
  const [projects, setProjects] = useState<PendingProject[]>([]);
  const [insights, setInsights] = useState<PendingInsight[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPending();
  }, []);

  const fetchPending = async () => {
    setLoading(true);
    try {
      const [pRes, iRes] = await Promise.all([
        fetch("/api/projects?reviewPending=true").then((r) => r.json()),
        fetch("/api/firm-insights?reviewPending=true").then((r) => r.json()),
      ]);
      setProjects(
        (pRes.projects ?? []).filter((p: PendingProject) => !p.naicsSectorReviewed)
      );
      setInsights(
        (iRes.insights ?? []).filter((i: PendingInsight) => !i.naicsSectorReviewed)
      );
    } catch (err) {
      console.error("Error loading pending:", err);
    } finally {
      setLoading(false);
    }
  };

  const updateProjectSector = async (id: string, sector: string | null) => {
    await fetch(`/api/projects/${id}/sector`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ naicsSector: sector }),
    });
    setProjects((prev) => prev.filter((p) => p.id !== id));
  };

  const updateInsightSector = async (id: string, sector: string | null) => {
    await fetch(`/api/firm-insights/${id}/sector`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ naicsSector: sector }),
    });
    setInsights((prev) => prev.filter((i) => i.id !== id));
  };

  if (loading) return <div className="p-8 text-[#5E5E5E]">Cargando...</div>;

  return (
    <div className="max-w-5xl mx-auto p-8 space-y-10">
      <header>
        <h1
          className="text-3xl text-[#1A1A1A] mb-2"
          style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}
        >
          Revisión de sectores NAICS
        </h1>
        <p className="text-sm text-[#5E5E5E]">
          {projects.length} proyectos y {insights.length} insights pendientes de validación.
        </p>
      </header>

      <section>
        <h2
          className="text-lg text-[#1A1A1A] mb-4 border-b border-[#E8E4DE] pb-2"
          style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}
        >
          Proyectos ({projects.length})
        </h2>
        {projects.length === 0 ? (
          <p className="text-sm text-[#5E5E5E]/70">No hay proyectos pendientes.</p>
        ) : (
          <div className="space-y-3">
            {projects.map((p) => (
              <div
                key={p.id}
                className="bg-white border border-[#E8E4DE] rounded-lg p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="text-sm font-medium text-[#1A1A1A]">{p.title}</h3>
                    {p.description && (
                      <p className="text-xs text-[#5E5E5E] mt-1 line-clamp-2">
                        {p.description}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs text-[#5E5E5E]/60">
                        Sugerido: {getNaicsLabel(p.naicsSector)}
                      </span>
                      {p.naicsSectorConfidence != null && (
                        <span className="text-xs text-[#C5A572]">
                          {Math.round(p.naicsSectorConfidence * 100)}% conf.
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 min-w-[280px]">
                    <select
                      defaultValue={p.naicsSector ?? ""}
                      onChange={(e) =>
                        updateProjectSector(p.id, e.target.value || null)
                      }
                      className="ql-input text-xs"
                    >
                      <option value="">Sin sector</option>
                      {NAICS_SECTORS.map((s) => (
                        <option key={s.code} value={s.code}>
                          {s.code} — {s.label}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => updateProjectSector(p.id, p.naicsSector)}
                      className="ql-btn-primary text-xs py-1.5"
                    >
                      Confirmar sugerencia
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2
          className="text-lg text-[#1A1A1A] mb-4 border-b border-[#E8E4DE] pb-2"
          style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}
        >
          FirmInsights ({insights.length})
        </h2>
        {insights.length === 0 ? (
          <p className="text-sm text-[#5E5E5E]/70">No hay insights pendientes.</p>
        ) : (
          <div className="space-y-3">
            {insights.map((i) => (
              <div
                key={i.id}
                className="bg-white border border-[#E8E4DE] rounded-lg p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs uppercase tracking-wider text-[#C5A572]">
                        {i.insightType}
                      </span>
                      {i.sourceProject && (
                        <span className="text-xs text-[#5E5E5E]/70">
                          de {i.sourceProject.title}
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-medium text-[#1A1A1A]">{i.title}</h3>
                    <p className="text-xs text-[#5E5E5E] mt-1 line-clamp-3">
                      {i.content}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs text-[#5E5E5E]/60">
                        Sugerido: {getNaicsLabel(i.naicsSector)}
                      </span>
                      {i.naicsSectorConfidence != null && (
                        <span className="text-xs text-[#C5A572]">
                          {Math.round(i.naicsSectorConfidence * 100)}% conf.
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 min-w-[280px]">
                    <select
                      defaultValue={i.naicsSector ?? ""}
                      onChange={(e) =>
                        updateInsightSector(i.id, e.target.value || null)
                      }
                      className="ql-input text-xs"
                    >
                      <option value="">Transversal (sin sector)</option>
                      {NAICS_SECTORS.map((s) => (
                        <option key={s.code} value={s.code}>
                          {s.code} — {s.label}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => updateInsightSector(i.id, i.naicsSector)}
                      className="ql-btn-primary text-xs py-1.5"
                    >
                      Confirmar sugerencia
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
