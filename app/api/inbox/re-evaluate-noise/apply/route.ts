import { NextRequest, NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// POST: Apply confirmed re-classifications in batch
export async function POST(request: NextRequest) {
  try {
    const userId = await getDefaultUserId();
    const { projectId, items } = (await request.json()) as {
      projectId: string;
      items: Array<{
        itemId: string;
        newCategory: string;
        linkToProject: boolean;
      }>;
    };

    if (!projectId || !items?.length) {
      return NextResponse.json(
        { error: "projectId and items are required" },
        { status: 400 }
      );
    }

    let applied = 0;

    for (const item of items) {
      // Verify ownership
      const inboxItem = await prisma.inboxItem.findFirst({
        where: { id: item.itemId, userId },
        include: { analysis: true },
      });

      if (!inboxItem || !inboxItem.analysis) continue;

      // Update analysis category
      await prisma.analysisResult.update({
        where: { id: inboxItem.analysis.id },
        data: { category: item.newCategory },
      });

      // Link to project if requested
      if (item.linkToProject) {
        await prisma.inboxItem.update({
          where: { id: item.itemId },
          data: { projectId },
        });
      }

      applied++;
    }

    return NextResponse.json({ applied });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[RE-EVALUATE APPLY]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
