// =============================================================================
// REPROCESS-JOB/CANCEL — Abort a running or pending reprocess job
// =============================================================================

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const job = await prisma.corpusReprocessJob.findFirst({
    where: { status: { in: ["PENDING", "RUNNING"] } },
  });

  if (!job) {
    return NextResponse.json({ message: "No hay job activo para cancelar" });
  }

  await prisma.corpusReprocessJob.update({
    where: { id: job.id },
    data: { status: "CANCELLED", completedAt: new Date() },
  });

  return NextResponse.json({
    success: true,
    jobId: job.id,
    message: "Job cancelado. Usa /rollback-frameworks si necesitas revertir.",
  });
}
