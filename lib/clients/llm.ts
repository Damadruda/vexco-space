// =============================================================================
// VEXCO-LAB — CENTRALIZED LLM CLIENT
// Single entry point for all LLM calls: Gemini Flash, Claude Sonnet, Perplexity Sonar.
// No other file should call an LLM directly.
// Fallback: Claude → Gemini Flash | Perplexity → Gemini Flash (with warning).
// =============================================================================

import { GoogleGenerativeAI } from "@google/generative-ai";
import Anthropic from "@anthropic-ai/sdk";

// ─── Public Types ─────────────────────────────────────────────────────────────

export interface LLMRequest {
  model: "gemini-flash" | "claude-sonnet" | "perplexity-sonar";
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

// ─── Gemini Flash ─────────────────────────────────────────────────────────────

async function callGemini(
  systemPrompt: string,
  userPrompt: string,
  jsonMode: boolean,
  maxTokens?: number,
  temperature?: number
): Promise<{ content: string; tokensUsed?: number }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY no configurada");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    generationConfig: {
      ...(jsonMode ? { responseMimeType: "application/json" } : {}),
      ...(maxTokens ? { maxOutputTokens: maxTokens } : {}),
      ...(temperature !== undefined ? { temperature } : { temperature: 0.7 }),
    },
  });

  const fullPrompt = systemPrompt
    ? `${systemPrompt}\n\n${userPrompt}`
    : userPrompt;

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Gemini timeout after 30s")), 30_000)
  );

  const result = await Promise.race([model.generateContent(fullPrompt), timeoutPromise]);
  const text = result.response.text();
  const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();

  return { content: cleaned };
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
    realModel = apiKey ? "claude-sonnet-4-20250514" : "gemini-2.0-flash (fallback)";
  } else if (model === "perplexity-sonar") {
    const apiKey = process.env.PERPLEXITY_API_KEY;
    const res = await callPerplexity(systemPrompt, userPrompt, temperature);
    content = res.content;
    realModel = apiKey ? "sonar-pro" : "gemini-2.0-flash (fallback)";
  } else {
    const res = await callGemini(systemPrompt, userPrompt, jsonMode, maxTokens, temperature);
    content = res.content;
    tokensUsed = res.tokensUsed;
    realModel = "gemini-2.0-flash";
  }

  return {
    content,
    model: realModel,
    processingTimeMs: Date.now() - startTime,
    tokensUsed,
  };
}
