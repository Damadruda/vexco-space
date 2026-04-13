// =============================================================================
// ROLLBACK FRAMEWORKS — Safety net: revert to pre-reprocess state
// Marks new ACTIVE as DEPRECATED, re-activates the 22 originals (oldest by createdAt)
// =============================================================================

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST() {
  try {
    // Step 1: Mark the newly ACTIVE frameworks as DEPRECATED
    const newDeprecated = await prisma.framework.updateMany({
      where: { status: "ACTIVE" },
      data: { status: "DEPRECATED" },
    });

    // Step 2: Re-activate the original frameworks (oldest by createdAt)
    const originals = await prisma.framework.findMany({
      where: { status: "DEPRECATED" },
      orderBy: { createdAt: "asc" },
      take: 22, // the 22 originals pre-hotfix
      select: { id: true },
    });

    const reactivated = await prisma.framework.updateMany({
      where: { id: { in: originals.map((f) => f.id) } },
      data: { status: "ACTIVE" },
    });

    return NextResponse.json({
      success: true,
      message: "Rollback completado",
      newDeprecated: newDeprecated.count,
      reactivated: reactivated.count,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    );
  }
}
