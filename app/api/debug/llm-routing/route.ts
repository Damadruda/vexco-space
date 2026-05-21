// =============================================================================
// DEBUG — LLM routing validation
// GET (no params): returns tier → model mapping (dry, no API calls)
// GET ?live=1: actually pings each tier with "Say hello" prompt
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { MODEL_IDS, resolveTierModel, callLLM } from "@/lib/clients/llm";
import type { TaskTier } from "@/lib/clients/llm";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

interface TierProbe {
  tier: TaskTier;
  escalated?: boolean;
  engine?: "gemini" | "anthropic";
  label: string;
}

const PROBES: TierProbe[] = [
  { tier: "T1", label: "T1 default (Gemini Flash)" },
  { tier: "T1", engine: "anthropic", label: "T1 anthropic (Haiku 4.5)" },
  { tier: "T2", label: "T2 (Gemini Pro)" },
  { tier: "T3", label: "T3 default (Sonnet 4.6)" },
  { tier: "T3", escalated: true, label: "T3 escalated (Opus 4.7)" },
];

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const live = url.searchParams.get("live") === "1";

  // Dry mapping always
  const mapping = PROBES.map((p) => {
    const resolved = resolveTierModel(p.tier, { escalated: p.escalated, engine: p.engine });
    return {
      label: p.label,
      tier: p.tier,
      escalated: p.escalated ?? false,
      engine: p.engine ?? null,
      provider: resolved.provider,
      modelId: resolved.modelId,
    };
  });

  if (!live) {
    return NextResponse.json({
      mode: "dry",
      modelIds: MODEL_IDS,
      mapping,
      tip: "Append ?live=1 to actually ping each tier (consumes tokens).",
    });
  }

  // Live probes
  const probes = await Promise.all(
    PROBES.map(async (p) => {
      const resolved = resolveTierModel(p.tier, { escalated: p.escalated, engine: p.engine });
      const startedAt = Date.now();
      try {
        const res = await callLLM({
          tier: p.tier,
          escalated: p.escalated,
          tierEngine: p.engine,
          systemPrompt: "Eres un asistente que responde en una sola oración.",
          userPrompt: "Di hola y menciona el nombre del modelo que crees ser, en una sola oración corta.",
          jsonMode: false,
          maxTokens: 100,
          temperature: 0.3,
        });
        const modelMatches = res.model === resolved.modelId;
        const fallbackTriggered = !modelMatches;
        return {
          label: p.label,
          tier: p.tier,
          escalated: p.escalated ?? false,
          engine: p.engine ?? null,
          expectedProvider: resolved.provider,
          expectedModelId: resolved.modelId,
          actualModel: res.model,
          latencyMs: Date.now() - startedAt,
          ok: modelMatches,
          fallbackTriggered,
          sample: res.content.slice(0, 200),
          tokensUsed: res.tokensUsed ?? null,
          cachedTokens: res.cachedTokens ?? null,
        };
      } catch (err) {
        return {
          label: p.label,
          tier: p.tier,
          escalated: p.escalated ?? false,
          engine: p.engine ?? null,
          expectedProvider: resolved.provider,
          expectedModelId: resolved.modelId,
          actualModel: null,
          latencyMs: Date.now() - startedAt,
          ok: false,
          fallbackTriggered: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    })
  );

  const allOk = probes.every((p) => p.ok);

  return NextResponse.json({
    mode: "live",
    modelIds: MODEL_IDS,
    allOk,
    probes,
  });
}
