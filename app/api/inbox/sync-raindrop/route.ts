import { NextRequest, NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { prisma } from "@/lib/db";
import { runRaindropSync } from "@/lib/background/raindrop-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const userId = await getDefaultUserId();

    const prefs = await prisma.userPreferences.findUnique({
      where: { userId },
    });

    if (!prefs?.raindropToken) {
      return NextResponse.json(
        { error: "Raindrop no configurado. Añade tu token en Preferencias." },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { collectionId } = body as { collectionId?: number };

    const { created, updated, skipped, analyzed, errors } = await runRaindropSync(
      userId,
      prefs.raindropToken,
      collectionId
    );

    return NextResponse.json({
      created,
      updated,
      skipped,
      analyzed,
      errors,
      total: created + updated + skipped,
      message: `${created} nuevo${created !== 1 ? "s" : ""} · ${updated} actualizado${updated !== 1 ? "s" : ""} · ${skipped} sin cambios`,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    if (error instanceof Error && error.message.includes("Token de Raindrop")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[SYNC-RAINDROP] Error:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
