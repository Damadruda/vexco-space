import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// DELETE: Unlink Drive doc summaries from a project
// - Without body: deletes ALL drive docs of the project
// - With body { docIds: string[] }: deletes only specified docs
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Verify project ownership
    const project = await prisma.project.findFirst({
      where: { id: params.id, userId: user.id },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Try to read body for selective deletion (optional)
    let docIds: string[] | undefined;
    try {
      const body = await request.json();
      if (Array.isArray(body?.docIds) && body.docIds.length > 0) {
        docIds = body.docIds;
      }
    } catch {
      // No body provided → delete all
      docIds = undefined;
    }

    // Build delete filter
    const whereFilter = docIds
      ? { projectId: params.id, id: { in: docIds } }
      : { projectId: params.id };

    const result = await prisma.driveDocSummary.deleteMany({
      where: whereFilter,
    });

    // Check if any docs remain after deletion
    const remainingCount = await prisma.driveDocSummary.count({
      where: { projectId: params.id },
    });

    // Only clear driveFolderId if NO docs remain (full cleanup)
    if (remainingCount === 0) {
      await prisma.project.update({
        where: { id: params.id },
        data: { driveFolderId: null },
      });
    }

    return NextResponse.json({
      success: true,
      deletedCount: result.count,
      remainingCount,
    });
  } catch (error) {
    console.error("[DRIVE DOCS DELETE] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
