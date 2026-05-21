// =============================================================================
// STAGE A — DriveDocSummary structural classification (T1)
// Pure enum extraction. NO text generation. Uses callLLM (centralized client).
// =============================================================================

import { callLLM } from "@/lib/clients/llm";

export type DriveDocCategory =
  | "COMMERCIAL"
  | "LEGAL"
  | "STRATEGY"
  | "RESEARCH"
  | "FINANCIAL"
  | "TECHNICAL"
  | "DESIGN"
  | "MEETING_NOTES"
  | "COMMUNICATION"
  | "DASHBOARD"
  | "OTHER";

export interface StageADocResult {
  category: DriveDocCategory;
  language: string | null;        // ISO 639-1 code (es, en, pt...) or null
  hasStructuredData: boolean;     // true if contains meaningful tables/code/JSON
}

const STAGE_A_SCHEMA = {
  type: "object",
  properties: {
    category: {
      type: "string",
      enum: [
        "COMMERCIAL",
        "LEGAL",
        "STRATEGY",
        "RESEARCH",
        "FINANCIAL",
        "TECHNICAL",
        "DESIGN",
        "MEETING_NOTES",
        "COMMUNICATION",
        "DASHBOARD",
        "OTHER",
      ],
    },
    language: {
      type: "string",
      description: "ISO 639-1 code (es, en, pt...) or empty string if undetermined",
    },
    hasStructuredData: { type: "boolean" },
  },
  required: ["category", "language", "hasStructuredData"],
};

const SYSTEM_PROMPT = `Eres un clasificador estructural de documentos de proyectos consultor B2B.
Tu unica tarea es asignar metadata categorica al documento.
NO generes texto narrativo. NO inventes valores. Si no puedes determinar algo con seguridad, devuelve el valor mas conservador.

REGLA DE FORMATO CRITICA:
- RESPONDE EXCLUSIVAMENTE con JSON valido.
- NO incluyas preambulo, explicacion, comentarios, ni texto antes o despues del JSON.
- NO uses markdown ni code fences (\`\`\`).
- Empieza tu respuesta directamente con el caracter "{" y termina con "}".
- Si tienes dudas sobre un campo, usa el valor por defecto definido en las instrucciones, NO expliques tu razonamiento.`;

export async function runStageADoc(
  rawContent: string,
  fileName: string
): Promise<StageADocResult> {
  const truncated = rawContent.slice(0, 15000);

  const userPrompt = `NOMBRE DEL ARCHIVO: ${fileName}

CONTENIDO (truncado a 15000 chars):
${truncated}

Clasifica el documento en las siguientes dimensiones:

1. category — selecciona UNA categoria que mejor describa el documento:
   - COMMERCIAL: propuesta, presupuesto, oferta, SOW, pitch comercial
   - LEGAL: contrato, NDA, MSA, terminos, acuerdo legal
   - STRATEGY: plan estrategico, OKR, roadmap, vision, framework de decision
   - RESEARCH: estudio de mercado, benchmark, paper, analisis competitivo
   - FINANCIAL: modelo financiero, P&L, presupuesto, forecast, valoracion
   - TECHNICAL: especificacion tecnica, arquitectura, codigo documentado, API docs
   - DESIGN: wireframe, mockup, brand guideline, design system, UI spec
   - MEETING_NOTES: acta de reunion, transcripcion, follow-up de meeting
   - COMMUNICATION: email, memo, briefing, comunicado interno
   - DASHBOARD: reporte de seguimiento, KPIs visualizados, status report
   - OTHER: si no encaja claramente en ninguna de las anteriores

2. language — codigo ISO 639-1 del idioma principal del documento (ej: "es", "en", "pt"). Si el documento mezcla idiomas, devuelve el dominante. Si no puedes determinarlo con seguridad, devuelve null.

3. hasStructuredData — true SOLO si el documento contiene tablas significativas, bloques de codigo, o JSON/CSV estructurado que representa una parte importante de su contenido. false para documentos puramente narrativos.

Responde SOLO con JSON valido segun el esquema.`;

  const response = await callLLM({
    model: "gemini-flash",
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    jsonMode: true,
    temperature: 0.1,
    maxTokens: 256,
    responseSchema: STAGE_A_SCHEMA,
  });

  // Defensive logging: capture raw content before parse to diagnose schema/preamble issues
  const rawSnippet = response.content.slice(0, 500);
  console.log(`[STAGE_A] ${fileName} raw response (first 500 chars):`, rawSnippet);

  let parsed: Partial<StageADocResult>;
  try {
    parsed = JSON.parse(response.content) as Partial<StageADocResult>;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[STAGE_A] JSON.parse failed for ${fileName}: ${msg}. Raw content (truncated): ${rawSnippet}`);
    throw new Error(`Stage A JSON parse failed for ${fileName}: ${msg} | rawHead: ${rawSnippet.slice(0, 100)}`);
  }

  // language: "" treated as null at app level (LLM cannot return literal null without nullable:true)
  const languageRaw = typeof parsed.language === "string" ? parsed.language.trim() : "";
  return {
    category: (parsed.category as DriveDocCategory) ?? "OTHER",
    language: languageRaw.length > 0 ? languageRaw : null,
    hasStructuredData: parsed.hasStructuredData ?? false,
  };
}
