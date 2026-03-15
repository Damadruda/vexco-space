"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Header } from "@/components/ui/header";
import { Search, FolderKanban, FileText, Link as LinkIcon, Image as ImageIcon, Filter } from "lucide-react";
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
        return "bg-ql-accent/10 text-ql-accent";
      case "note":
        return "bg-ql-success/10 text-ql-success";
      case "link":
        return "bg-ql-warning/10 text-ql-warning";
      case "image":
        return "bg-ql-danger/10 text-ql-danger";
      default:
        return "bg-ql-cream text-ql-slate";
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
    <div className="ql-page">
      <Header title="Búsqueda" />

      <div className="p-6 space-y-6">
        {/* Search Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ql-muted" strokeWidth={1.5} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar en proyectos, notas, links e imágenes..."
              className="ql-input py-4 pl-12 text-base"
            />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-ql-muted" strokeWidth={1.5} />
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
                className={filter === value ? "ql-btn-primary text-xs py-1.5 px-3" : "ql-btn-ghost text-xs py-1.5 px-3"}
              >
                {label}
              </button>
            ))}
          </div>
        </form>

        {/* Results */}
        {loading ? (
          <div className="flex items-center gap-2 justify-center py-12">
            <span className="ql-status-thinking" />
            <span className="ql-loading">Buscando...</span>
          </div>
        ) : query && filteredResults.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Search className="mb-3 h-8 w-8 text-ql-muted" strokeWidth={1} />
            <p className="ql-body font-medium">No se encontraron resultados</p>
            <p className="ql-caption mt-1 normal-case tracking-normal italic">Intenta con otras palabras clave</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedResults).map(([type, items]) => (
              <div key={type}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-ql-muted">{getIcon(type)}</span>
                  <p className="ql-label">{getTypeLabel(type)}s ({items.length})</p>
                </div>
                <div className="grid gap-3">
                  {items.map((result) => (
                    <Link
                      key={result.id}
                      href={
                        result.type === "project"
                          ? `/project-builder/${result.id}`
                          : "/idea-vault"
                      }
                      className="ql-card group flex items-start gap-4"
                    >
                      {/* Image Preview */}
                      {result.type === "image" && result.imageUrl && (
                        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-ql-cream">
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
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${getTypeColor(result.type)}`}>
                          {getIcon(result.type)}
                        </div>
                      )}

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-ql-charcoal truncate group-hover:text-ql-accent transition-colors">
                            {result.title}
                          </p>
                          <span className={`ql-badge shrink-0 ${getTypeColor(result.type)}`}>
                            {getTypeLabel(result.type)}
                          </span>
                        </div>
                        {(result.description || result.content) && (
                          <p className="ql-body mt-1 line-clamp-1">
                            {result.description || result.content}
                          </p>
                        )}
                        {result.url && (
                          <p className="mt-1 text-xs text-ql-accent truncate">{result.url}</p>
                        )}
                        {result.tags?.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {result.tags.slice(0, 3).map((tag) => (
                              <span key={tag} className="ql-badge-default">{tag}</span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Date */}
                      <span className="ql-caption shrink-0 normal-case tracking-normal">
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
