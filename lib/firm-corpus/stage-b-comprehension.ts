// =============================================================================
// STAGE B — Gemini 2.5 Pro stable deep comprehension (T2)
// Text generation with REGLA #0.5 anti-hallucination.
// =============================================================================

import { GoogleGenAI, Type } from "@google/genai";
import type { StageAResult } from "./stage-a-classifier";

export interface KeyEntity {
  name: string;
  type: "COMPANY" | "PERSON" | "PRODUCT" | "FRAMEWORK" | "CONCEPT" | "LOCATION";
}

export interface DetectedFramework {
  name: string;
  originAuthor: string | null;
  originSource: string | null;
  componentsHint: string | null;
  confidence: number;
}

export interface StageBResult {
  extractedSummary: string;
  keyEntities: KeyEntity[];
  provenance: "OWN" | "EXTERNAL" | "MIXED" | "UNKNOWN";
  provenanceReasoning: string;
  detectedFrameworks: DetectedFramework[];
}

const STAGE_B_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    extractedSummary: { type: Type.STRING },
    keyEntities: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          type: {
            type: Type.STRING,
            enum: ["COMPANY", "PERSON", "PRODUCT", "FRAMEWORK", "CONCEPT", "LOCATION"],
          },
        },
        required: ["name", "type"],
      },
    },
    provenance: {
      type: Type.STRING,
      enum: ["OWN", "EXTERNAL", "MIXED", "UNKNOWN"],
    },
    provenanceReasoning: { type: Type.STRING },
    detectedFrameworks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          originAuthor: { type: Type.STRING, nullable: true },
          originSource: { type: Type.STRING, nullable: true },
          componentsHint: { type: Type.STRING, nullable: true },
          confidence: { type: Type.NUMBER },
        },
        required: ["name", "confidence"],
      },
    },
  },
  required: ["extractedSummary", "keyEntities", "provenance", "provenanceReasoning", "detectedFrameworks"],
};

export async function runStageB(
  rawContent: string,
  fileName: string,
  stageAMetadata: StageAResult
): Promise<StageBResult> {
  const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_AI_API_KEY no configurada");

  const ai = new GoogleGenAI({ apiKey });

  const prompt = `Eres un analista de conocimiento institucional para Vex&Co, una consultora boutique B2B. Tu tarea es comprender este documento y extraer metadata profunda con MAXIMA FIDELIDAD al texto fuente.

REGLA #0.5 — ANTI-HALLUCINATION (CRITICA, NO NEGOCIABLE):
- PROHIBIDO inventar nombres de empresas, marcas, productos, personas, lugares, cifras o frameworks que NO aparezcan literalmente en el texto.
- Si una informacion no aparece, devuelve null, array vacio, o UNKNOWN segun el campo.
- Es PREFERIBLE un summary corto y literal que uno completo e inventado.
- Si dudas sobre algo, omitelo. La omision es siempre mejor que la invencion.
- Antes de incluir cualquier nombre propio en keyEntities, verifica que aparece textualmente en el contenido.

NOMBRE DEL ARCHIVO: ${fileName}
METADATA YA CLASIFICADA: ${JSON.stringify(stageAMetadata)}

CONTENIDO DEL DOCUMENTO:
${rawContent.slice(0, 30000)}

Tareas:

1. **extractedSummary** (200-400 palabras): Resumen fiel del contenido. Solo afirmaciones que aparecen en el texto. No interpretes, no extrapoles.

2. **keyEntities**: Lista de entidades textualmente presentes. Solo nombres que aparezcan literalmente. Tipo: COMPANY, PERSON, PRODUCT, FRAMEWORK, CONCEPT, LOCATION.

3. **provenance**: Determina quien produjo este documento:
   - OWN: producido por Vex&Co. Senales: uso de "nosotros/Vex&Co" en primera persona, propuesta firmada por Vex&Co, autoria explicita de Diego Madruda.
   - EXTERNAL: producido por terceros. Senales: autor distinto, logotipos de otras consultoras/empresas, tono de tercera persona, citas a otros como autoridad.
   - MIXED: documento de Vex&Co que cita extensivamente frameworks externos como base.
   - UNKNOWN: no determinable con la informacion disponible.

4. **provenanceReasoning**: 1-2 frases explicando POR QUE asignaste esa provenance, citando senales concretas del texto.

5. **detectedFrameworks**: Si el documento describe, aplica o referencia frameworks/metodologias estructuradas, listalos. Para cada uno:
   - name: nombre del framework (ej: "Bow Tie", "4 Fits", "OST", "Full-Funnel B2B Marketing")
   - originAuthor: persona/empresa que lo creo, si se menciona en el texto
   - originSource: empresa/publicacion/libro de origen, si se menciona
   - componentsHint: breve descripcion de sus etapas/elementos si estan en el texto
   - confidence: 0..1, que tan seguro estas de que es realmente un framework (no solo una mencion casual)

CRITICO sobre frameworks: si el documento es de un autor externo describiendo su propio framework, ese framework es EXTERNAL a Vex&Co. NO atribuyas frameworks externos a Vex&Co aunque el documento este en el corpus de Vex&Co. La presencia de un documento en el corpus no implica autoria.`;

  const result = await ai.models.generateContent({
    model: "gemini-2.5-pro",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: STAGE_B_SCHEMA,
      temperature: 0.2,
      maxOutputTokens: 8000,
    },
  });

  const parsed = JSON.parse(result.text || "{}");
  return {
    extractedSummary: parsed.extractedSummary || "",
    keyEntities: parsed.keyEntities || [],
    provenance: parsed.provenance || "UNKNOWN",
    provenanceReasoning: parsed.provenanceReasoning || "",
    detectedFrameworks: parsed.detectedFrameworks || [],
  };
}
