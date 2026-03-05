"use client";

import { Sidebar } from "@/components/ui/sidebar";

export function AuthLayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar />
      <main className="ml-64">{children}</main>
    </div>
  );
}