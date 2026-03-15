"use client";

import { useState } from "react";
import { Header } from "@/components/ui/header";
import { ContentGallery } from "@/components/ui/content-gallery";
import { IdeaForm } from "@/components/ui/idea-form";
import { Plus, FileText, Link as LinkIcon, Image as ImageIcon } from "lucide-react";

export default function IdeaVaultPage() {
  const [showForm, setShowForm] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleSuccess = () => {
    setRefreshKey((k) => k + 1);
  };

  return (
    <div className="ql-page">
      <Header title="Idea Vault" />

      <div className="p-6 space-y-6">
        {/* Header Section */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="ql-h1">Bóveda de Ideas</h1>
            <p className="ql-body mt-1">Captura y organiza todo tu contenido en un solo lugar.</p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="ql-btn-primary"
          >
            <Plus className="h-4 w-4" />
            Agregar Contenido
          </button>
        </div>

        {/* Quick Capture Cards */}
        <div className="grid gap-3 sm:grid-cols-3">
          <button
            onClick={() => setShowForm(true)}
            className="ql-card group flex items-center gap-4 text-left"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-ql-success/10">
              <FileText className="h-5 w-5 text-ql-success" strokeWidth={1.5} />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-ql-charcoal">Nueva Nota</p>
              <p className="ql-caption normal-case tracking-normal mt-0.5">Captura una idea rápida</p>
            </div>
          </button>

          <button
            onClick={() => setShowForm(true)}
            className="ql-card group flex items-center gap-4 text-left"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-ql-accent/10">
              <LinkIcon className="h-5 w-5 text-ql-accent" strokeWidth={1.5} />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-ql-charcoal">Guardar Link</p>
              <p className="ql-caption normal-case tracking-normal mt-0.5">Con preview automático</p>
            </div>
          </button>

          <button
            onClick={() => setShowForm(true)}
            className="ql-card group flex items-center gap-4 text-left"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-ql-warning/10">
              <ImageIcon className="h-5 w-5 text-ql-warning" strokeWidth={1.5} />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-ql-charcoal">Subir Imagen</p>
              <p className="ql-caption normal-case tracking-normal mt-0.5">Galería visual</p>
            </div>
          </button>
        </div>

        {/* Content Gallery */}
        <div>
          <p className="ql-label mb-2">Contenido capturado</p>
          <h3 className="ql-h3 mb-4">Tu repositorio de ideas</h3>
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
