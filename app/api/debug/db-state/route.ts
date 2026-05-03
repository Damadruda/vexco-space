// =============================================================================
// GET /api/_debug/db-state
// Diagnóstico runtime: lee DATABASE_URL del lambda y devuelve estado de la DB.
// Autenticado (NextAuth). READ-only. Sin side effects.
// Creado para cerrar incident del 03/05/2026 (DB borrada y restaurada vía PITR).
// =============================================================================

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface DbStateResponse {
  databaseHost: string;
  databaseName: string;
  counts: Record<string, number | string>;
  lastMigrations: Array<{
    name: string;
    finishedAt: string | null;
    rolledBackAt: string | null;
  }>;
  timestamp: string;
}

function sanitizeDatabaseUrl(url: string | undefined): { host: string; database: string } {
  if (!url) return { host: "(DATABASE_URL not set)", database: "(unknown)" };
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      database: parsed.pathname.replace(/^\//, "").split("?")[0] || "(unknown)",
    };
  } catch {
    return { host: "(unparseable)", database: "(unknown)" };
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { host: databaseHost, database: databaseName } = sanitizeDatabaseUrl(
      process.env.DATABASE_URL
    );

    // Counts de tablas críticas. Cada uno en try/catch para que un table missing
    // no rompa el endpoint completo.
    const counts: Record<string, number | string> = {};

    const tablesToCount = [
      "Project",
      "FirmInsight",
      "CorpusDocument",
      "Channel",
      "Prospect",
      "AgileTask",
      "MetaProject",
      "ChatMessage",
      "InboxItem",
      "User",
    ];

    for (const table of tablesToCount) {
      try {
        const result = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
          `SELECT COUNT(*)::bigint as count FROM "${table}"`
        );
        counts[table] = Number(result[0]?.count ?? 0);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        counts[table] = `ERROR: ${msg.slice(0, 100)}`;
      }
    }

    // Últimas 10 migraciones aplicadas
    let lastMigrations: DbStateResponse["lastMigrations"] = [];
    try {
      const migs = await prisma.$queryRawUnsafe<
        Array<{
          migration_name: string;
          finished_at: Date | null;
          rolled_back_at: Date | null;
        }>
      >(
        `SELECT migration_name, finished_at, rolled_back_at
         FROM _prisma_migrations
         ORDER BY started_at DESC
         LIMIT 10`
      );
      lastMigrations = migs.map((m) => ({
        name: m.migration_name,
        finishedAt: m.finished_at ? m.finished_at.toISOString() : null,
        rolledBackAt: m.rolled_back_at ? m.rolled_back_at.toISOString() : null,
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      lastMigrations = [
        { name: `ERROR: ${msg.slice(0, 100)}`, finishedAt: null, rolledBackAt: null },
      ];
    }

    const response: DbStateResponse = {
      databaseHost,
      databaseName,
      counts,
      lastMigrations,
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[DB_STATE_DEBUG]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
