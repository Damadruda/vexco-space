// =============================================================================
// VEXCO-LAB — CENTRALIZED LLM CLIENT
// Single entry point for all LLM calls: Gemini Flash, Claude Sonnet, Perplexity Sonar.
// No other file should call an LLM directly.
// Fallback: Claude → Gemini Flash | Perplexity → Gemini Flash (with warning).
// =============================================================================

import { GoogleGenAI } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";

export type Part = { text: string } | { inlineData: { data: string; mimeType: string } };

// ─── Public Types ─────────────────────────────────────────────────────────────

export interface LLMRequest {
  model: "gemini-flash" | "gemini-pro" | "claude-sonnet" | "perplexity-sonar";
  systemPrompt: string;
  userPrompt: string;
  jsonMode: boolean;
  maxTokens?: number;
  temperature?: number;
}

export interface LLMResponse {
  content: string;
  model: string;
  processingTimeMs: number;
  tokensUsed?: number;
}

// ─── Gemini (Pro + Flash with retry/fallback) ─────────────────────────────────

async function callGemini(
  systemPrompt: string,
  userPrompt: string,
  jsonMode: boolean,
  maxTokens?: number,
  temperature?: number,
  modelOverride?: string
): Promise<{ content: string; tokensUsed?: number }> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY no configurada");

  const modelName = modelOverride ?? "gemini-3.1-pro-preview";
  const timeoutMs = modelName.includes("flash") ? 30_000 : 120_000;

  const ai = new GoogleGenAI({ apiKey });

  const fullPrompt = systemPrompt
    ? `${systemPrompt}\n\n${userPrompt}`
    : userPrompt;

  // Hasta 2 intentos con el modelo actual
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Gemini timeout after ${timeoutMs / 1000}s`)), timeoutMs)
      );
      const generatePromise = ai.models.generateContent({
        model: modelName,
        contents: fullPrompt,
        config: {
          ...(maxTokens ? { maxOutputTokens: maxTokens } : {}),
          temperature: temperature !== undefined ? temperature : 0.7,
          ...(jsonMode ? { responseMimeType: "application/json" } : {}),
          // thinkingConfig deshabilitado temporalmente — causa posible del 500
          // ...(modelName.includes("pro") ? { thinkingConfig: { thinkingLevel: "low" } } : {}),
        },
      });
      const result = await Promise.race([generatePromise, timeoutPromise]);
      const text = result.text || "";
      const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();

      if (!cleaned) throw new Error("Gemini returned empty response");

      return { content: cleaned };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[GEMINI] ${modelName} attempt ${attempt} failed: ${msg}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      console.warn(`[GEMINI] Full error:`, JSON.stringify(err, null, 2).substring(0, 500));
      if (attempt < 2) await new Promise((r) => setTimeout(r, 2_000));
    }
  }

  // Fallback Pro → Flash
  if (!modelOverride && modelName === "gemini-3.1-pro-preview") {
    console.warn("[GEMINI] Pro failed twice, falling back to gemini-3-flash-preview");
    return callGemini(systemPrompt, userPrompt, jsonMode, maxTokens, temperature, "gemini-3-flash-preview");
  }

  throw new Error(`Gemini ${modelName} failed after all retries`);
}

// ─── Claude Sonnet ────────────────────────────────────────────────────────────

async function callClaude(
  systemPrompt: string,
  userPrompt: string,
  jsonMode: boolean,
  maxTokens?: number,
  temperature?: number
): Promise<{ content: string; tokensUsed?: number }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("[LLM] ANTHROPIC_API_KEY no configurada — fallback a Gemini Flash");
    return callGemini(systemPrompt, userPrompt, jsonMode, maxTokens, temperature);
  }

  const client = new Anthropic({ apiKey });

  const system = jsonMode
    ? `${systemPrompt}\n\nResponde SOLO con JSON válido. Sin texto extra, sin markdown, sin bloques de código.`
    : systemPrompt;

  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: maxTokens ?? 4096,
    temperature: temperature ?? 0.7,
    system,
    messages: [{ role: "user", content: userPrompt }],
  });

  const block = message.content[0];
  const raw = block.type === "text" ? block.text : "";
  const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();

  return {
    content: cleaned,
    tokensUsed: message.usage.input_tokens + message.usage.output_tokens,
  };
}

// ─── Perplexity Sonar ─────────────────────────────────────────────────────────

async function callPerplexity(
  systemPrompt: string,
  userPrompt: string,
  temperature?: number
): Promise<{ content: string }> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    console.warn("[LLM] PERPLEXITY_API_KEY no configurada — fallback a Gemini Flash");
    return callGemini(systemPrompt, userPrompt, false, undefined, temperature);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);

  let res: Response;
  try {
    res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: temperature ?? 0.7,
      }),
      signal: controller.signal,
    });
  } catch (fetchErr) {
    console.warn(`[LLM] Perplexity fetch failed (timeout or network) — fallback a Gemini Flash:`, fetchErr);
    return callGemini(systemPrompt, userPrompt, false, undefined, temperature);
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    console.warn(`[LLM] Perplexity error ${res.status} — fallback a Gemini Flash`);
    return callGemini(systemPrompt, userPrompt, false, undefined, temperature);
  }

  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  return { content: data.choices[0]?.message?.content ?? "" };
}

// ─── Gemini Multimodal (for Drive folder analysis with images) ────────────────

/**
 * callGeminiMultimodal — Para análisis que incluyen imágenes.
 * Mismo retry/fallback que callGemini pero acepta Parts[].
 * Solo se usa desde analyze-folder.
 */
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
  const modelName = modelOverride || "gemini-3.1-pro-preview";
  const timeoutMs = modelName.includes("flash") ? 30000 : 120000;

  const ai = new GoogleGenAI({ apiKey });

  const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${userPrompt}` : userPrompt;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Gemini timeout after ${timeoutMs / 1000}s`)),
          timeoutMs
        )
      );
      const generatePromise = ai.models.generateContent({
        model: modelName,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        contents: [{ text: fullPrompt }, ...parts] as any,
        config: {
          ...(jsonMode ? { responseMimeType: "application/json" } : {}),
          ...(maxTokens ? { maxOutputTokens: maxTokens } : {}),
          temperature: temperature ?? 0.7,
          // thinkingConfig deshabilitado temporalmente — causa posible del 500
          // ...(modelName.includes("pro") ? { thinkingConfig: { thinkingLevel: "low" } } : {}),
        },
      });
      const result = await Promise.race([generatePromise, timeoutPromise]);
      const text = result.text || "";
      const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();
      if (!cleaned) throw new Error("Gemini returned empty response");
      return { content: cleaned, model: modelName, processingTimeMs: Date.now() - startTime };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[GEMINI_MULTIMODAL] ${modelName} attempt ${attempt} failed: ${msg}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      console.warn(`[GEMINI_MULTIMODAL] Full error:`, JSON.stringify(err, null, 2).substring(0, 500));
      if (attempt < 2) await new Promise((r) => setTimeout(r, 2000));
    }
  }

  // Fallback Pro → Flash
  if (!modelOverride && modelName === "gemini-3.1-pro-preview") {
    console.warn("[GEMINI_MULTIMODAL] Pro failed, falling back to gemini-3-flash-preview");
    return callGeminiMultimodal(
      systemPrompt,
      userPrompt,
      parts,
      jsonMode,
      maxTokens,
      temperature,
      "gemini-3-flash-preview"
    );
  }

  throw new Error(`Gemini multimodal ${modelName} failed after all retries`);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function callLLM(request: LLMRequest): Promise<LLMResponse> {
  const { model, systemPrompt, userPrompt, jsonMode, maxTokens, temperature } = request;
  const startTime = Date.now();

  let content: string;
  let tokensUsed: number | undefined;
  let realModel: string;

  if (model === "claude-sonnet") {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const res = await callClaude(systemPrompt, userPrompt, jsonMode, maxTokens, temperature);
    content = res.content;
    tokensUsed = res.tokensUsed;
    realModel = apiKey ? "claude-sonnet-4-20250514" : "gemini-3.1-pro-preview (fallback)";
  } else if (model === "perplexity-sonar") {
    const apiKey = process.env.PERPLEXITY_API_KEY;
    const res = await callPerplexity(systemPrompt, userPrompt, temperature);
    content = res.content;
    realModel = apiKey ? "sonar-pro" : "gemini-3-flash-preview (fallback)";
  } else if (model === "gemini-pro") {
    const res = await callGemini(systemPrompt, userPrompt, jsonMode, maxTokens, temperature, "gemini-3.1-pro-preview");
    content = res.content;
    tokensUsed = res.tokensUsed;
    realModel = "gemini-3.1-pro-preview";
  } else {
    const res = await callGemini(systemPrompt, userPrompt, jsonMode, maxTokens, temperature, "gemini-3-flash-preview");
    content = res.content;
    tokensUsed = res.tokensUsed;
    realModel = "gemini-3-flash-preview";
  }

  return {
    content,
    model: realModel,
    processingTimeMs: Date.now() - startTime,
    tokensUsed,
  };
}
