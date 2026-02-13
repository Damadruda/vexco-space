"use client";

import { useState, useEffect } from "react";
import { Link as LinkIcon, FileText, Image as ImageIcon, ExternalLink, Star, Trash2, Loader2, Search, Filter, Sparkles, X } from "lucide-react";
import Image from "next/image";

type ContentType = "all" | "notes" | "links" | "images";

interface ContentItem {
  id: string;
  type: "note" | "link" | "image";
  title: string;
  content?: string;
  url?: string;
  imageUrl?: string;
  category?: string;
  tags: string[];
  isFavorite: boolean;
  createdAt: string;
}

interface AIAnalysis {
  item: ContentItem;
  analysis: string;
  loading: boolean;
}

export function ContentGallery({ projectId }: { projectId?: string }) {
  const [content, setContent] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ContentType>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);

  useEffect(() => {
    fetchContent();
  }, [projectId]);

  const fetchContent = async () => {
    try {
      const params = projectId ? `?projectId=${projectId}` : "";
      const [notesRes, linksRes, imagesRes] = await Promise.all([
        fetch(`/api/notes${params}`),
        fetch(`/api/links${params}`),
        fetch(`/api/images${params}`)
      ]);

      const notes = await notesRes.json();
      const links = await linksRes.json();
      const images = await imagesRes.json();

      const combined: ContentItem[] = [
        ...(notes?.items ?? []).map((n: any) => ({ ...n, type: "note" as const })),
        ...(links?.items ?? []).map((l: any) => ({ ...l, type: "link" as const })),
        ...(images?.items ?? []).map((i: any) => ({ ...i, type: "image" as const }))
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      setContent(combined);
    } catch (error) {
      console.error("Error fetching content:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleFavorite = async (item: ContentItem) => {
    const endpoint = `/api/${item.type}s/${item.id}`;
    try {
      await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFavorite: !item.isFavorite })
      });
      setContent((prev) =>
        prev.map((c) =>
          c.id === item.id ? { ...c, isFavorite: !c.isFavorite } : c
        )
      );
    } catch (error) {
      console.error("Error toggling favorite:", error);
    }
  };

  const deleteItem = async (item: ContentItem) => {
    if (!confirm("¿Estás seguro de eliminar este elemento?")) return;
    const endpoint = `/api/${item.type}s/${item.id}`;
    try {
      await fetch(endpoint, { method: "DELETE" });
      setContent((prev) => prev.filter((c) => c.id !== item.id));
    } catch (error) {
      console.error("Error deleting item:", error);
    }
  };

  const analyzeWithAI = async (item: ContentItem) => {
    setAiAnalysis({ item, analysis: "", loading: true });
    
    try {
      const action = item.type === "note" ? "summarize_note" : "analyze_link";
      const contentToAnalyze = item.type === "note"
        ? `Título: ${item.title}\nContenido: ${item.content}`
        : `URL: ${item.url}\nTítulo: ${item.title}`;

      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          data: { content: contentToAnalyze }
        })
      });
      
      const result = await res.json();
      let analysisText = "";
      
      if (result.success) {
        if (typeof result.data === "object") {
          const parts = [];
          if (result.data.summary) parts.push(`**Resumen:** ${result.data.summary}`);
          if (result.data.keyPoints) parts.push(`**Puntos clave:** ${result.data.keyPoints.join(", ")}`);
          if (result.data.mainIdeas) parts.push(`**Ideas principales:** ${result.data.mainIdeas.join(", ")}`);
          if (result.data.relevance) parts.push(`**Relevancia:** ${result.data.relevance}`);
          if (result.data.suggestedActions) parts.push(`**Acciones sugeridas:** ${result.data.suggestedActions.join(", ")}`);
          analysisText = parts.join("\n\n");
        } else {
          analysisText = result.data;
        }
      }
      
      setAiAnalysis({ item, analysis: analysisText || "No se pudo generar el análisis.", loading: false });
    } catch (error) {
      console.error("Error analyzing with AI:", error);
      setAiAnalysis({ item, analysis: "Error al analizar el contenido.", loading: false });
    }
  };

  const filteredContent = content.filter((item) => {
    if (filter !== "all" && item.type + "s" !== filter) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        item.title?.toLowerCase().includes(query) ||
        item.content?.toLowerCase().includes(query) ||
        item.tags?.some((t) => t.toLowerCase().includes(query))
      );
    }
    return true;
  });

  const getIcon = (type: string) => {
    switch (type) {
      case "note":
        return <FileText className="h-4 w-4" />;
      case "link":
        return <LinkIcon className="h-4 w-4" />;
      case "image":
        return <ImageIcon className="h-4 w-4" />;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* AI Analysis Modal */}
      {aiAnalysis && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-amber-500" />
                <h3 className="font-semibold text-slate-800">Análisis IA</h3>
              </div>
              <button onClick={() => setAiAnalysis(null)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6">
              <div className="mb-4">
                <span className="text-sm text-slate-500">Analizando:</span>
                <h4 className="font-medium text-slate-800">{aiAnalysis.item.title}</h4>
              </div>
              {aiAnalysis.loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
                </div>
              ) : (
                <div className="rounded-lg bg-slate-50 p-4">
                  <div className="prose prose-sm max-w-none text-slate-700 whitespace-pre-wrap">
                    {aiAnalysis.analysis}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar contenido..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
          />
        </div>
        <div className="flex rounded-lg border border-slate-200 bg-white p-1">
          {[
            { value: "all", label: "Todo" },
            { value: "notes", label: "Notas" },
            { value: "links", label: "Links" },
            { value: "images", label: "Imágenes" }
          ].map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setFilter(value as ContentType)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                filter === value
                  ? "bg-slate-800 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content Grid */}
      {filteredContent.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 py-12">
          <Filter className="mb-3 h-12 w-12 text-slate-300" />
          <p className="text-slate-500">No hay contenido que mostrar</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredContent.map((item) => (
            <div
              key={item.id}
              className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-all hover:shadow-md"
            >
              {/* Image Preview */}
              {item.type === "image" && item.imageUrl && (
                <div className="relative aspect-video bg-slate-100">
                  <Image
                    src={item.imageUrl}
                    alt={item.title || "Image"}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, 33vw"
                  />
                </div>
              )}

              <div className="p-4">
                {/* Type Badge */}
                <div className="mb-2 flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${
                    item.type === "note"
                      ? "bg-green-100 text-green-700"
                      : item.type === "link"
                      ? "bg-blue-100 text-blue-700"
                      : "bg-purple-100 text-purple-700"
                  }`}>
                    {getIcon(item.type)}
                    {item.type === "note" ? "Nota" : item.type === "link" ? "Link" : "Imagen"}
                  </span>
                  {item.category && (
                    <span className="text-xs text-slate-500">{item.category}</span>
                  )}
                </div>

                {/* Title */}
                <h3 className="font-semibold text-slate-800 line-clamp-1">{item.title}</h3>

                {/* Content Preview */}
                {item.type === "note" && item.content && (
                  <p className="mt-1 text-sm text-slate-500 line-clamp-2">{item.content}</p>
                )}

                {item.type === "link" && item.url && (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 flex items-center gap-1 text-sm text-blue-600 hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {new URL(item.url).hostname}
                  </a>
                )}

                {/* Tags */}
                {item.tags?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {item.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                  <span className="text-xs text-slate-400">
                    {new Date(item.createdAt).toLocaleDateString("es-ES")}
                  </span>
                  <div className="flex gap-1">
                    {item.type !== "image" && (
                      <button
                        onClick={() => analyzeWithAI(item)}
                        className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-amber-50 hover:text-amber-600"
                        title="Analizar con IA"
                      >
                        <Sparkles className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      onClick={() => toggleFavorite(item)}
                      className={`rounded-lg p-1.5 transition-colors ${
                        item.isFavorite
                          ? "text-yellow-500 hover:bg-yellow-50"
                          : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                      }`}
                    >
                      <Star className={`h-4 w-4 ${item.isFavorite ? "fill-current" : ""}`} />
                    </button>
                    <button
                      onClick={() => deleteItem(item)}
                      className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
