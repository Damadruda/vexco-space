import { NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { prisma } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await getDefaultUserId();
    const { id } = await params;
    const analysis = await prisma.crossPortfolioAnalysis.findUnique({
      where: { id },
    });
    if (!analysis) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    return NextResponse.json({ analysis });
  } catch (error) {
    console.error("[CROSS-PORTFOLIO GET]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    );
  }
}
