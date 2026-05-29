// =============================================================================
// VEXCO-LAB — CENTRALIZED LLM CLIENT
// Single entry point for all LLM calls.
// Tier routing T1/T2/T3 per CLAUDE.md §15. Legacy `model` enum backwards-compat.
// Prompt caching enabled on Anthropic system prompts (cache_control: ephemeral).
// =============================================================================

import { GoogleGenAI } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";

export type Part = { text: string } | { inlineData: { data: string; mimeType: string } };

// Models that deprecated temperature/top_p/top_k entirely (Anthropic API rejects request body
// containing these fields, regardless of value). Update this set as new restricted models ship.
export const MODELS_WITHOUT_SAMPLING_PARAMS = new Set<string>([
  "claude-opus-4-7",
]);

export function supportsSamplingParams(modelId: string): boolean {
  return !MODELS_WITHOUT_SAMPLING_PARAMS.has(modelId);
}

// ─── Tier system ──────────────────────────────────────────────────────────────

export type TaskTier = "T1" | "T2" | "T3";
export type TierEngine = "gemini" | "anthropic"; // Only T1 has dual engine option

/**
 * Single source of truth for model IDs. Update here when migrating.
 */
export const MODEL_IDS = {
  geminiT1: "gemini-3.5-flash",
  geminiT2: "gemini-3.1-pro-preview",
  geminiMultimodal: "gemini-3.1-pro-preview",
  geminiMultimodalFallback: "gemini-3.5-flash",
  anthropicT1: "claude-haiku-4-5-20251001",
  anthropicT3Default: "claude-sonnet-4-6",
  anthropicT3Escalated: "claude-opus-4-7",
  perplexity: "sonar-pro",
} as const;

export function resolveTierModel(
  tier: TaskTier,
  opts: { escalated?: boolean; engine?: TierEngine } = {}
): { provider: "gemini" | "anthropic"; modelId: string } {
  if (tier === "T1") {
    if (opts.engine === "anthropic") {
      return { provider: "anthropic", modelId: MODEL_IDS.anthropicT1 };
    }
    return { provider: "gemini", modelId: MODEL_IDS.geminiT1 };
  }
  if (tier === "T2") {
    return { provider: "gemini", modelId: MODEL_IDS.geminiT2 };
  }
  // T3
  if (opts.escalated) {
    return { provider: "anthropic", modelId: MODEL_IDS.anthropicT3Escalated };
  }
  return { provider: "anthropic", modelId: MODEL_IDS.anthropicT3Default };
}

// ─── Public Types ─────────────────────────────────────────────────────────────

export interface LLMRequest {
  // Legacy path (still works, mapped to tier internally).
  // `gemini-pro-stable` / `gemini-flash-stable` kept for out-of-scope callers
  // (sector-classifier, drive-import-helpers) — mapped to T2 / T1 respectively.
  model?:
    | "gemini-flash"
    | "gemini-pro"
    | "gemini-pro-stable"
    | "gemini-flash-stable"
    | "claude-sonnet"
    | "perplexity-sonar";
  // Preferred path
  tier?: TaskTier;
  escalated?: boolean;
  tierEngine?: TierEngine;
  // Common
  systemPrompt: string;
  userPrompt: string;
  jsonMode: boolean;
  maxTokens?: number;
  temperature?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  responseSchema?: any;
  // NEW: enable prompt caching on Anthropic system prompt (requires >= 1024 chars)
  enablePromptCache?: boolean;
}

export interface LLMResponse {
  content: string;
  model: string;
  processingTimeMs: number;
  tokensUsed?: number;
  cachedTokens?: number;
  fallbackTriggered?: boolean;
  fallbackFromModel?: string;
  fallbackErrors?: string[];
}

// ─── Gemini ────────────────────────────────────────────────────────────────────

