// =============================================================================
// INBOX STAGE B — Gemini 2.5 Pro narrative analysis (T2)
// Text generation with REGLA #0.5 anti-hallucination.
// =============================================================================

import { Type } from "@google/genai";
import { callLLM } from "@/lib/clients/llm";
import type { StageAResult } from "./stage-a-classifier";

export interface StageBResult {
  summary: string;
  keyInsights: string[];
  suggestedTags: string[];
  resourceType?: string;   // "HYPE" | "REFERENCE" | "TOOL"
  capability?: string;
}

const STAGE_B_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING },
    keyInsights: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    suggestedTags: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    resourceType: { type: Type.STRING },
    capability: { type: Type.STRING },
  },
  required: ["summary", "keyInsights", "suggestedTags", "resourceType"],
};

export async function runInboxStageB(
  sourceTitle: string,
  sourceUrl: string,
  content: string,
  stageAResult: StageAResult
): Promise<StageBResult> {
  const prompt = `Eres un analista estratégico B2B senior de Vex&Co, una consultora boutique que opera entre España y Latinoamérica. Tu tarea es extraer comprensión profunda y fiel del siguiente contenido para que los agentes del Lab lo consuman como contexto.

METADATA PRE-CLASIFICADA (por Stage A):
- Categoría: ${stageAResult.category}
- Relevancia: ${stageAResult.relevanceScore}
- Idioma: ${stageAResult.language}

REGLA #0.5 — ANTI-ALUCINACIÓN (CRÍTICO):
PROHIBIDO inventar nombres de empresas, marcas, productos, personas, lugares, cifras o frameworks que NO aparezcan literalmente en el texto fuente. Si una información no aparece, omítela. Es preferible un resumen corto y literal que uno completo e inventado. La omisión es siempre mejor que la invención.

INSTRUCCIONES:

1. summary: 2-3 oraciones, tono C-Level, voz activa, directo.
   - Captura la tesis central del contenido, no un resumen descriptivo.
   - Si el contenido es largo, prioriza el punto más accionable para consultoría B2B.
   - Cero jerga. Palabras prohibidas: sumérgete, tapiz, crucial, descubre, imperativo, revolucionario, sinergias.
   - NO inventes contexto adicional. Si el contenido es breve o superficial, el summary también lo será.

2. keyInsights: 3-5 hallazgos concretos extraídos del texto.
   - Cada insight: 1 oración concreta.
   - Deben ser ACCIONABLES o APLICABLES al trabajo de una consultora B2B.
   - Si el texto no da para 3 insights genuinos, devuelve menos. Mejor 2 sólidos que 5 inflados.
   - NO inventes insights que el texto no respalda.

3. suggestedTags: 3-8 tags cortos (1-2 palabras cada uno).
   - Tags técnicos/de dominio (ej: "fractional-cxo", "pricing-strategy", "b2b-saas", "contenido-seo").
   - Minúsculas, guiones en vez de espacios.
   - Si el contenido trata sobre design/UX, incluye el tag "design".

4. resourceType: clasificá el contenido en UNO de tres valores exactos:
   - "TOOL": el contenido describe una herramienta, librería, API, SDK, modelo o servicio concreto con una capacidad técnica que podría integrarse al trabajo de un proyecto (ej. una herramienta de scraping, un framework de agentes, una plataforma de datos).
   - "REFERENCE": el contenido es un recurso consultable y reutilizable — un sitio de tendencias, una librería de plantillas, un dataset, una guía metodológica o un framework aplicable.
   - "HYPE": opinión, noticia, hilo, comentario o difusión SIN un recurso o capacidad reutilizable propia. La mayoría del contenido cae acá. NO infles a TOOL/REFERENCE por entusiasmo del autor.

5. capability: SOLO si resourceType es "TOOL" o "REFERENCE". Una o dos oraciones en términos FUNCIONALES: qué problema concreto resuelve o qué permite hacer, redactado para poder cruzarlo contra la necesidad de un proyecto. Ej. para una herramienta de scraping: "Permite scraping dinámico de sitios con render JS y rotación de proxies, sorteando bloqueos anti-bot y rate-limits". Aplicá REGLA #0.5: no inventes capacidades que el texto no declara. Si resourceType es "HYPE", devolvé capability vacío.

CONTENIDO:
Título: ${sourceTitle}
URL: ${sourceUrl}

${content.slice(0, 20000)}`;

  const result = await callLLM({
    tier: "T2",
    systemPrompt: "",
    userPrompt: prompt,
    jsonMode: true,
    temperature: 0.2,
    maxTokens: 4000,
    responseSchema: STAGE_B_SCHEMA,
  });

  const parsed = JSON.parse(result.content || "{}");
  return {
    summary: parsed.summary || "",
    keyInsights: Array.isArray(parsed.keyInsights) ? parsed.keyInsights : [],
    suggestedTags: Array.isArray(parsed.suggestedTags) ? parsed.suggestedTags : [],
    resourceType: parsed.resourceType || undefined,
    capability: parsed.capability || undefined,
  };
}
