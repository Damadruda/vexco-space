"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Header } from "@/components/ui/header";
import { Search, FolderKanban, FileText, Link as LinkIcon, Image as ImageIcon, Loader2, Filter } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

type ResultType = "all" | "projects" | "notes" | "links" | "images";

interface SearchResult {
  id: string;
  type: string;
  title: string;
  description?: string;
  content?: string;
  url?: string;
  imageUrl?: string;
  category?: string;
  tags: string[];
  createdAt: string;
}

export default function SearchPage() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams?.get("q") || "";
  
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<ResultType>("all");

  useEffect(() => {
    if (initialQuery) {
      handleSearch(initialQuery);
    }
  }, [initialQuery]);

  const handleSearch = async (searchQuery: string) => {
    if (!searchQuery?.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      const typeParam = filter !== "all" ? `&type=${filter}` : "";
      const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}${typeParam}`);
      const data = await res.json();
      setResults(data?.results ?? []);
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch(query);
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "project":
        return <FolderKanban className="h-4 w-4" />;
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

  const getTypeColor = (type: string) => {
    switch (type) {
      case "project":
        return "bg-blue-100 text-blue-700";
      case "note":
        return "bg-green-100 text-green-700";
      case "link":
        return "bg-purple-100 text-purple-700";
      case "image":
        return "bg-amber-100 text-amber-700";
      default:
        return "bg-slate-100 text-slate-700";
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "project":
        return "Proyecto";
      case "note":
        return "Nota";
      case "link":
        return "Link";
      case "image":
        return "Imagen";
      default:
        return type;
    }
  };

  const filteredResults = results.filter((r) => {
    if (filter === "all") return true;
    return r.type + "s" === filter;
  });

  // Group results by type
  const groupedResults = filteredResults.reduce((acc, result) => {
    const type = result.type;
    if (!acc[type]) acc[type] = [];
    acc[type].push(result);
    return acc;
  }, {} as Record<string, SearchResult[]>);

  return (
    <div className="min-h-screen">
      <Header title="Búsqueda" />

      <div className="p-6 space-y-6">
        {/* Search Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar en proyectos, notas, links e imágenes..."
              className="w-full rounded-xl border border-slate-200 bg-white py-4 pl-12 pr-4 text-lg placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-slate-500" />
            {[
              { value: "all", label: "Todo" },
              { value: "projects", label: "Proyectos" },
              { value: "notes", label: "Notas" },
              { value: "links", label: "Links" },
              { value: "images", label: "Imágenes" }
            ].map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setFilter(value as ResultType);
                  if (query) handleSearch(query);
                }}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  filter === value
                    ? "bg-blue-100 text-blue-700"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </form>

        {/* Results */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        ) : query && filteredResults.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Search className="mb-3 h-12 w-12 text-slate-300" />
            <p className="text-lg font-medium text-slate-600">No se encontraron resultados</p>
            <p className="text-slate-500">Intenta con otras palabras clave</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedResults).map(([type, items]) => (
              <div key={type}>
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
                  {getIcon(type)}
                  {getTypeLabel(type)}s ({items.length})
                </h3>
                <div className="grid gap-3">
                  {items.map((result) => (
                    <Link
                      key={result.id}
                      href={
                        result.type === "project"
                          ? `/project-builder/${result.id}`
                          : "/idea-vault"
                      }
                      className="group flex items-start gap-4 rounded-xl bg-white p-4 shadow-sm border border-slate-200 transition-all hover:shadow-md hover:border-blue-200"
                    >
                      {/* Image Preview */}
                      {result.type === "image" && result.imageUrl && (
                        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                          <Image
                            src={result.imageUrl}
                            alt={result.title || "Image"}
                            fill
                            className="object-cover"
                            sizes="64px"
                          />
                        </div>
                      )}

                      {/* Icon for non-images */}
                      {result.type !== "image" && (
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${getTypeColor(result.type)}`}>
                          {getIcon(result.type)}
                        </div>
                      )}

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-slate-800 truncate group-hover:text-blue-600">
                            {result.title}
                          </h4>
                          <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${getTypeColor(result.type)}`}>
                            {getTypeLabel(result.type)}
                          </span>
                        </div>
                        {(result.description || result.content) && (
                          <p className="mt-1 text-sm text-slate-500 line-clamp-1">
                            {result.description || result.content}
                          </p>
                        )}
                        {result.url && (
                          <p className="mt-1 text-sm text-blue-500 truncate">{result.url}</p>
                        )}
                        {result.tags?.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {result.tags.slice(0, 3).map((tag) => (
                              <span
                                key={tag}
                                className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Date */}
                      <span className="shrink-0 text-xs text-slate-400">
                        {new Date(result.createdAt).toLocaleDateString("es-ES")}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}