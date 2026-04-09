"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Header } from "@/components/ui/header";
import { ArrowLeft, FileText, FolderKanban, GitBranch } from "lucide-react";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SourceDocument {
  document: {
    id: string;
    driveFileName: string;
  };
}

interface AppliedProject {
  project: {
    id: string;
    title: string;
  };
}

interface DerivativeFramework {
  id: string;
  name: string;
  slug: string;
  lifecycleStage: string;
}

interface Framework {
  id: string;
  name: string;
  slug: string;
  originSource: string | null;
  originAuthor: string | null;
  originYear: number | null;
  lifecycleStage: string;
  originalDescription: string | null;
  applicationCount: number;
  lastAppliedAt: string | null;
  sourceDocuments: SourceDocument[];
  appliedInProjects: AppliedProject[];
  derivedFrom: { id: string; name: string } | null;
  derivatives: DerivativeFramework[];
  createdAt: string;
  updatedAt: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STAGE_CONFIG: Record<string, { label: string; className: string }> = {
  EXTERNAL: { label: "External", className: "text-blue-600 bg-blue-50" },
  ADOPTED: { label: "Adopted", className: "text-emerald-600 bg-emerald-50" },
  ADAPTED: { label: "Adapted", className: "text-amber-600 bg-amber-50" },
  DERIVED: { label: "Derived", className: "text-purple-600 bg-purple-50" },
  OWN: { label: "Own", className: "text-[#8B7355] bg-[#FBF8F3]" },
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FrameworkDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [framework, setFramework] = useState<Framework | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params?.id) return;

