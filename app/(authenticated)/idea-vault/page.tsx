"use client";

import { useState } from "react";
import { Header } from "@/components/ui/header";
import { ContentGallery } from "@/components/ui/content-gallery";
import { IdeaForm } from "@/components/ui/idea-form";
import { Plus, Lightbulb, FileText, Link as LinkIcon, Image as ImageIcon } from "lucide-react";

export default function IdeaVaultPage() {
  const [showForm, setShowForm] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleSuccess = () => {
    setRefreshKey((k) => k + 1);
  };

  return (
    <div className="min-h-screen">
      <Header title="Idea Vault" />

      <div className="p-6 space-y-6">
        {/* Header Section */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Bóveda de Ideas</h2>
            <p className="text-slate-500">Captura y organiza todo tu contenido en un solo lugar</p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Agregar Contenido
          </button>
        </div>

        {/* Quick Capture Cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          <button
            onClick={() => setShowForm(true)}
            className="group flex items-center gap-4 rounded-xl border-2 border-dashed border-slate-200 bg-white p-4 transition-all hover:border-green-400 hover:bg-green-50"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-100 text-green-600 transition-colors group-hover:bg-green-200">
              <FileText className="h-6 w-6" />
            </div>
            <div className="text-left">
              <h3 className="font-semibold text-slate-800">Nueva Nota</h3>
              <p className="text-sm text-slate-500">Captura una idea rápida</p>
            </div>
          </button>

          <button
            onClick={() => setShowForm(true)}
            className="group flex items-center gap-4 rounded-xl border-2 border-dashed border-slate-200 bg-white p-4 transition-all hover:border-blue-400 hover:bg-blue-50"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-600 transition-colors group-hover:bg-blue-200">
              <LinkIcon className="h-6 w-6" />
            </div>
            <div className="text-left">
              <h3 className="font-semibold text-slate-800">Guardar Link</h3>
              <p className="text-sm text-slate-500">Con preview automático</p>
            </div>
          </button>

          <button
            onClick={() => setShowForm(true)}
            className="group flex items-center gap-4 rounded-xl border-2 border-dashed border-slate-200 bg-white p-4 transition-all hover:border-purple-400 hover:bg-purple-50"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-100 text-purple-600 transition-colors group-hover:bg-purple-200">
              <ImageIcon className="h-6 w-6" />
            </div>
            <div className="text-left">
              <h3 className="font-semibold text-slate-800">Subir Imagen</h3>
              <p className="text-sm text-slate-500">Galería visual</p>
            </div>
          </button>
        </div>

        {/* Content Gallery */}
        <div>
          <h3 className="mb-4 text-lg font-semibold text-slate-800">Contenido Capturado</h3>
          <ContentGallery key={refreshKey} />
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <IdeaForm
          onClose={() => setShowForm(false)}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
}