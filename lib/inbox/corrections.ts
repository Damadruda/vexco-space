// =============================================================================
// INBOX CORRECTIONS — Fetch user's past manual recategorizations
// Used as few-shot calibration in Stage A classifier.
// =============================================================================

import { prisma } from "@/lib/db";

export interface InboxCorrectionExample {
  title: string;
  summary: string;
  tags: string[];
  correctCategory: string;
}

export async function getRecentCorrections(
  userId: string,
  limit: number = 25
): Promise<InboxCorrectionExample[]> {
  const corrections = await prisma.inboxCorrection.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return corrections.map((c) => ({
    title: c.itemTitle,
    summary: c.itemSummary,
    tags: c.itemTags,
    correctCategory: c.newCategory,
  }));
}

export async function recordCorrection(
  userId: string,
  itemTitle: string,
  itemSummary: string,
  itemTags: string[],
  oldCategory: string,
  newCategory: string
): Promise<void> {
  if (oldCategory === newCategory) return;
  await prisma.inboxCorrection.create({
    data: {
      userId,
      itemTitle: itemTitle.slice(0, 500),
      itemSummary: itemSummary.slice(0, 2000),
      itemTags: itemTags.slice(0, 15),
      oldCategory,
      newCategory,
    },
  });
}
