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

  const PERSPECTIVA_BLOCK = `
PERSPECTIVA OBLIGATORIA — leer antes de clasificar:

Vex&Co es una consultora boutique que SIEMPRE opera desde el sector 54 (Servicios Profesionales y Consultoria). Tu tarea NO es clasificar el sector de Vex&Co — siempre seria 54 y eso no aporta senal cross-portfolio para el Lab.

Tu tarea ES clasificar el sector del CLIENTE FINAL al que sirve este ${entityKind}. La pregunta operativa que tienes que responder es:
"En que sector NAICS opera la empresa, segmento o audiencia al que el output de este ${entityKind} esta destinado?"

CASOS:

A. ${entityKind === "project" ? "Proyecto" : "Insight de proyecto"} sirve a un cliente externo identificable (un banco, un retailer, una edtech, un fabricante, etc.):
   → Clasifica el sector del CLIENTE, NO el de Vex&Co.
   → 54 NUNCA es la respuesta correcta en este caso. Si tu razonamiento te lleva a 54, revisa: estas clasificando a Vex&Co (54) o a su cliente (otro sector)?

B. ${entityKind === "project" ? "Proyecto" : "Insight"} es operacion interna de Vex&Co (herramienta propia, framework propio, IP, oferta general de servicios sin vertical, marca propia, contenido editorial de Vex&Co):
   → Devuelve UNKNOWN con confidence 0.3. Estos son transversales por diseno y NO necesitan sector NAICS.

C. ${entityKind === "project" ? "Proyecto" : "Insight"} es oferta horizontal que sirve a multiples sectores indistintamente (ej. "Fractional CxO para empresas medianas en general", "metodologia de pricing para B2B"):
   → Devuelve UNKNOWN con confidence 0.3. Es transversal.

D. ${entityKind === "insight" ? `Insight es metodologico/funcional (ej. "validar pricing con entrevistas", "patron de discovery", "tactica de retencion", "lesson learned operativa"):
   → Devuelve UNKNOWN con confidence 0.3. Es transversal por naturaleza, no sectorial.` : ""}

REGLA ANTI-54-DEFAULT (critica):
Si el ${entityKind} describe a Vex&Co haciendo consultoria/servicio profesional (lo cual es siempre cierto porque Vex&Co es consultora), eso NO es senal de sector. La senal de sector esta en QUIEN paga el servicio o lee el output, no en QUE hace Vex&Co. Antes de devolver 54, verifica: el sujeto del proyecto es Vex&Co o su cliente?

EJEMPLOS CALIBRADOS:
- "BANGE: estrategia de banca puente Espana-Africa con 11M€ inyectados" → 52 (Servicios Financieros). El cliente es un banco. NO 54.
- "Comparador de precios para supermercados" → 44 (Comercio Minorista). El cliente son los supermercados. NO 54.
- "Plataforma de gestion para integradores SAP" → si los integradores SAP son los usuarios y son consultores → 54 (excepcion legitima, el cliente vertical es la consultoria). Si en cambio la plataforma sirve a las empresas que contratan a los integradores → sector de esas empresas.
- "Vex&Co Lab" (operacion interna) → UNKNOWN. Sin cliente externo.
- "Fractional CxO" (oferta horizontal de Vex&Co) → UNKNOWN. Transversal.
- "Antarctic Talks: contenido editorial sobre regiones polares" → 51 (Informacion y Medios). El sector del proyecto es el del contenido publicado, no el de Vex&Co.
`;

  const prompt = `Eres un clasificador NAICS 2-digit para Vex&Co Lab. Tu unica tarea es asignar UN codigo NAICS de 2 digitos al ${entityKind} descrito abajo, desde la perspectiva del cliente final.

${PERSPECTIVA_BLOCK}

CODIGOS NAICS DISPONIBLES (2-digit):
${NAICS_REFERENCE_BLOCK}

UNKNOWN = no puedes determinar con seguridad, ${entityKind} es transversal/no-sectorial, o ${entityKind} es operacion interna de Vex&Co.

${CPG_DISCLAIMER}

REGLA #0.5 — ANTI-ALUCINACION:
NO inventes informacion que no este en el texto. Si tienes dudas, devuelve UNKNOWN con confidence 0.3.

CONTENIDO DEL ${entityKind.toUpperCase()}:
${contextBlock.slice(0, 6000)}

Devuelve JSON con:
- naicsSector: codigo de 2 digitos o "UNKNOWN"
- confidence: numero 0.0-1.0 (0.7+ = alta certeza, 0.4-0.7 = dudoso, <0.4 = muy bajo o caso B/C/D del bloque PERSPECTIVA)
- reasoning: 1-2 frases. Si elegiste un sector, declara explicitamente "Cliente final: [tipo]". Si elegiste UNKNOWN, indica si es por caso B (interno), C (horizontal), D (metodologico), o ambiguedad real.`;

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
