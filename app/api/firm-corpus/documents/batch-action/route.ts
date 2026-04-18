// =============================================================================
// BATCH ACTION — Curación masiva de CorpusDocument
// Acciones soportadas: archive, unarchive, mark_reviewed, unmark_reviewed.
// `move_to_operational` NO vive aqui: la UI hara loop sobre
// /api/firm-corpus/[id]/move-to-operational, que ya tiene lógica específica.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";

const BatchActionSchema = z.object({
  action: z.enum([
    "archive",
    "unarchive",
    "mark_reviewed",
    "unmark_reviewed",
  ]),
  documentIds: z.array(z.string().min(1)).min(1).max(200),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = BatchActionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Payload invalido", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const { action, documentIds } = parsed.data;
    const now = new Date();
    const userEmail = session.user.email;

    let updated = 0;

    switch (action) {
      case "archive":
        updated = (
          await prisma.corpusDocument.updateMany({
            where: { id: { in: documentIds } },
            data: { archived: true },
          })
        ).count;
        break;

      case "unarchive":
        updated = (
          await prisma.corpusDocument.updateMany({
            where: { id: { in: documentIds } },
            data: { archived: false },
          })
        ).count;
        break;

      case "mark_reviewed":
        updated = (
          await prisma.corpusDocument.updateMany({
            where: { id: { in: documentIds } },
            data: { reviewedAt: now, reviewedBy: userEmail },
          })
        ).count;
        break;

      case "unmark_reviewed":
        updated = (
          await prisma.corpusDocument.updateMany({
            where: { id: { in: documentIds } },
            data: { reviewedAt: null, reviewedBy: null },
          })
        ).count;
        break;
    }

    return NextResponse.json({
      success: true,
      action,
      requested: documentIds.length,
      updated,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[corpus/batch-action] fatal:", msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
