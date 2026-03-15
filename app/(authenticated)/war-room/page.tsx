"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { ExpertList } from "@/components/expert-panel/expert-list";
import { ConsultantsThread } from "@/components/expert-panel/consultants-thread";
import { Expert, EXPERTS } from "@/components/expert-panel/experts-data";

interface Project {
  id: string;
  title: string;
}

export default function WarRoomPage() {
  const searchParams = useSearchParams();
  const projectIdParam = searchParams.get("projectId");

  const [activeExpert, setActiveExpert] = useState<Expert>(EXPERTS[0]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(projectIdParam ?? undefined);
  const [selectedProjectTitle, setSelectedProjectTitle] = useState<string>("Sin proyecto activo");

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data) => {
        const list: Project[] = data?.projects ?? [];
        setProjects(list);
        if (projectIdParam) {
          const found = list.find((p) => p.id === projectIdParam);
          if (found) setSelectedProjectTitle(found.title);
        } else if (list.length > 0) {
          setSelectedProjectId(list[0].id);
          setSelectedProjectTitle(list[0].title);
        }
      })
      .catch(() => {});
  }, [projectIdParam]);

  const handleProjectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setSelectedProjectId(id || undefined);
    const found = projects.find((p) => p.id === id);
    setSelectedProjectTitle(found?.title ?? "Sin proyecto activo");
  };

  return (
    // Fixed overlay that covers the global sidebar entirely
    <div className="fixed inset-0 z-[100] flex bg-ql-offwhite">
      {/* ── Columna 1: Panel de Expertos ── */}
      <div className="w-72 shrink-0 border-r border-ql-sand/20 flex flex-col bg-white">
        {/* Header with project selector */}
        <div className="px-4 pt-5 pb-4 border-b border-ql-sand/20 space-y-3">
          <div className="flex items-center justify-between">
            <span
              className="text-base font-semibold text-ql-charcoal tracking-tight"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              War Room
            </span>
            <Link
              href="/dashboard"
              className="rounded-md p-1.5 text-ql-muted hover:bg-ql-cream hover:text-ql-slate transition-colors"
              title="Salir del War Room"
            >
              <X className="h-4 w-4" />
            </Link>
          </div>

          <div>
            <label className="ql-label block mb-1.5">
              Proyecto activo
            </label>
            <select
              value={selectedProjectId ?? ""}
              onChange={handleProjectChange}
              className="ql-input"
            >
              <option value="">Sin proyecto</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
            {!selectedProjectId && (
              <p className="mt-1 ql-caption text-ql-warning">
                Los agentes no tendrán contexto de proyecto.
              </p>
            )}
          </div>
        </div>

        <ExpertList
          activeExpertId={activeExpert.id}
          onSelect={setActiveExpert}
        />
      </div>

      {/* ── Columna 2: Consultant's Thread ── */}
      <div className="flex-1 flex flex-col min-w-0">
        <ConsultantsThread
          activeExpert={activeExpert}
          projectId={selectedProjectId}
          projectTitle={selectedProjectTitle}
        />
      </div>
    </div>
  );
}
