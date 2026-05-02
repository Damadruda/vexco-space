// =============================================================================
// NAICS auto-classifier for Project and FirmInsight.
// T2 analytical: Gemini 2.5 Pro stable + responseSchema enum cerrado.
// Bug A v2: migrado de Flash a Pro tras evidencia de anchoring fuerte
// (Flash devolvía confidence 90% uniforme con sesgo a 54 a pesar de
// instrucciones explícitas de perspectiva cliente final).
// =============================================================================

import { Type } from "@google/genai";
import { callLLM } from "@/lib/clients/llm";
import { NAICS_CODES, NAICS_SECTORS } from "./naics";

const SECTOR_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    subject: {
      type: Type.STRING,
      enum: ["VEXCO_OPERATING", "EXTERNAL_CLIENT", "HORIZONTAL_OFFER", "METHODOLOGICAL"],
      description: "Quien es el sujeto del proyecto/insight: Vex&Co operando, cliente externo, oferta horizontal, o contenido metodológico.",
    },
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
  required: ["subject", "naicsSector", "confidence", "reasoning"],
};

const NAICS_REFERENCE_BLOCK = NAICS_SECTORS.map((s) => `${s.code} = ${s.label}`).join("\n");

export interface SectorClassification {
  naicsSector: string | null;
  confidence: number;
  reasoning: string;
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildPrompt(contextBlock: string, entityKind: "project" | "insight"): string {
  const insightExtraCase = entityKind === "insight"
    ? `

CASO ESPECÍFICO PARA INSIGHTS (subject: METHODOLOGICAL):
Si el insight describe un patrón metodológico, una táctica, un framework, una lección operativa o un principio transversal sin sector específico (ej. "validar pricing con entrevistas", "patrón de discovery", "modalidad Fractional supera Sprint en cliente con capital alto", "regla de empaquetado para corporativos"), el subject es METHODOLOGICAL y naicsSector debe ser UNKNOWN con confidence 0.3. Estos insights son transversales por naturaleza — sirven a TODOS los sectores y NO deben anclarse a uno solo.`
    : "";

  return `# CLASSIFIER NAICS PARA VEX&CO LAB — PROTOCOLO OBLIGATORIO

## SUJETO ANTES QUE SECTOR

Tu tarea NO es clasificar este ${entityKind} en un sector NAICS directamente. Tu tarea es PRIMERO identificar el sujeto, y SOLO DESPUÉS asignar sector.

Vex&Co es una consultora boutique. Si clasificas todo lo que Vex&Co toca en 54 (Servicios Profesionales y Consultoría), no aportas señal cross-portfolio al Lab — todo terminaría siendo 54 y eso es ruido, no información. La información útil para el Lab es el sector del CLIENTE FINAL al que sirve cada proyecto, no el sector operativo de Vex&Co.

## CUATRO TIPOS DE SUJETO (clasifica primero)

**A. EXTERNAL_CLIENT** — el ${entityKind} sirve a un cliente externo identificable (banco, retailer, edtech, fabricante, hospital, etc.).
   → naicsSector = sector del CLIENTE, NO de Vex&Co.
   → 54 NUNCA es la respuesta aquí (excepto el caso raro donde el cliente externo es literalmente otra consultora vendiendo a sus propios clientes).
   → confidence típico: 0.7-0.95 según claridad de identificación del cliente.

**B. VEXCO_OPERATING** — el ${entityKind} es operación interna de Vex&Co (herramienta propia tipo Lab, framework propio, IP, marca propia, contenido editorial de Vex&Co, importación de archivos genérica desde Drive).
   → naicsSector = UNKNOWN, confidence = 0.3.
   → Indicadores: descripciones que mencionan "Vex&Co", "Lab", "importación automática", "platforma interna", "framework propio", o son títulos genéricos sin cliente.

**C. HORIZONTAL_OFFER** — el ${entityKind} es una oferta de servicios de Vex&Co que sirve indiferentemente a múltiples sectores (ej. "Fractional CxO para empresas medianas", "metodología de pricing B2B", "Sprint de discovery").
   → naicsSector = UNKNOWN, confidence = 0.3.
   → Indicadores: descripciones que NO mencionan un cliente específico ni un vertical, sino un tipo de servicio aplicable a varios sectores.${insightExtraCase}

## REGLA ANTI-54-DEFAULT (crítica)

Si tu razonamiento te lleva a 54, ANTES de devolverlo verifica:
- ¿El sujeto del proyecto es Vex&Co operando, o un cliente externo siendo servido?
- Si es Vex&Co operando → subject=VEXCO_OPERATING o HORIZONTAL_OFFER, naicsSector=UNKNOWN.
- Si es cliente externo → subject=EXTERNAL_CLIENT, naicsSector=sector del cliente. Y ese sector NUNCA es 54 (porque el cliente paga a consultores como Vex&Co, no es consultor él mismo).

54 solo es respuesta correcta cuando el cliente externo es literalmente OTRA consultora (caso raro, ej. SERVICEPHERE si su cliente final son integradores SAP que son consultores).

## EJEMPLOS CALIBRADOS

### Ejemplo 1 — Cliente externo bancario
Input: "BANGE: estrategia de banca puente España-África con 11M€ inyectados, plan 2025-2030"
Output:
{
  "subject": "EXTERNAL_CLIENT",
  "naicsSector": "52",
  "confidence": 0.95,
  "reasoning": "Sujeto: cliente externo (BANGE, banco transcontinental). Vex&Co opera para él. Sector del cliente: 52 Servicios Financieros. NO 54 porque BANGE no es consultora, es banco."
}

### Ejemplo 2 — Operación interna Vex&Co
Input: "CONSULTING: Importación automática de 29 archivos desde Google Drive"
Output:
{
  "subject": "VEXCO_OPERATING",
  "naicsSector": "UNKNOWN",
  "confidence": 0.3,
  "reasoning": "Sujeto: Vex&Co operando internamente. La descripción es genérica (importación de archivos), no hay cliente externo identificable. Caso B."
}

### Ejemplo 3 — Oferta horizontal Vex&Co
Input: "Fractional CxO: Oferta de servicios fraccionales que amplía el alcance del Consulting hacia industrias donde no tengo experiencia directa"
Output:
{
  "subject": "HORIZONTAL_OFFER",
  "naicsSector": "UNKNOWN",
  "confidence": 0.3,
  "reasoning": "Sujeto: oferta horizontal de Vex&Co. Sirve a múltiples sectores indiferentemente, no hay cliente vertical específico. Caso C."
}

### Ejemplo 4 — Cliente externo retail
Input: "Comparador de precios para supermercados en tiempo real: aplicación web que permite seleccionar entre cadenas y mostrar precios"
Output:
{
  "subject": "EXTERNAL_CLIENT",
  "naicsSector": "44",
  "confidence": 0.85,
  "reasoning": "Sujeto: cliente externo (supermercados, retailers). El producto sirve al sector retail aunque sea entregado vía web. Sector: 44 Comercio Minorista."
}

### Ejemplo 5 — Contenido editorial sectorial
Input: "ANTARCTIC TALKS: divulgación y plataforma editorial de pensamiento enfocada en regiones polares"
Output:
{
  "subject": "EXTERNAL_CLIENT",
  "naicsSector": "51",
  "confidence": 0.85,
  "reasoning": "Sujeto: cliente externo (audiencia editorial de regiones polares). Aunque el operador sea cercano a Vex&Co, el proyecto es contenido sectorial de medios. Sector: 51 Información y Medios."
}

### Ejemplo 6 — Insight metodológico (solo si entityKind es insight)
Input (insight): "El modelo Consultora Tradicional + Red de Expertos fracasa si se vende como staffing o bolsa de horas. Debe empaquetarse como Consultoría Core + Células Ágiles de Implementación Tech."
Output:
{
  "subject": "METHODOLOGICAL",
  "naicsSector": "UNKNOWN",
  "confidence": 0.3,
  "reasoning": "Sujeto: principio metodológico transversal sobre modelo de empaquetado de consultoría. Aplica a cualquier sector. No tiene anclaje sectorial. Caso D."
}

### Ejemplo 7 — Cliente externo que ES consultora (caso 54 legítimo)
Input: "Plataforma de gestión para integradores SAP que centraliza proyectos, pagos y documentación"
Output:
{
  "subject": "EXTERNAL_CLIENT",
  "naicsSector": "54",
  "confidence": 0.7,
  "reasoning": "Sujeto: cliente externo (integradores SAP). Estos son consultores tecnológicos B2B. 54 es respuesta correcta aquí porque el cliente final ES literalmente otra consultora. Caso raro pero legítimo."
}

## CALIBRACIÓN DE CONFIDENCE (obligatoria)

- **0.9-0.95**: cliente externo identificado con claridad, sector inequívoco (ej. BANGE = banco = 52).
- **0.7-0.85**: cliente externo identificable pero con ambigüedad menor (varios sectores plausibles, eliges el más probable).
- **0.3**: subject = VEXCO_OPERATING, HORIZONTAL_OFFER o METHODOLOGICAL. Confidence baja por diseño porque la respuesta es UNKNOWN.
- **0.4-0.6**: caso ambiguo donde dudas entre cliente externo y operación interna. Por defecto en duda elige UNKNOWN con confidence 0.4 (preferimos falsos negativos sobre falsos positivos).

NO devuelvas confidence 0.9 en TODOS los casos. Si te encuentras devolviendo 0.9 uniforme en una batch, estás haciendo anchoring — recalibra.

## REGLA #0.5 — ANTI-ALUCINACIÓN

NO inventes información que no esté en el texto. Si el texto es vago ("plataforma", "herramienta") y no permite identificar cliente final, devuelve subject=VEXCO_OPERATING o HORIZONTAL_OFFER con UNKNOWN. Es preferible UNKNOWN que un sector inventado.

## CÓDIGOS NAICS DISPONIBLES (referencia)

${NAICS_REFERENCE_BLOCK}

UNKNOWN = subject ∈ {VEXCO_OPERATING, HORIZONTAL_OFFER, METHODOLOGICAL} o ambigüedad real.

## CONTENIDO A CLASIFICAR

${entityKind.toUpperCase()}:
${contextBlock.slice(0, 6000)}

## OUTPUT

Devuelve JSON con los 4 campos del schema:
- subject: VEXCO_OPERATING | EXTERNAL_CLIENT | HORIZONTAL_OFFER | METHODOLOGICAL
- naicsSector: codigo de 2 dígitos o "UNKNOWN"
- confidence: número 0.0-1.0 calibrado según las reglas de arriba
- reasoning: 1-2 frases. PRIMERA frase debe declarar el sujeto explícitamente ("Sujeto: ..."). SEGUNDA frase justifica el sector elegido o el UNKNOWN.`;
}

// ─── Core classification call ─────────────────────────────────────────────────

async function classifyNaics(
  contextBlock: string,
  entityKind: "project" | "insight"
): Promise<SectorClassification> {
  const prompt = buildPrompt(contextBlock, entityKind);

  try {
    const response = await callLLM({
      model: "gemini-pro-stable",
      systemPrompt: "",
      userPrompt: prompt,
      jsonMode: true,
      responseSchema: SECTOR_SCHEMA,
      temperature: 0.0,
      maxTokens: 1024,
    });

    const parsed = JSON.parse(response.content || "{}");
    const sector = parsed.naicsSector === "UNKNOWN" ? null : parsed.naicsSector;
    const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0;
    const reasoning = parsed.reasoning || "";
    const subject = parsed.subject || "UNKNOWN";

    // Tag el subject en el reasoning para que sea visible en /sectors/review
    const enrichedReasoning = `[${subject}] ${reasoning}`;

    // Sanity check: si el modelo cae en fallback Flash, log warning para detectar
    if (response.model && response.model.includes("flash")) {
      console.warn("[NAICS_CLASSIFIER] Pro fallback to Flash detected — output may have anchoring bias", {
        sector,
        confidence,
        subject,
      });
    }

    return {
      naicsSector: sector,
      confidence,
      reasoning: enrichedReasoning,
    };
  } catch (err) {
    console.warn("[NAICS_CLASSIFIER] Failed:", err);
    return { naicsSector: null, confidence: 0, reasoning: "[ERROR] classifier failed" };
  }
}

// ─── Public API (preserva las firmas previas) ─────────────────────────────────

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
