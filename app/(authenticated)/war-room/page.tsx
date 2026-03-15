"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { X, FolderKanban, MessageSquare } from "lucide-react";
import { ExpertList } from "@/components/expert-panel/expert-list";
import { ConsultantsThread } from "@/components/expert-panel/consultants-thread";
import { Expert, EXPERTS } from "@/components/expert-panel/experts-data";

interface Project {
  id: string;
  title: string;
}

type WarRoomMode = "select" | "free_session";

export default function WarRoomPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectIdParam = searchParams.get("projectId");

  const [mode, setMode] = useState<WarRoomMode>(projectIdParam ? "free_session" : "select");
  const [activeExpert, setActiveExpert] = useState<Expert>(EXPERTS[0]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    projectIdParam ?? ""
  );
  const [loadingProjects, setLoadingProjects] = useState(true);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data) => {
        const list: Project[] = data?.projects ?? [];
        setProjects(list);
        if (!projectIdParam && list.length > 0) {
          setSelectedProjectId(list[0].id);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingProjects(false));
  }, [projectIdParam]);

  // If a projectId is provided via query, show free consultation immediately
  if (projectIdParam && mode === "free_session") {
    const foundProject = projects.find((p) => p.id === projectIdParam);
    return (
      <div className="fixed inset-0 z-[100] flex bg-ql-offwhite">
        <div className="w-72 shrink-0 border-r border-ql-sand/20 flex flex-col bg-white">
          <div className="px-4 pt-5 pb-4 border-b border-ql-sand/20 flex items-center justify-between">
            <div>
              <p className="text-base font-semibold text-ql-charcoal tracking-tight"
                style={{ fontFamily: "var(--font-heading)" }}>
                War Room
              </p>
              {foundProject && (
                <p className="ql-caption mt-0.5 truncate">{foundProject.title}</p>
              )}
            </div>
            <Link
              href="/dashboard"
              className="rounded-md p-1.5 text-ql-muted hover:bg-ql-cream hover:text-ql-slate transition-colors"
              title="Salir"
            >
              <X className="h-4 w-4" />
            </Link>
          </div>
          <ExpertList activeExpertId={activeExpert.id} onSelect={setActiveExpert} />
        </div>
        <div className="flex-1 flex flex-col min-w-0">
          <ConsultantsThread
            activeExpert={activeExpert}
            projectId={projectIdParam}
            projectTitle={foundProject?.title ?? "Proyecto"}
          />
        </div>
      </div>
    );
  }

  // Free session — no project
  if (mode === "free_session") {
    return (
      <div className="fixed inset-0 z-[100] flex bg-ql-offwhite">
        <div className="w-72 shrink-0 border-r border-ql-sand/20 flex flex-col bg-white">
          <div className="px-4 pt-5 pb-4 border-b border-ql-sand/20 flex items-center justify-between">
            <p className="text-base font-semibold text-ql-charcoal tracking-tight"
              style={{ fontFamily: "var(--font-heading)" }}>
              War Room
            </p>
            <button
              onClick={() => setMode("select")}
              className="rounded-md p-1.5 text-ql-muted hover:bg-ql-cream hover:text-ql-slate transition-colors"
              title="Volver"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="px-4 py-3 border-b border-ql-sand/20">
            <p className="ql-caption text-ql-warning normal-case tracking-normal">
              Sin proyecto activo. Los agentes no tendrán contexto de proyecto.
            </p>
          </div>
          <ExpertList activeExpertId={activeExpert.id} onSelect={setActiveExpert} />
        </div>
        <div className="flex-1 flex flex-col min-w-0">
          <ConsultantsThread
            activeExpert={activeExpert}
            projectId={undefined}
            projectTitle="Sin proyecto"
          />
        </div>
      </div>
    );
  }

  // ── Project selector screen ─────────────────────────────────────────────────
  return (
    <div className="ql-page px-8 py-10 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="ql-h1">War Room</h1>
        <p className="ql-body mt-2">Sesión estratégica con tus agentes</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-6">
        {/* Card 1: Select Project */}
        <div className="ql-card p-6 space-y-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-ql-accent/10">
            <FolderKanban className="h-5 w-5 text-ql-accent" strokeWidth={1.5} />
          </div>
          <div>
            <h3 className="ql-h3">Seleccionar proyecto</h3>
            <p className="ql-body mt-1">
              Los agentes tendrán acceso al contexto completo de tu proyecto.
            </p>
          </div>

          {loadingProjects ? (
            <div className="flex items-center gap-2">
              <span className="ql-status-thinking" />
              <span className="ql-loading">Cargando proyectos...</span>
            </div>
          ) : projects.length === 0 ? (
            <p className="ql-caption normal-case tracking-normal italic">
              No tienes proyectos. Crea uno primero.
            </p>
          ) : (
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="ql-input"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          )}

          <button
            onClick={() => {
              if (selectedProjectId) {
                router.push(`/project-builder/${selectedProjectId}/war-room`);
              }
            }}
            disabled={!selectedProjectId || loadingProjects}
            className="ql-btn-primary disabled:opacity-50 w-full justify-center"
          >
            Abrir War Room
          </button>
        </div>

        {/* Card 2: Free Session */}
        <div className="ql-card p-6 space-y-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-ql-cream">
            <MessageSquare className="h-5 w-5 text-ql-muted" strokeWidth={1.5} />
          </div>
          <div>
            <h3 className="ql-h3">Sesión libre</h3>
            <p className="ql-body mt-1">
              Consulta directa con cualquier agente. Sin contexto de proyecto.
            </p>
          </div>
          <p className="ql-caption normal-case tracking-normal text-ql-warning">
            Los agentes no podrán acceder al historial ni decisiones anteriores.
          </p>
          <button
            onClick={() => setMode("free_session")}
            className="ql-btn-secondary w-full justify-center"
          >
            Iniciar sesión libre
          </button>
        </div>
      </div>
    </div>
  );
}
