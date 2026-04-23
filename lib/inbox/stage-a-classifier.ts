// =============================================================================
// INBOX STAGE A — Gemini Flash structural classification (T1)
// Pure enum/scoring extraction. NO text generation.
// =============================================================================

import { GoogleGenAI, Type } from "@google/genai";
import type { InboxCorrectionExample } from "./corrections";

export interface StageAResult {
  category: "project" | "trend" | "discovery" | "noise";
  relevanceScore: number;
  sentiment: "positive" | "negative" | "neutral" | "mixed";
  language: "es" | "en" | "other";
}

const STAGE_A_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    category: {
      type: Type.STRING,
      enum: ["project", "trend", "discovery", "noise"],
    },
    relevanceScore: { type: Type.NUMBER },
    sentiment: {
      type: Type.STRING,
      enum: ["positive", "negative", "neutral", "mixed"],
    },
    language: {
      type: Type.STRING,
      enum: ["es", "en", "other"],
    },
  },
  required: ["category", "relevanceScore", "sentiment", "language"],
};

function formatFewShot(examples: InboxCorrectionExample[]): string {
  if (examples.length === 0) return "";
  const lines = examples.map((ex, i) => {
    const tags = ex.tags.length > 0 ? ` | tags: ${ex.tags.join(", ")}` : "";
    return `Ejemplo ${i + 1}:
  Título: ${ex.title}
  Resumen: ${ex.summary}${tags}
  Clasificación correcta (juicio del usuario): ${ex.correctCategory}`;
  });
  return `
CALIBRACIÓN DESDE CORRECCIONES PREVIAS DEL USUARIO:
Estos items fueron clasificados incorrectamente por el LLM en el pasado y el usuario los recategorizó manualmente. Úsalos como guía para entender los criterios reales del usuario:

${lines.join("\n\n")}

Aplica el mismo juicio crítico a este nuevo item.
`;
}

export async function runInboxStageA(
  sourceTitle: string,
  sourceUrl: string,
  content: string,
  userCorrections: InboxCorrectionExample[]
): Promise<StageAResult> {
  const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_AI_API_KEY no configurada");

  const ai = new GoogleGenAI({ apiKey });

  const fewShot = formatFewShot(userCorrections);

  const prompt = `Eres un clasificador estructural de contenido para el Inbox de Vex&Co, una consultora boutique B2B España-LATAM. Tu única tarea es asignar metadata categórica. NO generes resúmenes ni insights — eso lo hace otro módulo.

${fewShot}

CRITERIOS ESTRICTOS DE CATEGORÍA:

- **project**: SOLO si el contenido menciona específicamente una industria, empresa o mercado concreto que coincide con un proyecto activo que Vex&Co esté trabajando. Debe ser literalmente accionable para UN proyecto. Ejemplo: un case study de una empresa del sector target de un proyecto en curso.

- **trend**: SOLO si es análisis estructural de mercado con implicación cross-portfolio. Debe hablar de modelos de negocio, shifts tecnológicos, cambios regulatorios, evolución de pricing, o dinámicas competitivas AMPLIAS. Ejemplo: "Por qué el modelo fractional CxO crece en B2B 2026".

- **discovery**: SOLO si es un hallazgo PUNTUAL y ACCIONABLE cross-portfolio. Típicamente: un referente nuevo (persona, empresa, libro, podcast), un framework nombrado, un caso documentado con lecciones replicables. Ejemplo: "Framework Bow Tie de Winning by Design".

- **noise**: el DEFAULT. Si no encaja firmemente en las otras 3, es noise. Mejor dejar algo en noise (se re-evalúa automáticamente cuando se crean proyectos nuevos) que contaminar con algo irrelevante.

REGLA CRÍTICA: ante duda, siempre noise. El proyecto tiene re-evaluación automática de noise cuando se crean nuevos proyectos. El cross-portfolio es sagrado: un item trend/discovery irrelevante contamina los prompts de TODOS los agentes en TODOS los proyectos.

EXCEPCIÓN: contenido sobre UX/UI, design systems, branding, identidad visual, herramientas de diseño o experiencia de usuario NUNCA es noise. Debe ser trend o discovery.

relevanceScore:
- 0.0-0.3: baja relevancia (noise típico)
- 0.4-0.6: relevancia media (trend/discovery débiles)
- 0.7-0.9: alta relevancia (trend/discovery fuertes o project específico)
- 1.0: perfecto match con el trabajo de Vex&Co

NO inventes valores. Si no puedes determinar sentiment o language con claridad, usa "neutral" y "other" respectivamente.

CONTENIDO A CLASIFICAR:
Título: ${sourceTitle}
URL: ${sourceUrl}
Contenido: ${content.slice(0, 15000)}`;

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
    category: parsed.category || "noise",
    relevanceScore: typeof parsed.relevanceScore === "number" ? parsed.relevanceScore : 0.3,
    sentiment: parsed.sentiment || "neutral",
    language: parsed.language || "other",
  };
}