    fetch(`/api/frameworks/${params.id}`)
      .then((r) => {
        if (!r.ok) throw new Error("Framework no encontrado");
        return r.json();
      })
      .then((data) => setFramework(data?.framework ?? data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [params?.id]);

  // ─── Loading ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-screen items-center gap-2 justify-center bg-[#F9F8F6]">
        <span className="ql-status-thinking" />
        <span className="ql-loading">Cargando framework...</span>
      </div>
    );
  }

  // ─── Error ────────────────────────────────────────────────────────────────

  if (error || !framework) {
    return (
      <div className="ql-page">
        <Header title="Framework" subtitle="Detalle" />
        <div className="p-8">
          <button
            onClick={() => router.push("/frameworks")}
            className="inline-flex items-center gap-1.5 text-sm text-[#5E5E5E] hover:text-[#1A1A1A] transition-colors mb-8"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver a Frameworks
          </button>
          <div className="text-center py-16">
            <FileText className="h-8 w-8 text-[#5E5E5E]/40 mx-auto mb-4" strokeWidth={1} />
            <p className="text-sm text-[#1A1A1A] font-medium">
              {error ?? "Framework no encontrado"}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ─── Derived values ───────────────────────────────────────────────────────

  const stageCfg = STAGE_CONFIG[framework.lifecycleStage] ?? {
    label: framework.lifecycleStage,
    className: "text-[#5E5E5E] bg-[#F9F8F6]",
  };

  const originParts: string[] = [];
  if (framework.originAuthor) originParts.push(framework.originAuthor);
  if (framework.originYear) originParts.push(String(framework.originYear));
  const originMeta = originParts.length > 0 ? originParts.join(", ") : null;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="ql-page">
      <Header title="Framework" subtitle="Detalle" />

      <div className="p-8 max-w-3xl space-y-8">
        {/* Back */}
        <button
          onClick={() => router.push("/frameworks")}
          className="inline-flex items-center gap-1.5 text-sm text-[#5E5E5E] hover:text-[#1A1A1A] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a Frameworks
        </button>

        {/* Header section */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-serif text-3xl font-normal text-[#1A1A1A]">
              {framework.name}
            </h1>
            <span
              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${stageCfg.className}`}
            >
              {stageCfg.label}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[#5E5E5E]">
            {framework.originSource && (
              <span>{framework.originSource}</span>
            )}
            {framework.originSource && originMeta && <span>·</span>}
            {originMeta && <span>{originMeta}</span>}
          </div>
        </div>

        {/* Description card */}
        {framework.originalDescription && (
          <div
            className="rounded-lg bg-white p-6"
            style={{ border: "1px solid rgba(184, 178, 168, 0.12)" }}
          >
            <p className="text-[11px] uppercase tracking-[0.1em] text-[#5E5E5E] mb-3">
              Descripcion
            </p>
            <p className="text-sm text-[#1A1A1A] leading-relaxed whitespace-pre-line">
              {framework.originalDescription}
            </p>
          </div>
        )}

        {/* Derived From */}
        {framework.derivedFrom && (
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-[0.1em] text-[#5E5E5E]">
              Derivado de
            </p>
            <Link
              href={`/frameworks/${framework.derivedFrom.id}`}
              className="inline-flex items-center gap-2 text-sm text-[#1A1A1A] hover:text-[#C5A572] transition-colors"
            >
              <GitBranch className="h-3.5 w-3.5 text-[#5E5E5E]" />
              {framework.derivedFrom.name}
            </Link>
          </div>
        )}

        {/* Derivatives */}
        {framework.derivatives && framework.derivatives.length > 0 && (
          <div className="space-y-3">
            <p className="text-[11px] uppercase tracking-[0.1em] text-[#5E5E5E]">
              Derivados ({framework.derivatives.length})
            </p>
            <div className="space-y-1.5">
              {framework.derivatives.map((d) => {
                const dStageCfg = STAGE_CONFIG[d.lifecycleStage] ?? {
                  label: d.lifecycleStage,
                  className: "text-[#5E5E5E] bg-[#F9F8F6]",
                };
                return (
                  <Link
                    key={d.id}
                    href={`/frameworks/${d.id}`}
                    className="flex items-center gap-2.5 py-1.5 text-sm text-[#1A1A1A] hover:text-[#C5A572] transition-colors"
                  >
                    <GitBranch className="h-3.5 w-3.5 text-[#5E5E5E]" />
                    <span>{d.name}</span>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${dStageCfg.className}`}
                    >
                      {dStageCfg.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Source Documents */}
        {framework.sourceDocuments && framework.sourceDocuments.length > 0 && (
          <div className="space-y-3">
            <p className="text-[11px] uppercase tracking-[0.1em] text-[#5E5E5E]">
              Documentos fuente ({framework.sourceDocuments.length})
            </p>
            <div className="space-y-1.5">
              {framework.sourceDocuments.map((sd, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 py-1.5 text-sm text-[#1A1A1A]"
                >
                  <FileText className="h-3.5 w-3.5 text-[#5E5E5E] flex-shrink-0" />
                  <span className="truncate">
                    {sd.document?.driveFileName ?? "Documento sin nombre"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Applied in Projects */}
        {framework.appliedInProjects && framework.appliedInProjects.length > 0 && (
          <div className="space-y-3">
            <p className="text-[11px] uppercase tracking-[0.1em] text-[#5E5E5E]">
              Aplicado en proyectos ({framework.appliedInProjects.length})
            </p>
            <div className="space-y-1.5">
              {framework.appliedInProjects.map((ap) => (
                <Link
                  key={ap.project?.id}
                  href={`/project-builder/${ap.project?.id}`}
                  className="flex items-center gap-2 py-1.5 text-sm text-[#1A1A1A] hover:text-[#C5A572] transition-colors"
                >
                  <FolderKanban className="h-3.5 w-3.5 text-[#5E5E5E] flex-shrink-0" />
                  <span>{ap.project?.title ?? "Proyecto sin nombre"}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Application stats */}
        {framework.applicationCount > 0 && (
          <div className="flex items-center gap-3 text-xs text-[#5E5E5E]/70 pt-2">
            <span>Aplicado {framework.applicationCount} {framework.applicationCount === 1 ? "vez" : "veces"}</span>
            {framework.lastAppliedAt && (
              <>
                <span>·</span>
                <span>
                  Ultima aplicacion:{" "}
                  {new Date(framework.lastAppliedAt).toLocaleDateString("es-ES", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
