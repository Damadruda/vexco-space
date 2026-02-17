"use client";

import { Search, LogOut, User } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

export function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  const { data: session } = useSession();
  const [searchQuery, setSearchQuery] = useState("");
  const [currentDate, setCurrentDate] = useState("");
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    setCurrentDate(new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" }));
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery?.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const handleSignOut = () => {
    signOut({ callbackUrl: "/login" });
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

          {/* User Menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 rounded-full bg-gray-100 p-2 hover:bg-gray-200 transition-colors"
            >
              {session?.user?.image ? (
                <img 
                  src={session.user.image} 
                  alt="Avatar" 
                  className="h-8 w-8 rounded-full"
                />
              ) : (
                <User className="h-5 w-5 text-gray-600" />
              )}
            </button>

            {showUserMenu && (
              <div className="absolute right-0 top-full mt-2 w-64 rounded-lg border border-gray-200 bg-white py-2 shadow-lg">
                <div className="px-4 py-2 border-b border-gray-100">
                  <p className="text-sm font-medium text-gray-900">{session?.user?.name}</p>
                  <p className="text-xs text-gray-500">{session?.user?.email}</p>
                </div>
                <button
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  Cerrar sesión
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
