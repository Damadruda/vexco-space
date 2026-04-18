// =============================================================================
// REPROCESS-JOB/STATUS — Query progress of the most recent reprocess job
// =============================================================================

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const EXCLUDED_MIME_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "application/vnd.ms-excel",
];

export async function GET() {
  const job = await prisma.corpusReprocessJob.findFirst({
    orderBy: { createdAt: "desc" },
  });

  if (!job) {
    return NextResponse.json({ message: "No hay jobs registrados" });
  }

  // Count total narrative docs for percentage
  const totalDocs = await prisma.corpusDocument.count({
    where: {
      mimeType: { notIn: EXCLUDED_MIME_TYPES },
      rawContent: { not: null },
    },
  });

  const docsProcessed = job.totalProcessed + job.totalFailed;
  const percentage =
    totalDocs > 0 ? Math.round((docsProcessed / totalDocs) * 100) : 0;

  const estimatedRemainingMinutes =
    job.status === "RUNNING"
      ? Math.ceil((totalDocs - docsProcessed) / 5) * 2
      : null;

  return NextResponse.json({
    job: {
      id: job.id,
      status: job.status,
      totalProcessed: job.totalProcessed,
      totalFailed: job.totalFailed,
      totalBatches: job.totalBatches,
      errors: job.errors,
      startedAt: job.startedAt,
      lastTickAt: job.lastTickAt,
      completedAt: job.completedAt,
    },
    totalDocs,
    percentage,
    estimatedRemainingMinutes,
  });
}
