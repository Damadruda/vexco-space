"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { ExpertList } from "@/components/expert-panel/expert-list";
import { ConsultantsThread } from "@/components/expert-panel/consultants-thread";
import { Expert, EXPERTS } from "@/components/expert-panel/experts-data";
import { Loader2 } from "lucide-react";

export default function ProjectWarRoomPage() {
  const params = useParams();
  const projectId = params?.id as string;

  const [activeExpert, setActiveExpert] = useState<Expert>(EXPERTS[0]);
  const [projectTitle, setProjectTitle] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/projects/${projectId}`)
      .then((r) => r.json())
      .then((data) => setProjectTitle(data?.project?.title ?? "Proyecto"))
      .catch(() => setProjectTitle("Proyecto"))
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="flex bg-white" style={{ height: "100vh" }}>
      {/* ── Panel de Expertos ── */}
      <div className="w-72 shrink-0 border-r border-gray-100 flex flex-col">
        <div className="px-4 pt-5 pb-4 border-b border-gray-100">
          <p className="text-xs tracking-[0.15em] uppercase text-gray-400 mb-1">Orquestación</p>
          <span className="font-serif text-base font-semibold text-gray-900 tracking-tight">War Room</span>
          {projectTitle && (
            <p className="text-xs text-gray-400 mt-1 truncate">{projectTitle}</p>
          )}
        </div>
        <ExpertList
          activeExpertId={activeExpert.id}
          onSelect={setActiveExpert}
        />
      </div>

      {/* ── Consultant's Thread ── */}
      <div className="flex-1 flex flex-col min-w-0">
        <ConsultantsThread
          activeExpert={activeExpert}
          projectId={projectId}
          projectTitle={projectTitle}
        />
      </div>
    </div>
  );
}