async function callGemini(
  systemPrompt: string,
  userPrompt: string,
  jsonMode: boolean,
  modelId: string,
  maxTokens?: number,
  temperature?: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  responseSchema?: any
): Promise<{ content: string; tokensUsed?: number; modelUsed: string; fallbackErrors?: string[]; fallbackFromModel?: string }> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY no configurada");

  const ai = new GoogleGenAI({ apiKey });
  const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${userPrompt}` : userPrompt;

  const isFlash = modelId.includes("flash");
  const timeoutMs = isFlash ? 30_000 : 120_000;

  const currentModel = modelId;

  const attemptErrors: string[] = [];

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Gemini timeout after ${timeoutMs / 1000}s`)),
          timeoutMs
        )
      );

      const geminiConfig: Record<string, unknown> = {
        maxOutputTokens: maxTokens || 8192,
        temperature: temperature !== undefined ? temperature : 0.7,
      };
      if (jsonMode || responseSchema) {
        geminiConfig.responseMimeType = "application/json";
      }
      if (responseSchema) {
        geminiConfig.responseSchema = responseSchema;
      }

      const generatePromise = ai.models.generateContent({
        model: currentModel,
        contents: fullPrompt,
        config: geminiConfig,
      });
      const result = await Promise.race([generatePromise, timeoutPromise]);
      const text = result.text || "";
      const cleaned = extractJsonFromResponse(text, jsonMode || !!responseSchema);
      if (!cleaned) throw new Error("Gemini returned empty response");
      return { content: cleaned, modelUsed: currentModel };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[GEMINI] ${currentModel} attempt ${attempt} failed: ${msg}`);
      attemptErrors.push(`attempt ${attempt}: ${msg}`);
      if (attempt < 2) await new Promise((r) => setTimeout(r, 2_000));
    }
  }

  // Fallback Pro → Flash
  if (currentModel === MODEL_IDS.geminiT2) {
    console.warn(`[GEMINI] ${currentModel} failed twice, falling back to ${MODEL_IDS.geminiT1}`);

    // Persist fallback event for diagnostics. Awaited to ensure the row lands
    // before the lambda returns (CLAUDE.md §15.3 — fire-and-forget unreliable
    // in serverless). Wrapped in try/catch so DB issues never break the fallback.
    try {
      await prisma.lLMFallbackLog.create({
        data: {
          fromModel: currentModel,
          toModel: MODEL_IDS.geminiT1,
          errors: attemptErrors,
        },
      });
    } catch (dbErr) {
      const dbMsg = dbErr instanceof Error ? dbErr.message : String(dbErr);
      console.warn(`[GEMINI] Failed to persist fallback log: ${dbMsg}`);
    }

    const fallbackResult = await callGemini(systemPrompt, userPrompt, jsonMode, MODEL_IDS.geminiT1, maxTokens, temperature, responseSchema);
    return {
      ...fallbackResult,
      fallbackFromModel: currentModel,
      fallbackErrors: [...attemptErrors, ...(fallbackResult.fallbackErrors ?? [])],
    };
  }

  throw new Error(`Gemini ${currentModel} failed after all retries`);
}

// ─── Claude ────────────────────────────────────────────────────────────────────

async function callClaude(
  systemPrompt: string,
  userPrompt: string,
  jsonMode: boolean,
  modelId: string,
  maxTokens?: number,
  temperature?: number,
  enablePromptCache: boolean = false
): Promise<{ content: string; tokensUsed?: number; cachedTokens?: number; modelUsed: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("[LLM] ANTHROPIC_API_KEY no configurada — fallback a Gemini Flash");
    const fallback = await callGemini(
      systemPrompt,
      userPrompt,
      jsonMode,
      MODEL_IDS.geminiT1,
      maxTokens,
      temperature
    );
    return { content: fallback.content, modelUsed: `${fallback.modelUsed} (fallback)` };
  }

  const client = new Anthropic({ apiKey });

  const system = jsonMode
    ? `${systemPrompt}\n\nResponde SOLO con JSON válido. Sin texto extra, sin markdown, sin bloques de código.`
    : systemPrompt;

  // Caching only kicks in for system prompts >= ~1024 tokens (~4000 chars heuristic).
  // Use array-of-blocks format only when caching is enabled and content is long enough.
  const useCaching = enablePromptCache && system.length >= 4000;
  const systemParam = useCaching
    ? [
        {
          type: "text" as const,
          text: system,
          cache_control: { type: "ephemeral" as const },
        },
      ]
    : system;

  const baseParams: Anthropic.Messages.MessageCreateParamsNonStreaming = {
    model: modelId,
    max_tokens: maxTokens ?? 4096,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    system: systemParam as any,
    messages: [{ role: "user", content: userPrompt }],
  };
  if (supportsSamplingParams(modelId)) {
    baseParams.temperature = temperature ?? 0.7;
  }
  const message = await client.messages.create(baseParams);

  const block = message.content[0];
  const raw = block.type === "text" ? block.text : "";
  const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();

  const usage = message.usage as unknown as Record<string, unknown>;
  const inputTokens = (usage.input_tokens as number) ?? 0;
  const outputTokens = (usage.output_tokens as number) ?? 0;
  const cachedTokens = (usage.cache_read_input_tokens as number) ?? 0;

  return {
    content: cleaned,
    tokensUsed: inputTokens + outputTokens,
    cachedTokens,
    modelUsed: modelId,
  };
}

// ─── Perplexity ────────────────────────────────────────────────────────────────

export interface PerplexityOptions {
  temperature?: number;
  model?: "sonar-pro" | "sonar";
  responseSchema?: Record<string, unknown>;
}

export interface PerplexityResult {
  content: string;
  citations?: Array<{ url: string; title: string }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export async function callPerplexity(
  systemPrompt: string,
  userPrompt: string,
  options?: PerplexityOptions
): Promise<PerplexityResult> {
  const temperature = options?.temperature;
  const responseSchema = options?.responseSchema;
  const model = responseSchema ? "sonar-pro" : options?.model ?? "sonar-pro";

  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    console.warn("[LLM] PERPLEXITY_API_KEY no configurada — fallback a Gemini Flash");
    const fallback = await callGemini(systemPrompt, userPrompt, false, MODEL_IDS.geminiT1, undefined, temperature);
    return { content: fallback.content };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: temperature ?? 0.7,
  };
  if (responseSchema) {
    body.response_format = {
      type: "json_schema",
      json_schema: { schema: responseSchema, strict: true },
    };
  }

  let res: Response;
  try {
    res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (fetchErr) {
    console.warn(`[LLM] Perplexity fetch failed — fallback a Gemini Flash:`, fetchErr);
    const fallback = await callGemini(systemPrompt, userPrompt, false, MODEL_IDS.geminiT1, undefined, temperature);
    return { content: fallback.content };
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.warn(`[LLM] Perplexity error ${res.status} — fallback Gemini Flash. Body: ${errText.slice(0, 500)}`);
    const fallback = await callGemini(systemPrompt, userPrompt, false, MODEL_IDS.geminiT1, undefined, temperature);
    return { content: fallback.content };
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    citations?: Array<unknown>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };

  const content = data.choices?.[0]?.message?.content ?? "";

  let citations: Array<{ url: string; title: string }> | undefined;
  if (Array.isArray(data.citations) && data.citations.length > 0) {
    citations = data.citations
      .map((c): { url: string; title: string } | null => {
        if (typeof c === "string") return { url: c, title: c };
        if (c && typeof c === "object") {
          const obj = c as Record<string, unknown>;
          const url = typeof obj.url === "string" ? obj.url : null;
          if (!url) return null;
          const title = typeof obj.title === "string" ? obj.title : url;
          return { url, title };
        }
        return null;
      })
      .filter((c): c is { url: string; title: string } => c !== null);
    if (citations.length === 0) citations = undefined;
  }

  const usage =
    data.usage &&
    typeof data.usage.prompt_tokens === "number" &&
    typeof data.usage.completion_tokens === "number" &&
    typeof data.usage.total_tokens === "number"
      ? {
          prompt_tokens: data.usage.prompt_tokens,
          completion_tokens: data.usage.completion_tokens,
          total_tokens: data.usage.total_tokens,
        }
      : undefined;

  return { content, citations, usage };
}

// ─── Gemini Multimodal ─────────────────────────────────────────────────────────

export async function callGeminiMultimodal(
  systemPrompt: string,
  userPrompt: string,
  parts: Part[],
  jsonMode: boolean = false,
  maxTokens?: number,
  temperature?: number,
  modelOverride?: string
): Promise<{ content: string; model: string; processingTimeMs: number }> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY no configurada");

  const startTime = Date.now();
  const modelName = modelOverride || MODEL_IDS.geminiMultimodal;
  const timeoutMs = modelName.includes("flash") ? 30_000 : 120_000;

  const ai = new GoogleGenAI({ apiKey });
  const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${userPrompt}` : userPrompt;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Gemini multimodal timeout after ${timeoutMs / 1000}s`)), timeoutMs)
      );

      const config: Record<string, unknown> = {
        maxOutputTokens: maxTokens || 8192,
        temperature: temperature !== undefined ? temperature : 0.7,
      };
      if (jsonMode) {
        config.responseMimeType = "application/json";
      }

      // Build contents: prompt + parts
      const contents = [
        {
          parts: [{ text: fullPrompt }, ...parts],
        },
      ];

      const generatePromise = ai.models.generateContent({
        model: modelName,
        contents,
        config,
      });
      const result = await Promise.race([generatePromise, timeoutPromise]);
      const text = result.text || "";
      const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();
      if (!cleaned) throw new Error("Gemini returned empty response");
      return { content: cleaned, model: modelName, processingTimeMs: Date.now() - startTime };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[GEMINI_MULTIMODAL] ${modelName} attempt ${attempt} failed: ${msg}`);
      if (attempt < 2) await new Promise((r) => setTimeout(r, 2_000));
    }
  }

  // Fallback Pro → Flash
  if (!modelOverride && modelName === MODEL_IDS.geminiMultimodal) {
    console.warn(`[GEMINI_MULTIMODAL] ${modelName} failed, falling back to ${MODEL_IDS.geminiMultimodalFallback}`);
    return callGeminiMultimodal(
      systemPrompt,
      userPrompt,
      parts,
      jsonMode,
      maxTokens,
      temperature,
      MODEL_IDS.geminiMultimodalFallback
    );
  }

  throw new Error(`Gemini multimodal ${modelName} failed after all retries`);
}

