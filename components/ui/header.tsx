"use client";

import { Search } from "lucide-react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [currentDate, setCurrentDate] = useState("");
  const router = useRouter();

  useEffect(() => {
    setCurrentDate(new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" }));
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery?.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/95 backdrop-blur-sm">
      <div className="flex h-20 items-center justify-between px-8">
        <div>
          {subtitle && (
            <p className="mb-1 text-xs tracking-[0.15em] uppercase text-gray-400">{subtitle}</p>
          )}
          <h2 className="font-serif text-2xl font-normal text-gray-900">{title}</h2>
        </div>

        <div className="flex items-center gap-6">
          {/* Search Bar */}
          <form onSubmit={handleSearch} className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar en todo..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-72 rounded-md border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-4 text-sm placeholder:text-gray-400 transition-all focus:border-gray-300 focus:bg-white focus:outline-none"
            />
          </form>

          {/* Date Display */}
          <div className="hidden text-right md:block">
            <p className="text-xs tracking-[0.1em] uppercase text-gray-400">Hoy</p>
            <p className="text-sm font-medium text-gray-700">
              {currentDate || "—"}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}