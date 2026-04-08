import { NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const userId = await getDefaultUserId();
    const prospects = await prisma.prospect.findMany({
      where: { ownerId: userId },
      include: {
        fits: {
          include: { project: { select: { id: true, title: true } } },
          orderBy: { fitScore: "desc" },
        },
        channel: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json({ prospects });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getDefaultUserId();
    const body = await request.json();
    const { name, company, source, stage, estimatedDealValue, currency, notes, channelId } = body;

    if (!name) {
      return NextResponse.json({ error: "name es requerido" }, { status: 400 });
    }

    const prospect = await prisma.prospect.create({
      data: {
        name,
        company: company || null,
        source: source || null,
        stage: stage || "discovery",
        estimatedDealValue: estimatedDealValue ? parseFloat(estimatedDealValue) : null,
        currency: currency || "EUR",
        notes: notes || null,
        channelId: channelId || null,
        ownerId: userId,
      },
    });
    return NextResponse.json({ prospect }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    );
  }
}
