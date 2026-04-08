import { NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    await getDefaultUserId();
    const latest = await prisma.crossPortfolioAnalysis.findFirst({
      where: { status: "completed" },
      orderBy: { createdAt: "desc" },
    });
    if (!latest) {
      return NextResponse.json({ analysis: null });
    }
    return NextResponse.json({ analysis: latest });
  } catch (error) {
    console.error("[CROSS-PORTFOLIO LATEST]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    );
  }
}
