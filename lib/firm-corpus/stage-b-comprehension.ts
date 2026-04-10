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
  lifecycleStage: "OWN" | "EXTERNAL" | "ADOPTED" | "ADAPTED" | "DERIVED";
  applicationContext: string | null;
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
          lifecycleStage: {
            type: Type.STRING,
            enum: ["OWN", "EXTERNAL", "ADOPTED", "ADAPTED", "DERIVED"],
          },
          applicationContext: { type: Type.STRING, nullable: true },
        },
        required: ["name", "confidence", "lifecycleStage"],
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

## CLASIFICACION DE PROVENANCE

3. **provenance**: Debes asignar uno de estos 4 valores:
   - OWN: el documento es contenido original creado por Vex&Co (metodologias propias, research propio, case studies de proyectos ejecutados, propuestas comerciales propias, frameworks desarrollados internamente)
   - EXTERNAL: el documento es contenido de terceros que Vex&Co conserva como referencia (frameworks de otros consultores, reports de industria de terceros, papers academicos, libros, articulos de medios)
   - MIXED: el documento combina analisis propio de Vex&Co con citas/adaptaciones extensas de fuentes externas identificables
   - UNKNOWN: no hay senales suficientes para decidir

   Sigue estos 3 pasos en orden:

   PASO 1 — Busca senales de AUTORIA EXTERNA explicita:
   - Menciona un autor, consultora, o empresa distinta de Vex&Co como creador del contenido? (ej: "by McKinsey", "segun Reforge", "Winning by Design establece...")
   - Tiene estructura de paper academico, articulo de medio, o publicacion de terceros (abstract, bibliografia, citas formales)?
   - El titulo coincide con un framework o publicacion conocida de terceros?
   Si hay autoria externa clara → EXTERNAL. Termina aqui.

   PASO 2 — Busca senales de AUTORIA PROPIA de Vex&Co:
   - Menciona explicitamente a Vex&Co, Diego Madruda, o clientes concretos de Vex&Co como protagonistas del contenido?
   - Describe un proyecto ejecutado, una propuesta comercial, un hallazgo especifico de un engagement?
   - Usa primera persona plural ("nosotros", "nuestra metodologia", "nuestro cliente")?
   Si hay autoria propia clara → OWN. Termina aqui.

   PASO 3 — Sin senales claras de ninguno:
   - Si el documento mezcla analisis propio con citas extensas identificables → MIXED
   - Si no hay senales suficientes para decidir → UNKNOWN

   REGLA CRITICA (anti-sesgo OWN):
   El hecho de que el documento este en el Drive de Consulting de Vex&Co NO es evidencia de autoria propia. Diego guarda referentes externos en ese mismo Drive. La autoria debe inferirse del contenido del documento, NO de su ubicacion.

   REGLA #0.5 — Anti-alucinacion:
   Si no estas seguro, usa UNKNOWN. Nunca inventes autoria.

4. **provenanceReasoning**: 1-2 frases explicando POR QUE asignaste esa provenance, citando senales concretas del texto y el paso (1, 2 o 3) que determino la decision.

## DETECCION DE FRAMEWORKS

5. **detectedFrameworks**: Un documento SOLO cuenta como framework si cumple TODOS estos criterios:

   a) **Documentacion sustancial**: el documento dedica al menos una seccion completa (no una mencion de paso) a explicar el framework
   b) **Explicacion del que**: define que es el framework, su proposito, y el problema que resuelve
   c) **Explicacion del como**: describe los pasos, fases, componentes, o artefactos del framework
   d) **Aplicabilidad concreta**: incluye ejemplos, plantillas, criterios de uso, o guias de aplicacion

   NO cuenta como framework:
   - Menciones de paso en un case study ("aplicamos Bow Tie y obtuvimos...")
   - Referencias en bibliografia o fuentes
   - Uso del nombre del framework sin explicacion
   - Listas de metodologias sin desarrollo

   Por cada framework detectado, devuelve:
   - name: nombre canonico del framework
   - originAuthor: persona/empresa que lo creo, si se menciona en el texto
   - originSource: "Vex&Co" si provenance es OWN, o el autor/organizacion si es EXTERNAL
   - componentsHint: breve descripcion de sus etapas/elementos si estan en el texto
   - confidence: 0..1, que tan seguro estas de que el documento documenta sustancialmente este framework (no solo lo menciona). Dado el criterio estricto, solo valores >= 0.7 seran persistidos.
   - lifecycleStage: uno de estos valores:
     - EXTERNAL: framework de terceros documentado sin modificacion
     - OWN: framework creado por Vex&Co desde cero
     - ADOPTED: framework externo que Vex&Co usa tal cual en su practica
     - ADAPTED: framework externo que Vex&Co ha modificado para su contexto
     - DERIVED: framework nuevo de Vex&Co inspirado en uno externo
   - applicationContext: en que contexto lo usa Vex&Co (si se infiere del texto), o null si no se puede determinar

   REGLA #0.5 — Anti-alucinacion:
   Si tienes dudas sobre si algo cuenta como framework documentado, NO lo incluyas. Es mejor perder un verdadero positivo que llenar la base con ruido.`;

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
    detectedFrameworks: (parsed.detectedFrameworks || []).map((fw: Record<string, unknown>) => ({
      ...fw,
      lifecycleStage: fw.lifecycleStage || "EXTERNAL",
      applicationContext: fw.applicationContext || null,
    })),
  };
}
