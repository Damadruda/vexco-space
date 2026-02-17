"use client";

import { useState, useEffect, useRef } from "react";
import { Header } from "@/components/ui/header";
import { StatCard } from "@/components/ui/stat-card";
import { KanbanBoard } from "@/components/ui/kanban-board";
import { FolderKanban, Lightbulb, FileText, Link as LinkIcon, Image as ImageIcon, TrendingUp, Loader2, ArrowRight, Sparkles, RefreshCw, CloudDownload, Plus } from "lucide-react";
import Link from "next/link";
import { DriveFolderAnalyzer } from "@/components/ui/drive-folder-analyzer";

interface Stats {
  totalProjects: number;
  projectsByStatus: {
    idea: number;
    development: number;
    execution: number;
    completed: number;
  };
  totalNotes: number;
  totalLinks: number;
  totalImages: number;
  totalContent: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiInsights, setAiInsights] = useState<string>("");
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [showDriveAnalyzer, setShowDriveAnalyzer] = useState(false);
  const insightsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch("/api/stats");
        const data = await res.json();
        setStats(data?.stats);
      } catch (error) {
        console.error("Error fetching stats:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  const generateInsights = async () => {
    setLoadingInsights(true);
    setAiInsights("");

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "project_insights",
          data: { content: "Dame un resumen rápido del estado de mis proyectos y recomendaciones de próximos pasos prioritarios. Sé conciso." },
          stream: true
        })
      });

      if (!res.ok) throw new Error("Error generating insights");

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              const text = parsed.choices?.[0]?.delta?.content || "";
              fullContent += text;
              setAiInsights(fullContent);
            } catch (e) {
              // Skip
            }
          }
        }
      }
    } catch (error) {
      console.error("Insights error:", error);
      setAiInsights("No se pudieron generar los insights. Intenta de nuevo.");
    } finally {
      setLoadingInsights(false);
    }
  };

  useEffect(() => {
    if (insightsRef.current) {
      insightsRef.current.scrollTop = insightsRef.current.scrollHeight;
    }
  }, [aiInsights]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="Dashboard" subtitle="Vista general" />
      
      {/* Drive Folder Analyzer Modal */}
      <DriveFolderAnalyzer 
        isOpen={showDriveAnalyzer} 
        onClose={() => setShowDriveAnalyzer(false)} 
      />
      
      <div className="p-8 space-y-10">
        {/* Quick Actions */}
        <div className="flex flex-wrap gap-3">
          <Link
            href="/project-builder/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Nuevo Proyecto
          </Link>
          <button
            onClick={() => setShowDriveAnalyzer(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors"
          >
            <CloudDownload className="h-4 w-4" />
            Importar desde Google Drive
          </button>
        </div>

        {/* Stats Cards */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="grid gap-px bg-gray-200 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Proyectos Totales"
              value={stats?.totalProjects ?? 0}
              icon={FolderKanban}
              number="01"
            />
            <StatCard
              title="Ideas Capturadas"
              value={stats?.projectsByStatus?.idea ?? 0}
              icon={Lightbulb}
              number="02"
            />
            <StatCard
              title="En Ejecución"
              value={(stats?.projectsByStatus?.development ?? 0) + (stats?.projectsByStatus?.execution ?? 0)}
              icon={TrendingUp}
              number="03"
            />
            <StatCard
              title="Completados"
              value={stats?.projectsByStatus?.completed ?? 0}
              icon={FolderKanban}
              number="04"
            />
          </div>
        )}

        {/* AI Insights Section */}
        <div className="border border-amber-200 bg-amber-50/50 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100">
                <Sparkles className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <h3 className="font-serif text-lg text-gray-900">Insights con IA</h3>
                <p className="text-sm text-gray-500">Análisis automático de tus proyectos</p>
              </div>
            </div>
            <button
              onClick={generateInsights}
              disabled={loadingInsights}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
            >
              {loadingInsights ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {aiInsights ? "Actualizar" : "Generar Insights"}
            </button>
          </div>
          
          {aiInsights && (
            <div 
              ref={insightsRef}
              className="mt-4 max-h-64 overflow-y-auto rounded-lg bg-white p-4 border border-amber-100"
            >
              <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap">
                {aiInsights}
                {loadingInsights && <span className="inline-block w-2 h-4 bg-amber-500 animate-pulse ml-1" />}
              </div>
            </div>
          )}
          
          {!aiInsights && !loadingInsights && (
            <p className="text-sm text-gray-500 mt-2">
              Haz clic en "Generar Insights" para obtener un análisis personalizado de tus proyectos y recomendaciones.
            </p>
          )}
        </div>

        {/* Quick Actions */}
        <div>
          <p className="mb-4 text-xs tracking-[0.15em] uppercase text-gray-400">Acciones rápidas</p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/project-builder/new"
              className="group inline-flex items-center gap-2 bg-gray-900 px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-gray-800"
            >
              <FolderKanban className="h-4 w-4" />
              Nuevo Proyecto
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              href="/idea-vault"
              className="inline-flex items-center gap-2 border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 transition-all hover:border-gray-400"
            >
              <Lightbulb className="h-4 w-4" />
              Capturar Idea
            </Link>
            <Link
              href="/assistant"
              className="inline-flex items-center gap-2 border border-amber-300 bg-amber-50 px-5 py-2.5 text-sm font-medium text-amber-700 transition-all hover:border-amber-400 hover:bg-amber-100"
            >
              <Sparkles className="h-4 w-4" />
              Asistente IA
            </Link>
          </div>
        </div>

        {/* Kanban Board */}
        <div>
          <p className="mb-2 text-xs tracking-[0.15em] uppercase text-gray-400">Vista de proyectos</p>
          <h3 className="mb-6 font-serif text-xl text-gray-900">Estado actual de tus proyectos</h3>
          <KanbanBoard />
        </div>

        {/* Content Summary */}
        {!loading && stats && (
          <div>
            <p className="mb-2 text-xs tracking-[0.15em] uppercase text-gray-400">Contenido capturado</p>
            <h3 className="mb-6 font-serif text-xl text-gray-900">Tu repositorio de conocimiento</h3>
            <div className="grid gap-6 sm:grid-cols-3">
              <div className="border border-gray-200 bg-white p-5">
                <div className="flex items-center gap-4">
                  <FileText className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="font-serif text-2xl text-gray-900">{stats.totalNotes}</p>
                    <p className="text-sm text-gray-500">Notas guardadas</p>
                  </div>
                </div>
              </div>
              <div className="border border-gray-200 bg-white p-5">
                <div className="flex items-center gap-4">
                  <LinkIcon className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="font-serif text-2xl text-gray-900">{stats.totalLinks}</p>
                    <p className="text-sm text-gray-500">Links capturados</p>
                  </div>
                </div>
              </div>
              <div className="border border-gray-200 bg-white p-5">
                <div className="flex items-center gap-4">
                  <ImageIcon className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="font-serif text-2xl text-gray-900">{stats.totalImages}</p>
                    <p className="text-sm text-gray-500">Imágenes subidas</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
