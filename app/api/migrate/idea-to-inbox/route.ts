import { NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// POST: Migrate all Ideas to Inbox as InboxItems (idempotent)
export async function POST() {
  try {
    const userId = await getDefaultUserId();

    const ideas = await prisma.idea.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });

    let migrated = 0;
    let skipped = 0;

    for (const idea of ideas) {
      // Check for duplicate by sourceTitle match
      const existing = await prisma.inboxItem.findFirst({
        where: {
          userId,
          sourceTitle: idea.title,
          type: "text",
        },
      });

      if (existing) {
        skipped++;
        continue;
      }

      await prisma.inboxItem.create({
        data: {
          type: "text",
          rawContent: idea.content || idea.title,
          sourceTitle: idea.title,
          status: "unprocessed",
          priority: "medium",
          tags: idea.tags ?? [],
          userId,
          projectId: idea.projectId ?? null,
        },
      });

      migrated++;
    }

    return NextResponse.json({
      migrated,
      skipped,
      total: ideas.length,
      message: `Migrated ${migrated} ideas to inbox, skipped ${skipped} duplicates`,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[MIGRATE IDEA→INBOX]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
