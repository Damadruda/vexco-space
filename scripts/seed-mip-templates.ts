// =============================================================================
// MIP — Seed script: upsert operacional por `name` de los templates activos.
// Uso: npx tsx scripts/seed-mip-templates.ts
// =============================================================================

import { PrismaClient } from "@prisma/client";
import { TEMPLATE_A } from "../lib/market-intelligence/templates/template-a";

const prisma = new PrismaClient();

async function main() {
  console.log("[seed MIP] Starting Template A upsert...");

  const existing = await prisma.marketIntelligenceTemplate.findFirst({
    where: { name: TEMPLATE_A.name },
  });

  const data = {
    name: TEMPLATE_A.name,
    briefType: TEMPLATE_A.briefType,
    schedule: TEMPLATE_A.schedule,
    sectorTags: [...TEMPLATE_A.sectorTags],
    geographyTags: [...TEMPLATE_A.geographyTags],
    systemPrompt: TEMPLATE_A.systemPrompt,
    userPrompt: TEMPLATE_A.userPromptTemplate,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    responseSchema: TEMPLATE_A.responseSchema as any,
    isActive: true,
  };

  if (existing) {
    const updated = await prisma.marketIntelligenceTemplate.update({
      where: { id: existing.id },
      data,
    });
    console.log(`[seed MIP] Updated Template A: ${updated.id}`);
  } else {
    const created = await prisma.marketIntelligenceTemplate.create({ data });
    console.log(`[seed MIP] Created Template A: ${created.id}`);
  }
}

main()
  .catch((err) => {
    console.error("[seed MIP] failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
