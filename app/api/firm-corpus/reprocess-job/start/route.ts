// =============================================================================
// REPROCESS-JOB/START — Initiate background corpus reprocessing
// Soft migration + create job record for cron to pick up
// =============================================================================

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST() {
  try {
    // Verify no active job exists
    const existing = await prisma.corpusReprocessJob.findFirst({
      where: { status: { in: ["PENDING", "RUNNING"] } },
    });

    if (existing) {
      return NextResponse.json(
        {
          success: false,
          error: "Ya hay un job activo",
          jobId: existing.id,
          status: existing.status,
        },
        { status: 409 }
      );
    }

    // Soft migration: mark all ACTIVE frameworks as DEPRECATED
    const deprecated = await prisma.framework.updateMany({
      where: { status: "ACTIVE" },
      data: { status: "DEPRECATED" },
    });

    // Create job — cron will pick it up on next tick (≤2 min)
    const job = await prisma.corpusReprocessJob.create({
      data: {
        status: "PENDING",
        cursor: null,
        totalProcessed: 0,
        totalFailed: 0,
        totalBatches: 0,
      },
    });

    return NextResponse.json({
      success: true,
      jobId: job.id,
      message: `Job creado. ${deprecated.count} frameworks marcados DEPRECATED. El cron procesara el primer batch en ≤2 min.`,
      deprecatedCount: deprecated.count,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    );
  }
}
