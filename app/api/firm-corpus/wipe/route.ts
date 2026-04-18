// =============================================================================
// WIPE — Limpieza completa del corpus para curación humana
// Archive todos los CorpusDocument + delete Framework y tablas relacionadas.
// Operación reversible en parte (docs son archived:true, no deletedAt).
// =============================================================================

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    // Transaction: wipe en un solo commit para evitar estados intermedios
    const result = await prisma.$transaction(async (tx) => {
      // 1. Archive todos los CorpusDocument activos (no tocar los ya archivados)
      const docsArchived = await tx.corpusDocument.updateMany({
        where: { archived: false },
        data: { archived: true },
      });

      // 2. Delete FrameworkSourceDocument (pivot) — onDelete cascade deberia
      //    cubrirlo al borrar Framework, pero explicito por seguridad
      const pivotsDeleted = await tx.frameworkSourceDocument.deleteMany({});

      // 3. Delete FrameworkProject (pivot con Project)
      const projectPivotsDeleted = await tx.frameworkProject.deleteMany({});

      // 4. Delete FrameworkUpdate (registros de discovery)
      const updatesDeleted = await tx.frameworkUpdate.deleteMany({});

      // 5. Delete Framework (todos, activos y deprecated)
      const frameworksDeleted = await tx.framework.deleteMany({});

      // 6. Mark cualquier reprocess job en curso como CANCELLED
      const jobsCancelled = await tx.corpusReprocessJob.updateMany({
        where: { status: { in: ["PENDING", "RUNNING"] } },
        data: {
          status: "CANCELLED",
          completedAt: new Date(),
        },
      });

      return {
        docsArchived: docsArchived.count,
        pivotsDeleted: pivotsDeleted.count,
        projectPivotsDeleted: projectPivotsDeleted.count,
        updatesDeleted: updatesDeleted.count,
        frameworksDeleted: frameworksDeleted.count,
        jobsCancelled: jobsCancelled.count,
      };
    });

    return NextResponse.json({
      success: true,
      message: "Wipe completado. Corpus archivado, frameworks eliminados.",
      ...result,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[corpus/wipe] fatal:", msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
