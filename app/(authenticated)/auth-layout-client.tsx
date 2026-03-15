"use client";

import { SessionProvider } from "next-auth/react";
import { Sidebar } from "@/components/ui/sidebar";

export function AuthLayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <div className="min-h-screen bg-ql-offwhite">
        <Sidebar />
        <main className="ml-60">{children}</main>
      </div>
    </SessionProvider>
  );
}