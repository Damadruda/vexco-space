// =============================================================================
// NAICS auto-classifier for Project and FirmInsight.
// Stage A-style: Gemini Flash + responseSchema enum cerrado. T1 estructural.
// =============================================================================

import { GoogleGenAI, Type } from "@google/genai";
import { NAICS_CODES, NAICS_SECTORS } from "./naics";

const SECTOR_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    naicsSector: {
      type: Type.STRING,
      enum: [...NAICS_CODES, "UNKNOWN"],
    },
    confidence: {
      type: Type.NUMBER,
    },
    reasoning: {
      type: Type.STRING,
    },
  },
  required: ["naicsSector", "confidence"],
};

const NAICS_REFERENCE_BLOCK = NAICS_SECTORS.map((s) => `${s.code} = ${s.label}`).join("\n");

const CPG_DISCLAIMER = `
REGLA CPG / VERTICAL INTEGRATION:
Empresas con cadena vertical (manufactura + venta) se clasifican por la actividad de mayor margen, usualmente Manufactura (31).
Empresas DTC sin manufactura propia → Comercio Minorista (44).
Distribuidores B2B sin produccion → Comercio Mayorista (42).
Una marca de café que produce y vende: 31. Glossier (DTC sin manufactura): 44. P&G: 31.
`;

export interface SectorClassification {
  naicsSector: string | null;
  confidence: number;
  reasoning: string;
}

async function classifyNaics(
  contextBlock: string,
  entityKind: "project" | "insight"
): Promise<SectorClassification> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    console.warn("[NAICS_CLASSIFIER] No API key — skipping classification");
    return { naicsSector: null, confidence: 0, reasoning: "no_api_key" };
  }

  const ai = new GoogleGenAI({ apiKey });

  const transversalNote = entityKind === "insight"
    ? `\n\nIMPORTANTE PARA INSIGHTS: si el insight es metodologico/funcional (ej. "validar pricing con entrevistas", "patron de discovery", "tactica de retencion"), devuelve UNKNOWN — no es sectorial.`
    : "";

  const prompt = `Eres un clasificador NAICS 2-digit para Vex&Co Lab. Tu unica tarea es asignar UN codigo NAICS de 2 digitos al ${entityKind} descrito abajo.

CODIGOS NAICS DISPONIBLES (2-digit):
${NAICS_REFERENCE_BLOCK}

UNKNOWN = no puedes determinar con seguridad o el ${entityKind} es transversal/no-sectorial.

${CPG_DISCLAIMER}${transversalNote}

REGLA #0.5 — ANTI-ALUCINACION:
NO inventes informacion que no este en el texto. Si tienes dudas, devuelve UNKNOWN con confidence 0.3.

CONTENIDO DEL ${entityKind.toUpperCase()}:
${contextBlock.slice(0, 6000)}

Devuelve JSON con:
- naicsSector: codigo de 2 digitos o "UNKNOWN"
- confidence: numero 0.0-1.0 (0.7+ = alta certeza, 0.4-0.7 = dudoso, <0.4 = muy bajo)
- reasoning: 1 frase corta justificando la eleccion`;

  try {
    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: SECTOR_SCHEMA,
        temperature: 0.1,
      },
    });

    const parsed = JSON.parse(result.text || "{}");
    const sector = parsed.naicsSector === "UNKNOWN" ? null : parsed.naicsSector;
    return {
      naicsSector: sector,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
      reasoning: parsed.reasoning || "",
    };
  } catch (err) {
    console.warn("[NAICS_CLASSIFIER] Failed:", err);
    return { naicsSector: null, confidence: 0, reasoning: "error" };
  }
}

export async function classifyProjectSector(input: {
  title: string;
  description?: string | null;
  concept?: string | null;
  targetMarket?: string | null;
}): Promise<SectorClassification> {
  const block = [
    `Titulo: ${input.title}`,
    input.description ? `Descripcion: ${input.description}` : "",
    input.concept ? `Concepto: ${input.concept}` : "",
    input.targetMarket ? `Mercado objetivo: ${input.targetMarket}` : "",
  ].filter(Boolean).join("\n");
  return classifyNaics(block, "project");
}

export async function classifyInsightSector(input: {
  title: string;
  content: string;
  functionalDomain?: string | null;
}): Promise<SectorClassification> {
  const block = [
    `Titulo: ${input.title}`,
    `Contenido: ${input.content}`,
    input.functionalDomain ? `Dominio funcional: ${input.functionalDomain}` : "",
  ].filter(Boolean).join("\n");
  return classifyNaics(block, "insight");
}
