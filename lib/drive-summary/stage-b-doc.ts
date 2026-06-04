// =============================================================================
// STAGE B — DriveDocSummary narrative comprehension (T2)
// Generates summary + keyInsights with REGLA #0.5 anti-hallucination.
// Uses callLLM (centralized client).
// =============================================================================

import { callLLM } from "@/lib/clients/llm";
import { Type } from "@google/genai";
import type { DriveDocCategory, StageADocResult } from "./stage-a-doc";

export interface StageBDocResult {
  summary: string;          // 500-1000 chars narrative
  keyInsights: string[];    // 3-5 actionable sentences (prefer fewer if doc is thin)
}

const STAGE_B_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING },
    keyInsights: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  required: ["summary", "keyInsights"],
};

const SYSTEM_PROMPT = `Eres un analista experto de Vex&Co, consultora boutique B2B.
Tu tarea es comprender este documento y extraer un resumen narrativo + insights accionables, con MAXIMA FIDELIDAD al texto fuente.

REGLA #0.5 — Anti-hallucination (CRITICA):
PROHIBIDO inventar nombres de empresas, marcas, productos, personas, lugares, cifras, fechas, o frameworks
que NO aparezcan literalmente en el texto fuente. Si una informacion no esta clara, NO la incluyas.
Es preferible un summary breve y un keyInsights corto pero fiel, que uno completo e inventado.
La omision es siempre mejor que la invencion.

REGLA DE FORMATO CRITICA:
- RESPONDE EXCLUSIVAMENTE con JSON valido.
- NO incluyas preambulo, explicacion, comentarios, ni texto antes o despues del JSON.
- NO uses markdown ni code fences (\`\`\`).
- Empieza tu respuesta directamente con el caracter "{" y termina con "}".
- El campo "keyInsights" debe ser un array de 3 a 5 strings. Si el documento no da para 3 insights claros, devuelve 1 o 2 (fidelidad > completitud).`;

function categoryHint(category: DriveDocCategory): string {
  const hints: Record<DriveDocCategory, string> = {
    COMMERCIAL: "documento comercial (propuesta/oferta/SOW)",
    LEGAL: "documento legal (contrato/NDA/acuerdo)",
    STRATEGY: "documento estrategico (plan/roadmap/vision)",
    RESEARCH: "investigacion (estudio/benchmark/analisis)",
    FINANCIAL: "documento financiero (modelo/forecast/P&L)",
    TECHNICAL: "documentacion tecnica (spec/arquitectura/codigo)",
    DESIGN: "documento de diseno (wireframe/mockup/brand)",
    MEETING_NOTES: "acta o transcripcion de reunion",
    COMMUNICATION: "comunicacion (email/memo/briefing)",
    DASHBOARD: "reporte de seguimiento o dashboard",
    OTHER: "documento de tipo no clasificado",
  };
  return hints[category];
}

export async function runStageBDoc(
  rawContent: string,
  fileName: string,
  stageAResult: StageADocResult
): Promise<StageBDocResult> {
  const truncated = rawContent.slice(0, 30000);

  const userPrompt = `NOMBRE DEL ARCHIVO: ${fileName}
TIPO DE DOCUMENTO DETECTADO: ${categoryHint(stageAResult.category)}
IDIOMA DETECTADO: ${stageAResult.language ?? "no identificado"}
CONTIENE DATOS ESTRUCTURADOS: ${stageAResult.hasStructuredData ? "si (tablas/codigo/JSON)" : "no, narrativo"}

CONTENIDO (truncado a 30000 chars):
${truncated}

Genera dos outputs:

1. summary (string entre 500 y 1000 caracteres):
   - Resumen narrativo que captura QUE dice el documento y POR QUE importa para el proyecto.
   - Especifico al contenido real, NO meta-descripcion ("este documento habla de...").
   - Si el documento es corto o ligero, summary mas breve esta bien (minimo 300 chars).
   - Evita frases vacias tipo "el documento aborda diversos temas". Concreta.

2. keyInsights (array de 3-5 strings, preferentemente menos si el doc no da para mas):
   - Cada insight es UNA AFIRMACION ACCIONABLE sobre el contenido del documento.
   - NO descripcion meta. Mal: "El documento aborda la estrategia comercial". Bien: "El cliente decidio postergar el lanzamiento del producto X hasta Q3 por motivos regulatorios identificados en la pagina 4".
   - Si el documento no tiene 3 insights accionables claros, devuelve 1 o 2. Mejor menos y fieles que mas e inventados.
   - Cada insight en una sola frase clara, sin enumeraciones internas ni bullets dentro del string.

REGLA #0.5 aplica a AMBOS outputs: prohibido inventar nombres, cifras, fechas o entidades que no aparezcan en el texto fuente.`;

  const response = await callLLM({
    model: "gemini-pro",
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    jsonMode: true,
    temperature: 0.2,
    maxTokens: 4096,
    responseSchema: STAGE_B_SCHEMA,
  });

  const rawSnippet = response.content.slice(0, 500);

  let parsed: Partial<StageBDocResult>;
  try {
    parsed = JSON.parse(response.content) as Partial<StageBDocResult>;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[STAGE_B] JSON.parse failed for ${fileName}: ${msg}. Raw content (truncated): ${rawSnippet}`);
    throw new Error(`Stage B JSON parse failed for ${fileName}: ${msg} | rawHead: ${rawSnippet.slice(0, 100)}`);
  }

  return {
    summary: parsed.summary ?? "",
    keyInsights: Array.isArray(parsed.keyInsights) ? parsed.keyInsights.slice(0, 5) : [],
  };
}
