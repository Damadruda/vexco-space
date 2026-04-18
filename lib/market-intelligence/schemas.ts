// =============================================================================
// MIP — Zod schemas registry
// Un schema por MarketBriefType. Se amplía en 1B con B (CONSULTING_MARKET)
// y C (INTERNATIONALIZATION) y siguientes.
// =============================================================================

import { z } from "zod";
import type { MarketBriefType } from "@prisma/client";

export const CommercialRadarSchema = z.object({
  summary: z.string(),
  scanPeriod: z.object({
    from: z.string(),
    to: z.string(),
  }),
  opportunities: z.array(
    z.object({
      opportunityType: z.enum([
        "CONTRACT_ANNOUNCED",
        "TENDER_OPEN",
        "CLEVEL_APPOINTMENT",
        "FUNDING_ROUND",
        "CARVE_OUT_MA",
        "MARKET_EXPANSION",
      ]),
      company: z.string(),
      sector: z.string().optional(),
      geography: z.string().optional(),
      trigger: z.string(),
      consultingAngle: z.string(),
      amount: z
        .object({
          value: z.number(),
          currency: z.string(),
        })
        .optional(),
      sources: z
        .array(
          z.object({
            url: z.string(),
            title: z.string(),
          })
        )
        .min(1),
    })
  ),
});

export type CommercialRadarData = z.infer<typeof CommercialRadarSchema>;

// Registry: mapea briefType → schema Zod. Se amplía en 1B con B y C.
export const SCHEMA_REGISTRY: Partial<Record<MarketBriefType, z.ZodTypeAny>> = {
  COMMERCIAL_RADAR: CommercialRadarSchema,
};
