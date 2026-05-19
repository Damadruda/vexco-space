// =============================================================================
// STAGE A — T1 structural metadata classification (Gemini 3 Flash via callLLM).
// Pure enum/tag extraction. NO text generation.
// =============================================================================

import { Type } from "@google/genai";
import { callLLM } from "@/lib/clients/llm";

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

  const response = await callLLM({
    tier: "T1",
    systemPrompt: "",
    userPrompt: prompt,
    jsonMode: true,
    temperature: 0.1,
    responseSchema: STAGE_A_SCHEMA,
  });

  const parsed = JSON.parse(response.content || "{}");
  return {
    documentType: parsed.documentType || "UNCLASSIFIED",
    industry: parsed.industry || null,
    geography: parsed.geography || null,
    outcome: parsed.outcome || null,
  };
}
