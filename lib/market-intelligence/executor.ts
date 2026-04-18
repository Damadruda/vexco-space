// =============================================================================
// MIP — Executor
// Núcleo de la ejecución de un template: inyecta periodo, llama Perplexity con
// JSON schema, valida con Zod, persiste el brief y actualiza lastRunAt.
// =============================================================================

import { prisma } from "@/lib/prisma";
import { callPerplexity } from "@/lib/clients/llm";
import { SCHEMA_REGISTRY } from "./schemas";
import type { MarketIntelligenceTemplate, Prisma } from "@prisma/client";

export type ExecutionResult =
  | { ok: true; briefId: string; itemCount: number; parsedOk: boolean }
  | { ok: false; error: string };

export async function executeTemplate(
  template: MarketIntelligenceTemplate
): Promise<ExecutionResult> {
  const now = new Date();
  const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fromIso = from.toISOString();
  const toIso = now.toISOString();

  // Inyectar el periodo al userPrompt (reemplaza placeholders {{FROM}} y {{TO}})
  const userPrompt = template.userPrompt
    .replace(/\{\{FROM\}\}/g, fromIso)
    .replace(/\{\{TO\}\}/g, toIso);

  let content: string;
  let citations: Array<{ url: string; title: string }> | undefined;
  let usage: { total_tokens?: number } | undefined;

  try {
    const result = await callPerplexity(template.systemPrompt, userPrompt, {
      model: "sonar-pro",
      temperature: 0.2,
      responseSchema: template.responseSchema as Record<string, unknown>,
    });
    content = result.content;
    citations = result.citations;
    usage = result.usage;
  } catch (err) {
    console.error(
      `[MIP executor] Perplexity call failed for template ${template.id}:`,
      err
    );
    return { ok: false, error: `Perplexity API error: ${String(err)}` };
  }

  // Parseo y validación Zod
  const schemaZod = SCHEMA_REGISTRY[template.briefType];
  let structuredData: unknown;
  let parsedOk = false;
  let rawNarrative: string | null = null;
  let itemCount = 0;

  try {
    const parsed = JSON.parse(content);
    if (schemaZod) {
      const validated = schemaZod.safeParse(parsed);
      if (validated.success) {
        // Override scanPeriod con los valores que el endpoint calculó,
        // ignorando lo que haya emitido el LLM.
        structuredData = {
          ...validated.data,
          scanPeriod: { from: fromIso, to: toIso },
        };
        parsedOk = true;
        // Contador best-effort (funciona para A; B y C usarán otras keys)
        const anyData = validated.data as Record<string, unknown>;
        if (Array.isArray(anyData.opportunities)) itemCount = anyData.opportunities.length;
        else if (Array.isArray(anyData.findings)) itemCount = anyData.findings.length;
        else if (Array.isArray(anyData.moves)) itemCount = anyData.moves.length;
      } else {
        console.warn(`[MIP executor] Zod validation failed:`, validated.error.issues);
        structuredData = { _parseError: true, _rawParsed: parsed };
        rawNarrative = content;
      }
    } else {
      // No hay schema registrado — guardar tal cual
      structuredData = parsed;
    }
  } catch (err) {
    console.warn(`[MIP executor] JSON.parse failed:`, err);
    structuredData = { _parseError: true };
    rawNarrative = content;
  }

  // Inyectar citations al structuredData si Perplexity las emitió
  if (
    citations &&
    citations.length > 0 &&
    typeof structuredData === "object" &&
    structuredData !== null
  ) {
    (structuredData as Record<string, unknown>)._perplexityCitations = citations;
  }

  try {
    const brief = await prisma.marketIntelligenceBrief.create({
      data: {
        templateId: template.id,
        briefType: template.briefType,
        publishedAt: now,
        structuredData: structuredData as Prisma.InputJsonValue,
        rawNarrative,
        sectorTags: template.sectorTags,
        geographyTags: template.geographyTags,
        tokenCost: usage?.total_tokens ?? null,
      },
    });

    await prisma.marketIntelligenceTemplate.update({
      where: { id: template.id },
      data: { lastRunAt: now },
    });

    return { ok: true, briefId: brief.id, itemCount, parsedOk };
  } catch (err) {
    console.error(`[MIP executor] DB persist failed:`, err);
    return { ok: false, error: `DB error: ${String(err)}` };
  }
}
