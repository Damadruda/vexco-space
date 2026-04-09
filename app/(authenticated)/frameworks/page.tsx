"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/ui/header";
import { FileText, FolderKanban, ChevronDown } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SourceDocument {
  document: { driveFileName: string };
}

interface AppliedProject {
  project: { id: string; title: string };
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
  _count: {
    sourceDocuments: number;
    appliedInProjects: number;
  };
  createdAt: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LIFECYCLE_STAGES = [
  "EXTERNAL",
  "ADOPTED",
  "ADAPTED",
  "DERIVED",
  "OWN",
] as const;

const STAGE_CONFIG: Record<string, { label: string; className: string }> = {
  EXTERNAL: { label: "External", className: "text-blue-600 bg-blue-50" },
  ADOPTED: { label: "Adopted", className: "text-emerald-600 bg-emerald-50" },
  ADAPTED: { label: "Adapted", className: "text-amber-600 bg-amber-50" },
  DERIVED: { label: "Derived", className: "text-purple-600 bg-purple-50" },
  OWN: { label: "Own", className: "text-[#8B7355] bg-[#FBF8F3]" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `hace ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `hace ${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `hace ${weeks} sem`;
  return new Date(dateStr).toLocaleDateString("es-ES");
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FrameworksPage() {
  const router = useRouter();
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterStage, setFilterStage] = useState<string>("all");

  useEffect(() => {
    fetch("/api/frameworks")
      .then((r) => r.json())
      .then((data) => {
        setFrameworks(data?.frameworks ?? []);
        setTotal(data?.total ?? 0);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (filterStage === "all") return frameworks;
    return frameworks.filter((f) => f.lifecycleStage === filterStage);
  }, [frameworks, filterStage]);

  // ─── Loading state ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-screen items-center gap-2 justify-center bg-[#F9F8F6]">
        <span className="ql-status-thinking" />
        <span className="ql-loading">Cargando frameworks...</span>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="ql-page">
      <Header title="Frameworks" subtitle="Metodologias y modelos detectados" />

      <div className="p-8 space-y-6">
        {/* Stats + Filter */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-sm text-[#5E5E5E]">
            <span className="font-medium text-[#1A1A1A]">
              {filtered.length} framework{filtered.length !== 1 ? "s" : ""}
            </span>
            {filtered.length !== total && (
              <>
                <span>·</span>
                <span>{total} total</span>
              </>
            )}
          </div>

          <div className="relative">
            <select
              value={filterStage}
              onChange={(e) => setFilterStage(e.target.value)}
              className="appearance-none bg-transparent border-b border-transparent hover:border-[#5E5E5E]/30 focus:border-[#1A1A1A] outline-none text-sm text-[#1A1A1A] py-1.5 pr-7 pl-1 cursor-pointer transition-colors"
            >
              <option value="all">Todos los stages</option>
              {LIFECYCLE_STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {STAGE_CONFIG[stage]?.label ?? stage}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-0 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#5E5E5E] pointer-events-none" />
          </div>
        </div>

        {/* Empty state */}
        {filtered.length === 0 && (
          <div className="text-center py-16">
            <FileText
              className="h-8 w-8 text-[#5E5E5E]/40 mx-auto mb-4"
              strokeWidth={1}
            />
            <p className="text-sm text-[#1A1A1A] font-medium mb-1">
              {frameworks.length === 0
                ? "No se han detectado frameworks"
                : "Ningun framework coincide con el filtro"}
            </p>
            {frameworks.length === 0 && (
              <p className="text-xs text-[#5E5E5E] max-w-md mx-auto">
                Los frameworks se detectan automaticamente al importar documentos y analizar proyectos.
              </p>
            )}
          </div>
        )}

        {/* Table */}
        {filtered.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[11px] uppercase tracking-[0.1em] text-[#5E5E5E]">
                  <th className="pb-3 pr-4 font-medium">Nombre</th>
                  <th className="pb-3 pr-4 font-medium">Origen</th>
                  <th className="pb-3 pr-4 font-medium">Lifecycle Stage</th>
                  <th className="pb-3 pr-4 font-medium text-center">Docs source</th>
                  <th className="pb-3 pr-4 font-medium text-center">Proyectos</th>
                  <th className="pb-3 font-medium text-right">Detectado</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((fw) => {
                  const stageCfg = STAGE_CONFIG[fw.lifecycleStage] ?? {
                    label: fw.lifecycleStage,
                    className: "text-[#5E5E5E] bg-[#F9F8F6]",
                  };

                  return (
                    <tr
                      key={fw.id}
                      onClick={() => router.push(`/frameworks/${fw.id}`)}
                      className="group cursor-pointer transition-colors hover:bg-white/60"
                      style={{ borderBottom: "1px solid rgba(184, 178, 168, 0.1)" }}
                    >
                      <td className="py-3.5 pr-4">
                        <span className="text-sm font-medium text-[#1A1A1A] group-hover:text-[#C5A572] transition-colors">
                          {fw.name}
                        </span>
                      </td>
                      <td className="py-3.5 pr-4">
                        <span className="text-sm text-[#5E5E5E]">
                          {fw.originSource ?? "—"}
                        </span>
                      </td>
                      <td className="py-3.5 pr-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${stageCfg.className}`}
                        >
                          {stageCfg.label}
                        </span>
                      </td>
                      <td className="py-3.5 pr-4 text-center">
                        <span className="text-sm text-[#5E5E5E]">
                          {fw._count.sourceDocuments}
                        </span>
                      </td>
                      <td className="py-3.5 pr-4 text-center">
                        <span className="text-sm text-[#5E5E5E]">
                          {fw._count.appliedInProjects}
                        </span>
                      </td>
                      <td className="py-3.5 text-right">
                        <span className="text-xs text-[#5E5E5E]/70">
                          {timeAgo(fw.createdAt)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
