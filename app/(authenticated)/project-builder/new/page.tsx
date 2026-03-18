"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/ui/header";
import { ArrowLeft, Calendar, Tag, X, Plus, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { PROJECT_TYPES, ProjectType, PROJECT_TYPE_ORDER } from "@/lib/project-types";

export default function NewProjectPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [projectType, setProjectType] = useState<ProjectType>("idea");
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState("medium");
  const [dueDate, setDueDate] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput("");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("El título es requerido");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          projectType,
          category,
          priority,
          dueDate: dueDate || null,
          tags
        })
      });

      if (!res.ok) throw new Error("Error al crear proyecto");

      const data = await res.json();
      router.push(`/project-builder/${data.project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear proyecto");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ql-page">
      <Header title="Nuevo Proyecto" />

      <div className="p-6">
        <div className="mx-auto max-w-2xl">
          {/* Back Link */}
          <Link
            href="/project-builder"
            className="ql-btn-ghost mb-6 inline-flex"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver a proyectos
          </Link>

          {/* Form Card */}
          <div className="ql-card p-8">
            <h2 className="ql-h2 mb-6">Crear Nuevo Proyecto</h2>

            {error && (
              <div className="mb-4 rounded-md bg-ql-danger/5 border border-ql-danger/20 p-3 text-sm text-ql-danger">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Title */}
              <div>
                <label className="ql-label block mb-1.5">
                  Título del Proyecto *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="ql-input"
                  placeholder="Ej: Plataforma de consultoría digital"
                  required
                />
              </div>

              {/* Description */}
              <div>
                <label className="ql-label block mb-1.5">
                  Descripción
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="ql-textarea"
                  placeholder="Describe brevemente tu proyecto..."
                  rows={3}
                />
              </div>

              {/* Project Type */}
              <div>
                <div className="mb-1.5">
                  <label className="ql-label">
                    Tipo de Proyecto (PM Ágil)
                  </label>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {PROJECT_TYPE_ORDER.map((type) => {
                    const typeInfo = PROJECT_TYPES[type];
                    const isSelected = projectType === type;
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setProjectType(type)}
                        className={`relative flex items-start gap-3 rounded-md border-2 p-3 text-left transition-all ${
                          isSelected
                            ? `${typeInfo.borderColor} ${typeInfo.bgColor}`
                            : "border-ql-sand/30 bg-white hover:border-ql-sand/60"
                        }`}
                      >
                        <div className={`mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full ${typeInfo.dotColor}`} />
                        <div className="min-w-0">
                          <p className={`text-sm font-medium ${isSelected ? typeInfo.color : "text-ql-charcoal"}`}>
                            {typeInfo.label}
                          </p>
                          <p className="text-xs text-ql-muted leading-snug">{typeInfo.description}</p>
                        </div>
                        {isSelected && (
                          <CheckCircle2 className={`absolute right-3 top-3 h-4 w-4 shrink-0 ${typeInfo.color}`} />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Category & Priority */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="ql-label block mb-1.5">
                    Categoría
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="ql-input"
                  >
                    <option value="">Seleccionar...</option>
                    <option value="marketing">Marketing</option>
                    <option value="ventas">Ventas</option>
                    <option value="producto">Producto Digital</option>
                    <option value="consultoria">Consultoría</option>
                    <option value="servicio">Servicio</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
                <div>
                  <label className="ql-label block mb-1.5">
                    Prioridad
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className="ql-input"
                  >
                    <option value="low">Baja</option>
                    <option value="medium">Media</option>
                    <option value="high">Alta</option>
                  </select>
                </div>
              </div>

              {/* Due Date */}
              <div>
                <label className="ql-label block mb-1.5">
                  <Calendar className="mr-1 inline h-4 w-4" />
                  Fecha Límite (opcional)
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="ql-input"
                />
              </div>

              {/* Tags */}
              <div>
                <label className="ql-label block mb-1.5">
                  <Tag className="mr-1 inline h-4 w-4" />
                  Etiquetas
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), handleAddTag())}
                    className="ql-input flex-1"
                    placeholder="Agregar etiqueta"
                  />
                  <button
                    type="button"
                    onClick={handleAddTag}
                    className="ql-btn-secondary px-3"
                    aria-label="Añadir etiqueta"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                {tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="ql-badge-accent inline-flex items-center gap-1"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => setTags(tags.filter((t) => t !== tag))}
                          className="text-ql-accent hover:text-ql-charcoal transition-colors"
                          aria-label={`Eliminar etiqueta ${tag}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-ql-sand/20">
                <Link
                  href="/project-builder"
                  className="ql-btn-ghost"
                >
                  Cancelar
                </Link>
                <button
                  type="submit"
                  disabled={loading}
                  className="ql-btn-primary disabled:opacity-50"
                >
                  {loading && <span className="ql-status-thinking" />}
                  {loading ? "Creando..." : "Crear Proyecto"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
