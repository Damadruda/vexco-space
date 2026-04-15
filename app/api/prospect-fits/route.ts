import { NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { prisma } from "@/lib/db";

// =============================================================================
// PROSPECT FITS — Manual creation of Prospect <-> Project links
//
// El motor de cross-portfolio analysis crea fits automaticamente con score
// inferencial. Este endpoint cubre el caso opuesto: vinculacion manual cuando
// Diego sabe que un proyecto pertenece a un prospect especifico (ej. proyectos
// importados desde Drive donde el prospect ya existe en el CRM).
// =============================================================================

interface CreateBody {
  prospectId: string;
  projectId: string;
  fitScore?: number;       // default 100 (manual = match cierto)
  rationale?: string;      // default generico
  isPrimary?: boolean;     // default true
}

export async function POST(request: Request) {
  try {
    const userId = await getDefaultUserId();
    const body = (await request.json()) as Partial<CreateBody>;

    if (!body.prospectId || !body.projectId) {
      return NextResponse.json(
        { error: "prospectId y projectId son requeridos" },
        { status: 400 }
      );
    }

    // Verificar ownership del Prospect
    const prospect = await prisma.prospect.findFirst({
      where: { id: body.prospectId, ownerId: userId },
      select: { id: true, name: true },
    });
    if (!prospect) {
      return NextResponse.json(
        { error: "Prospect no encontrado o no autorizado" },
        { status: 404 }
      );
    }

    // Verificar ownership del Project
    const project = await prisma.project.findFirst({
      where: { id: body.projectId, userId },
      select: { id: true, title: true },
    });
    if (!project) {
      return NextResponse.json(
        { error: "Project no encontrado o no autorizado" },
        { status: 404 }
      );
    }

    // Si se marca isPrimary, desmarcar cualquier otro primary del mismo prospect
    const isPrimary = body.isPrimary ?? true;
    if (isPrimary) {
      await prisma.prospectFit.updateMany({
        where: { prospectId: body.prospectId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    // Upsert por @@unique([prospectId, projectId])
    const fit = await prisma.prospectFit.upsert({
      where: {
        prospectId_projectId: {
          prospectId: body.prospectId,
          projectId: body.projectId,
        },
      },
      update: {
        fitScore: body.fitScore ?? 100,
        rationale: body.rationale ?? `Vinculacion manual: ${prospect.name} <-> ${project.title}`,
        isPrimary,
      },
      create: {
        prospectId: body.prospectId,
        projectId: body.projectId,
        fitScore: body.fitScore ?? 100,
        rationale: body.rationale ?? `Vinculacion manual: ${prospect.name} <-> ${project.title}`,
        isPrimary,
      },
    });

    return NextResponse.json({ success: true, fit });
  } catch (error) {
    console.error("[prospect-fits POST]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const userId = await getDefaultUserId();
    const { searchParams } = new URL(request.url);
    const fitId = searchParams.get("id");

    if (!fitId) {
      return NextResponse.json({ error: "id requerido" }, { status: 400 });
    }

    // Verificar que el fit pertenece a un prospect del usuario
    const fit = await prisma.prospectFit.findFirst({
      where: {
        id: fitId,
        prospect: { ownerId: userId },
      },
    });

    if (!fit) {
      return NextResponse.json(
        { error: "Fit no encontrado o no autorizado" },
        { status: 404 }
      );
    }

    await prisma.prospectFit.delete({ where: { id: fitId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[prospect-fits DELETE]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    );
  }
}