// ─── Public API ────────────────────────────────────────────────────────────────

export async function callLLM(request: LLMRequest): Promise<LLMResponse> {
  const { systemPrompt, userPrompt, jsonMode, maxTokens, temperature, responseSchema, enablePromptCache } = request;
  const startTime = Date.now();

  // Resolve provider + modelId
  let provider: "gemini" | "anthropic" | "perplexity";
  let modelId: string;

  if (request.tier) {
    const resolved = resolveTierModel(request.tier, {
      escalated: request.escalated,
      engine: request.tierEngine,
    });
    provider = resolved.provider;
    modelId = resolved.modelId;
  } else if (request.model === "perplexity-sonar") {
    provider = "perplexity";
    modelId = MODEL_IDS.perplexity;
  } else if (request.model === "claude-sonnet") {
    provider = "anthropic";
    modelId = MODEL_IDS.anthropicT3Default;
  } else if (request.model === "gemini-pro" || request.model === "gemini-pro-stable") {
    provider = "gemini";
    modelId = MODEL_IDS.geminiT2;
  } else if (request.model === "gemini-flash" || request.model === "gemini-flash-stable") {
    provider = "gemini";
    modelId = MODEL_IDS.geminiT1;
  } else {
    // No tier and no model: default to T1 gemini
    provider = "gemini";
    modelId = MODEL_IDS.geminiT1;
  }

  if (provider === "anthropic") {
    const res = await callClaude(
      systemPrompt,
      userPrompt,
      jsonMode,
      modelId,
      maxTokens,
      temperature,
      enablePromptCache ?? false
    );
    return {
      content: res.content,
      model: res.modelUsed,
      processingTimeMs: Date.now() - startTime,
      tokensUsed: res.tokensUsed,
      cachedTokens: res.cachedTokens,
    };
  }

  if (provider === "perplexity") {
    const res = await callPerplexity(systemPrompt, userPrompt, { temperature });
    return {
      content: res.content,
      model: MODEL_IDS.perplexity,
      processingTimeMs: Date.now() - startTime,
      tokensUsed: res.usage?.total_tokens,
    };
  }

  // gemini
  const res = await callGemini(systemPrompt, userPrompt, jsonMode, modelId, maxTokens, temperature, responseSchema);
  return {
    content: res.content,
    model: res.modelUsed,
    processingTimeMs: Date.now() - startTime,
    tokensUsed: res.tokensUsed,
    fallbackTriggered: !!res.fallbackFromModel,
    fallbackFromModel: res.fallbackFromModel,
    fallbackErrors: res.fallbackErrors,
  };
}

