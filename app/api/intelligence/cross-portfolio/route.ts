import { NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { analyzeCrossPortfolio } from "@/lib/engine/cross-portfolio";

export const maxDuration = 300;

export async function POST() {
  try {
    const userId = await getDefaultUserId();
    const result = await analyzeCrossPortfolio({ triggeredBy: userId });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[CROSS-PORTFOLIO RUN]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error interno" },
      { status: error instanceof Error && error.message === "No autenticado" ? 401 : 500 }
    );
  }
}
