// =============================================================================
// /api/firm-corpus/status — Polling endpoint for import progress
// GET: returns current sync status and progress
// =============================================================================

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getCorpusStats } from "@/lib/services/firm-corpus";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const stats = await getCorpusStats();
    return NextResponse.json({
      syncStatus: stats.syncStatus,
      syncProgress: stats.syncProgress,
      lastSyncedAt: stats.lastSyncedAt,
      total: stats.total,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
