"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Lightbulb,
  FolderKanban,
  Search,
  MessageSquare
} from "lucide-react";
import { cn } from "@/lib/utils";

const menuItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard", number: "01" },
  { href: "/idea-vault", icon: Lightbulb, label: "Idea Vault", number: "02" },
  { href: "/project-builder", icon: FolderKanban, label: "Project Builder", number: "03" },
  { href: "/search", icon: Search, label: "Búsqueda", number: "04" },
  { href: "/assistant", icon: MessageSquare, label: "Asistente IA", number: "05" }
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-gray-200 bg-white">
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="border-b border-gray-100 px-6 py-5">
          <div className="relative h-12 w-32">
            <Image
              src="/logo-vexco.jpg"
              alt="Vex&Co"
              fill
              className="object-contain"
              priority
            />
          </div>
          <p className="mt-3 text-xs tracking-[0.15em] uppercase text-gray-400">Lab · Project Management</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6">
          <p className="mb-4 px-3 text-xs tracking-[0.15em] uppercase text-gray-400">Navegación</p>
          <div className="space-y-1">
            {menuItems.map((item) => {
              const isActive = pathname?.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-all duration-150",
                    isActive
                      ? "bg-gray-900 text-white"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  )}
                >
                  <span className={cn(
                    "text-xs font-light",
                    isActive ? "text-gray-400" : "text-gray-300"
                  )}>
                    [{item.number}]
                  </span>
                  <item.icon className="h-4 w-4" />
                  <span className="font-medium">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Footer */}
        <div className="border-t border-gray-100 px-6 py-4">
          <p className="text-xs text-gray-400">
            © 2026 Vex&Co Lab
          </p>
        </div>
      </div>
    </aside>
  );
}