// =============================================================================
// Backfill NAICS sector for existing Projects and FirmInsights.
// Run: yarn tsx scripts/backfill-naics-sectors.ts
// =============================================================================

import { PrismaClient } from "@prisma/client";
import { classifyProjectSector, classifyInsightSector } from "../lib/firm-insights/sector-classifier";

const prisma = new PrismaClient();

async function backfillProjects() {
  const projects = await prisma.project.findMany({
    where: { naicsSector: null },
    select: { id: true, title: true, description: true, concept: true, targetMarket: true },
  });
  console.log(`[BACKFILL] ${projects.length} projects to classify`);

  for (const p of projects) {
    try {
      const res = await classifyProjectSector(p);
      await prisma.project.update({
        where: { id: p.id },
        data: {
          naicsSector: res.naicsSector,
          naicsSectorConfidence: res.confidence,
        },
      });
      console.log(`  [OK] ${p.title} → ${res.naicsSector ?? "UNKNOWN"} (${Math.round(res.confidence * 100)}%)`);
    } catch (err) {
      console.warn(`  [FAIL] ${p.title}: ${err}`);
    }
  }
}

async function backfillInsights() {
  const insights = await prisma.firmInsight.findMany({
    where: { naicsSector: null, isActive: true },
    select: { id: true, title: true, content: true, functionalDomain: true },
  });
  console.log(`[BACKFILL] ${insights.length} insights to classify`);

  for (const i of insights) {
    try {
      const res = await classifyInsightSector(i);
      await prisma.firmInsight.update({
        where: { id: i.id },
        data: {
          naicsSector: res.naicsSector,
          naicsSectorConfidence: res.confidence,
        },
      });
      console.log(`  [OK] ${i.title.slice(0, 60)} → ${res.naicsSector ?? "TRANSVERSAL"} (${Math.round(res.confidence * 100)}%)`);
    } catch (err) {
      console.warn(`  [FAIL] ${i.title}: ${err}`);
    }
  }
}

async function main() {
  await backfillProjects();
  await backfillInsights();
  console.log("[BACKFILL] Done. Review pending items at /sectors/review");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