/**
 * Extract usable content from a Gemini response.
 *
 * In JSON mode, defensively extracts the first balanced top-level JSON object
 * from the response text. Gemini occasionally adds prose preambles like
 * "Here is the JSON:" even when responseMimeType="application/json" is set
 * (typically when the schema is rejected as invalid OpenAPI subset, but also
 * sporadically with preview models).
 *
 * In non-JSON mode, strips markdown code fences and returns trimmed text.
 *
 * @param text raw text from Gemini result.text
 * @param expectJson true if the caller used jsonMode or responseSchema
 * @returns string ready for JSON.parse (json mode) or plain text
 */
export function extractJsonFromResponse(text: string, expectJson: boolean): string {
  // Strip markdown code fences first — applies to both modes
  const cleaned = text.replace(/```(?:json)?\n?|\n?```/g, "").trim();

  if (!expectJson) {
    return cleaned;
  }

  // If the cleaned text starts with { or [, assume it's already valid JSON-shaped
  if (cleaned.startsWith("{") || cleaned.startsWith("[")) {
    return cleaned;
  }

  // Otherwise: find the first balanced {...} or [...] block in the response.
  // This handles preambles like "Here is the JSON: {...}".
  const firstObjStart = cleaned.indexOf("{");
  const firstArrStart = cleaned.indexOf("[");
  const candidates = [firstObjStart, firstArrStart].filter((i) => i >= 0);
  if (candidates.length === 0) {
    // No JSON-like content found — return as-is and let downstream parsing fail
    // with a clear error including the offending text
    return cleaned;
  }

  const start = Math.min(...candidates);
  const openChar = cleaned[start];
  const closeChar = openChar === "{" ? "}" : "]";

  // Walk forward tracking nesting depth, respecting string literals
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === openChar) depth++;
    else if (ch === closeChar) {
      depth--;
      if (depth === 0) {
        return cleaned.slice(start, i + 1);
      }
    }
  }

  // Unbalanced — return what we have starting from the first opener, downstream will fail
  return cleaned.slice(start);
}
