"use client";

import { useState } from "react";
import { X, Plus, Loader2, Link as LinkIcon, FileText, Image as ImageIcon, Sparkles, Wand2, CloudIcon } from "lucide-react";
import { GoogleDrivePicker } from "./google-drive-picker";

type ContentType = "note" | "link" | "image";

interface IdeaFormProps {
  onClose: () => void;
  onSuccess: () => void;
  projectId?: string;
}

export function IdeaForm({ onClose, onSuccess, projectId }: IdeaFormProps) {
  const [contentType, setContentType] = useState<ContentType>("note");
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  
  // Form states
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [showDrivePicker, setShowDrivePicker] = useState(false);

  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput("");
    }
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleAutoTag = async () => {
    const contentToAnalyze = contentType === "note" ? content : contentType === "link" ? url : title;
    if (!contentToAnalyze) return;

    setIsAnalyzing(true);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "auto_tag",
          data: { content: `Título: ${title}\nContenido: ${contentToAnalyze}` }
        })
      });
      const result = await res.json();
      if (result.success && Array.isArray(result.data)) {
        const newTags = result.data.filter((t: string) => !tags.includes(t));
        setTags([...tags, ...newTags]);
      }
    } catch (err) {
      console.error("Error auto-tagging:", err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAnalyzeContent = async () => {
    setIsAnalyzing(true);
    setAiSuggestion(null);
    
    try {
      const action = contentType === "note" ? "summarize_note" : "analyze_link";
      const contentToAnalyze = contentType === "note" 
        ? `Título: ${title}\nContenido: ${content}`
        : `URL: ${url}\nTítulo: ${title}`;

      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          data: { content: contentToAnalyze }
        })
      });
      const result = await res.json();
      
      if (result.success) {
        if (typeof result.data === "object") {
          // Apply suggested tags
          if (result.data.tags && Array.isArray(result.data.tags)) {
            const newTags = result.data.tags.filter((t: string) => !tags.includes(t));
            setTags([...tags, ...newTags]);
          }
          // Show summary
          const summary = result.data.summary || result.data.mainIdeas?.join("\n") || "";
          setAiSuggestion(summary);
        } else {
          setAiSuggestion(result.data);
        }
      }
    } catch (err) {
      console.error("Error analyzing content:", err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      if (contentType === "note") {
        const res = await fetch("/api/notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, content, category, tags, projectId })
        });
        if (!res.ok) throw new Error("Error al crear nota");
      } else if (contentType === "link") {
        const res = await fetch("/api/links", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, title, category, tags, projectId })
        });
        if (!res.ok) throw new Error("Error al guardar link");
      } else if (contentType === "image" && file) {
        // Get presigned URL
        const presignedRes = await fetch("/api/upload/presigned", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: file.name,
            contentType: file.type,
            isPublic: true
          })
        });
        const { uploadUrl, cloud_storage_path } = await presignedRes.json();

        // Upload to S3
        await fetch(uploadUrl, {
          method: "PUT",
          body: file,
          headers: { 
            "Content-Type": file.type,
            "Content-Disposition": "attachment"
          }
        });

        // Save to DB
        const res = await fetch("/api/images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            cloudStoragePath: cloud_storage_path,
            isPublic: true,
            category,
            tags,
            projectId
          })
        });
        if (!res.ok) throw new Error("Error al guardar imagen");
      }

      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-800">Agregar Contenido</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Type Tabs */}
        <div className="flex border-b border-slate-200">
          {[
            { type: "note", icon: FileText, label: "Nota" },
            { type: "link", icon: LinkIcon, label: "Link" },
            { type: "image", icon: ImageIcon, label: "Imagen" }
          ].map(({ type, icon: Icon, label }) => (
            <button
              key={type}
              onClick={() => { setContentType(type as ContentType); setAiSuggestion(null); }}
              className={`flex flex-1 items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
                contentType === type
                  ? "border-b-2 border-slate-800 text-slate-800"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          {/* AI Suggestion */}
          {aiSuggestion && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-4 w-4 text-amber-600" />
                <span className="text-sm font-medium text-amber-800">Análisis IA</span>
              </div>
              <p className="text-sm text-amber-700">{aiSuggestion}</p>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Título</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-4 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
              placeholder="Título del contenido"
              required
            />
          </div>

          {/* Content based on type */}
          {contentType === "note" && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-slate-700">Contenido</label>
                <button
                  type="button"
                  onClick={handleAnalyzeContent}
                  disabled={!content || isAnalyzing}
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 disabled:opacity-50"
                >
                  {isAnalyzing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                  Analizar con IA
                </button>
              </div>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-4 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
                placeholder="Escribe tu nota aquí..."
                rows={5}
                required
              />
            </div>
          )}

          {contentType === "link" && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-slate-700">URL</label>
                <button
                  type="button"
                  onClick={handleAnalyzeContent}
                  disabled={!url || isAnalyzing}
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 disabled:opacity-50"
                >
                  {isAnalyzing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                  Analizar con IA
                </button>
              </div>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-4 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
                placeholder="https://ejemplo.com"
                required
              />
            </div>
          )}

          {contentType === "image" && (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Imagen</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="w-full rounded-lg border border-slate-200 px-4 py-2 text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-slate-600 hover:file:bg-slate-200"
              />
              <div className="mt-3 flex items-center gap-2">
                <div className="flex-1 border-t border-slate-200" />
                <span className="text-xs text-slate-400">o importar desde</span>
                <div className="flex-1 border-t border-slate-200" />
              </div>
              <button
                type="button"
                onClick={() => setShowDrivePicker(true)}
                className="mt-3 w-full flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-200 px-4 py-3 text-sm text-slate-600 hover:border-slate-400 hover:bg-slate-50 transition-colors"
              >
                <CloudIcon className="h-5 w-5" />
                Google Drive
              </button>
            </div>
          )}

          {/* Category */}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Categoría</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-4 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
            >
              <option value="">Seleccionar categoría</option>
              <option value="marketing">Marketing</option>
              <option value="ventas">Ventas</option>
              <option value="producto">Producto</option>
              <option value="operaciones">Operaciones</option>
              <option value="finanzas">Finanzas</option>
              <option value="recursos">Recursos</option>
            </select>
          </div>

          {/* Tags */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-slate-700">Etiquetas</label>
              <button
                type="button"
                onClick={handleAutoTag}
                disabled={isAnalyzing || (!content && !url && !title)}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 disabled:opacity-50"
              >
                {isAnalyzing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                Auto-etiquetar
              </button>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), handleAddTag())}
                className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
                placeholder="Agregar etiqueta"
              />
              <button
                type="button"
                onClick={handleAddTag}
                className="rounded-lg bg-slate-100 px-3 py-2 text-slate-600 hover:bg-slate-200"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            {tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="text-slate-500 hover:text-slate-700"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:bg-slate-300"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                "Guardar"
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Google Drive Picker */}
      <GoogleDrivePicker
        isOpen={showDrivePicker}
        onClose={() => setShowDrivePicker(false)}
        projectId={projectId}
        onSelect={(files) => {
          // Files were imported successfully
          onSuccess();
          onClose();
        }}
      />
    </div>
  );
}
