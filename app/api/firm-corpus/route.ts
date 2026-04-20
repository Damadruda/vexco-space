// =============================================================================
// /api/firm-corpus — Firm Corpus singleton stats
// GET: returns corpus stats
// PATCH eliminado (CORPUS-3): ya no hay driveFolderId/Url editable.
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
    return NextResponse.json(stats);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
