// =============================================================================
// STAGE A — Gemini Flash structural metadata classification (T1)
// Pure enum/tag extraction. NO text generation.
// =============================================================================

import { GoogleGenAI, Type } from "@google/genai";

export interface StageAResult {
  documentType: "CASE_STUDY" | "RESEARCH" | "METHODOLOGY" | "UNCLASSIFIED";
  industry: string | null;
  geography: string | null;
  outcome: "WON" | "LOST" | "PAUSED" | "NA" | null;
}

const STAGE_A_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    documentType: {
      type: Type.STRING,
      enum: ["CASE_STUDY", "RESEARCH", "METHODOLOGY", "UNCLASSIFIED"],
    },
    industry: { type: Type.STRING, nullable: true },
    geography: { type: Type.STRING, nullable: true },
    outcome: {
      type: Type.STRING,
      enum: ["WON", "LOST", "PAUSED", "NA"],
      nullable: true,
    },
  },
  required: ["documentType"],
};

export async function runStageA(
  rawContent: string,
  fileName: string
): Promise<StageAResult> {
  const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_AI_API_KEY no configurada");

  const ai = new GoogleGenAI({ apiKey });

  const prompt = `Eres un clasificador estructural de documentos. Tu unica tarea es asignar metadata categorica al documento.

NOMBRE DEL ARCHIVO: ${fileName}

CONTENIDO:
${rawContent.slice(0, 15000)}

Clasifica:
- documentType: CASE_STUDY (proyecto realizado con cliente concreto), RESEARCH (informe de mercado/sector/competencia), METHODOLOGY (framework, modelo o proceso estructurado), UNCLASSIFIED si no encaja.
- industry: sector economico principal (string libre, ej: "Technology", "Retail", "Marketing & Advertising") o null.
- geography: alcance geografico (ej: "Spain", "LATAM", "Spain, LATAM", "Europe", "Global") o null.
- outcome: solo si es CASE_STUDY, indica WON / LOST / PAUSED. Para todo lo demas devuelve NA.

NO inventes valores. Si no puedes determinar algo con seguridad, devuelve null o UNCLASSIFIED.`;

  const result = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: STAGE_A_SCHEMA,
      temperature: 0.1,
    },
  });

  const parsed = JSON.parse(result.text || "{}");
  return {
    documentType: parsed.documentType || "UNCLASSIFIED",
    industry: parsed.industry || null,
    geography: parsed.geography || null,
    outcome: parsed.outcome || null,
  };
}
