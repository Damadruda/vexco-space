"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Lightbulb,
  FolderKanban,
  Search,
  MessageSquare,
  Swords,
  Inbox,
  BookOpen,
  Settings,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const WORKSPACE = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/idea-vault", icon: Lightbulb, label: "Idea Vault" },
  { href: "/project-builder", icon: FolderKanban, label: "Projects" },
  { href: "/war-room", icon: Swords, label: "War Room" },
];

const TOOLS = [
  { href: "/inbox", icon: Inbox, label: "Inbox" },
  { href: "/knowledge", icon: BookOpen, label: "Knowledge Base" },
  { href: "/search", icon: Search, label: "Búsqueda" },
  { href: "/assistant", icon: MessageSquare, label: "Asistente IA" },
];

const CONFIG = [
  { href: "/preferences", icon: Settings, label: "Preferencias" },
];

function NavSection({
  label,
  items,
  pathname,
  onLinkClick,
}: {
  label: string;
  items: { href: string; icon: React.ElementType; label: string }[];
  pathname: string | null;
  onLinkClick?: () => void;
}) {
  return (
    <div className="mb-6">
      <p className="ql-label px-4 mb-3">{label}</p>
      <div className="space-y-0.5">
        {items.map((item) => {
          const isActive = pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onLinkClick}
              className={cn(
                "group flex items-center gap-3 px-4 py-2.5 text-sm transition-all duration-150 relative",
                isActive
                  ? "text-ql-charcoal font-medium border-l-2 border-ql-accent pl-[14px]"
                  : "text-ql-slate font-light hover:text-ql-charcoal"
              )}
            >
              <item.icon
                className={cn(
                  "h-4 w-4 shrink-0 transition-colors",
                  isActive
                    ? "text-ql-accent"
                    : "text-ql-muted group-hover:text-ql-slate"
                )}
                strokeWidth={isActive ? 2 : 1.5}
              />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function SidebarContent({
  pathname,
  onLinkClick,
}: {
  pathname: string | null;
  onLinkClick?: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="px-4 py-6 border-b border-ql-sand/20">
        <p
          className="text-lg font-semibold text-ql-charcoal tracking-tight"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          Vex&Co Lab
        </p>
        <p className="ql-label mt-1">strategic pm lab</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-0 py-6">
        <NavSection
          label="workspace"
          items={WORKSPACE}
          pathname={pathname}
          onLinkClick={onLinkClick}
        />
        <NavSection
          label="herramientas"
          items={TOOLS}
          pathname={pathname}
          onLinkClick={onLinkClick}
        />
        <NavSection
          label="configuración"
          items={CONFIG}
          pathname={pathname}
          onLinkClick={onLinkClick}
        />
      </nav>

      {/* Footer */}
      <div className="border-t border-ql-sand/20 px-4 py-4">
        <p className="ql-caption">© 2026 Vex&Co</p>
      </div>
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Hamburger button — mobile only */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-4 left-4 z-50 flex h-9 w-9 items-center justify-center rounded-md bg-white border border-ql-sand/20 text-ql-charcoal shadow-sm md:hidden"
        aria-label="Abrir menú"
      >
        <Menu className="h-4 w-4" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-ql-charcoal/40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar — always visible on md+, drawer on mobile */}
      <aside
        className={`fixed left-0 top-0 z-50 h-screen w-60 bg-white border-r border-ql-sand/20 transition-transform duration-300 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0`}
      >
        {/* Close button — mobile only */}
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute right-3 top-4 flex h-7 w-7 items-center justify-center rounded-md text-ql-muted hover:text-ql-slate md:hidden"
          aria-label="Cerrar menú"
        >
          <X className="h-4 w-4" />
        </button>

        <SidebarContent
          pathname={pathname}
          onLinkClick={() => setMobileOpen(false)}
        />
      </aside>
    </>
  );
}
