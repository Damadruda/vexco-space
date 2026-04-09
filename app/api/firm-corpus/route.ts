// =============================================================================
// /api/firm-corpus — Firm Corpus singleton CRUD
// GET: returns corpus config + stats
// PATCH: update corpus config (driveFolderId, description)
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getCorpusStats, updateCorpusConfig } from "@/lib/services/firm-corpus";

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

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = await request.json();
    const { driveFolderId, driveFolderUrl, description } = body;

    const updated = await updateCorpusConfig({
      ...(driveFolderId !== undefined && { driveFolderId }),
      ...(driveFolderUrl !== undefined && { driveFolderUrl }),
      ...(description !== undefined && { description }),
    });

    return NextResponse.json(updated);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
