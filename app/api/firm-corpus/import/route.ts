// =============================================================================
// /api/firm-corpus/import — Trigger corpus import from Google Drive
// POST: { driveFolderId, mode: "full" | "incremental" }
// maxDuration: 800s (Fluid Compute ceiling for large folders)
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { importCorpusFromDrive } from "@/lib/services/corpus-importer";
import { getFirmCorpus } from "@/lib/services/firm-corpus";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { error: "No autenticado", needsGoogleAuth: true },
        { status: 401 }
      );
    }

    const accessToken = (session.user as Record<string, unknown>).accessToken as string;
    if (!accessToken) {
      return NextResponse.json(
        { error: "Conecta tu cuenta de Google para acceder a Drive", needsGoogleAuth: true },
        { status: 401 }
      );
    }

    const body = await request.json();
    let { driveFolderId, mode } = body as {
      driveFolderId?: string;
      mode?: "full" | "incremental";
    };

    // If no folderId provided, try to get from corpus config
    if (!driveFolderId) {
      const corpus = await getFirmCorpus();
      driveFolderId = corpus.driveFolderId || undefined;
    }

    if (!driveFolderId) {
      return NextResponse.json(
        { error: "No se ha vinculado una carpeta de Drive. Configura el Drive folder primero." },
        { status: 400 }
      );
    }

    // Check if already running
    const corpus = await getFirmCorpus();
    if (corpus.syncStatus === "running") {
      return NextResponse.json(
        { error: "Ya hay un import en curso. Espera a que termine.", syncStatus: "running" },
        { status: 409 }
      );
    }

    const result = await importCorpusFromDrive(
      driveFolderId,
      accessToken,
      mode || "incremental"
    );

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[corpus-import] API error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
