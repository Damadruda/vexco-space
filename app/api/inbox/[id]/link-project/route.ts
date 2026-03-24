import { NextRequest, NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await getDefaultUserId();
    const body = await request.json();
    const { projectId } = body as { projectId: string | null };

    const item = await prisma.inboxItem.update({
      where: { id: params.id },
      data: { projectId: projectId || null },
      include: { analysis: true },
    });

    return NextResponse.json({ item });
  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[INBOX/LINK] Error:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
