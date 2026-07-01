// =============================================================================
// INBOX STAGE B — Gemini 3.1 Pro narrative analysis (T2)
// Text generation with REGLA #0.5 anti-hallucination.
// =============================================================================

import { Type } from "@google/genai";
import { callLLM } from "@/lib/clients/llm";
import type { StageAResult } from "./stage-a-classifier";

export interface StageBResult {
  summary: string;
  keyInsights: string[];
  suggestedTags: string[];
  resourceType?: string;   // "HYPE" | "REFERENCE" | "TOOL"
  capability?: string;
  labRelevant?: boolean;
  labTargetType?: string;   // "AGENT_DNA" | "FRAMEWORK" | "CORPUS" | "PRODUCT_BACKLOG"
  labRationale?: string;
  labProposedChange?: string;
}

const STAGE_B_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING },
    keyInsights: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    suggestedTags: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    resourceType: { type: Type.STRING },
    capability: { type: Type.STRING },
    labRelevant: { type: Type.BOOLEAN },
    labTargetType: { type: Type.STRING },
    labRationale: { type: Type.STRING },
    labProposedChange: { type: Type.STRING },
  },
  required: ["summary", "keyInsights", "suggestedTags", "resourceType", "labRelevant"],
};

export async function runInboxStageB(
  sourceTitle: string,
  sourceUrl: string,
  content: string,
  stageAResult: StageAResult
): Promise<StageBResult> {
  const prompt = `Eres un analista estratégico B2B senior de Vex&Co, una consultora boutique que opera entre España y Latinoamérica. Tu tarea es extraer comprensión profunda y fiel del siguiente contenido para que los agentes del Lab lo consuman como contexto.

METADATA PRE-CLASIFICADA (por Stage A):
- Categoría: ${stageAResult.category}
- Relevancia: ${stageAResult.relevanceScore}
- Idioma: ${stageAResult.language}

REGLA #0.5 — FIDELIDAD ABSOLUTA A LA FUENTE (CRÍTICO):
Tu ÚNICA fuente de verdad es el TEXTO FUENTE de abajo. Está terminantemente PROHIBIDO:
- Inventar o fabricar datos.
- Complementar la fuente con tu conocimiento propio o de entrenamiento. Si reconocés la herramienta, empresa, producto o tema del texto y creés saber datos adicionales sobre ellos (cifras, métricas, benchmarks, certificaciones, premios, inversores, clientes, fechas), NO los agregues. Reconocer un tema NO te autoriza a aportar lo que sabés de él.
- Incluir cualquier porcentaje, métrica de rendimiento, resultado de benchmark, certificación, premio, ronda de inversión o nombre de adoptante/cliente que no aparezca EXPLÍCITAMENTE en el texto fuente.
Si el dato no está literalmente en el texto, NO va — aunque lo creas verdadero. La omisión es siempre mejor que la adición. Si la fuente es breve o superficial, tu análisis también lo será: un summary de UNA oración fiel es correcto; uno de tres oraciones enriquecido con datos externos es un FALLO GRAVE.

INSTRUCCIONES:

1. summary: 1 a 3 oraciones, tono C-Level, voz activa, directo.
   - Captura la tesis central SEGÚN EL TEXTO FUENTE, no según lo que sepas del tema.
   - La longitud la dicta la fuente, no un mínimo a alcanzar: si el texto es pobre, UNA oración basta. No estires a 2-3 oraciones rellenando con datos que no están en la fuente.
   - Si el contenido es largo, prioriza el punto más accionable para consultoría B2B.
   - Cero jerga. Palabras prohibidas: sumérgete, tapiz, crucial, descubre, imperativo, revolucionario, sinergias.
   - VERIFICACIÓN OBLIGATORIA antes de devolver: cada afirmación del summary debe poder señalarse en el texto fuente. Si no podés señalar de dónde sale, eliminala.

2. keyInsights: 3-5 hallazgos concretos extraídos del texto.
   - Cada insight: 1 oración concreta.
   - Deben ser ACCIONABLES o APLICABLES al trabajo de una consultora B2B.
   - Si el texto no da para 3 insights genuinos, devuelve menos. Mejor 2 sólidos que 5 inflados.
   - NO inventes insights que el texto no respalda.

3. suggestedTags: 3-8 tags cortos (1-2 palabras cada uno).
   - Tags técnicos/de dominio (ej: "fractional-cxo", "pricing-strategy", "b2b-saas", "contenido-seo").
   - Minúsculas, guiones en vez de espacios.
   - Si el contenido trata sobre design/UX, incluye el tag "design".

4. resourceType: clasificá el contenido en UNO de tres valores exactos:
   - "TOOL": el contenido describe una herramienta, librería, API, SDK, modelo o servicio concreto con una capacidad técnica que podría integrarse al trabajo de un proyecto (ej. una herramienta de scraping, un framework de agentes, una plataforma de datos).
   - "REFERENCE": el contenido es un recurso consultable y reutilizable — un sitio de tendencias, una librería de plantillas, un dataset, una guía metodológica o un framework aplicable.
   - "HYPE": opinión, noticia, hilo, comentario o difusión SIN un recurso o capacidad reutilizable propia. La mayoría del contenido cae acá. NO infles a TOOL/REFERENCE por entusiasmo del autor.

5. capability: SOLO si resourceType es "TOOL" o "REFERENCE". Una o dos oraciones en términos FUNCIONALES: qué problema concreto resuelve o qué permite hacer, redactado para poder cruzarlo contra la necesidad de un proyecto. Ej. para una herramienta de scraping: "Permite scraping dinámico de sitios con render JS y rotación de proxies, sorteando bloqueos anti-bot y rate-limits". Aplicá REGLA #0.5: describí solo capacidades que el texto declara; no agregues funciones que conozcas de la herramienta pero que la fuente no mencione. Si resourceType es "HYPE", devolvé capability vacío.

6. labRelevant / labTargetType / labRationale / labProposedChange — ¿este recurso sirve para mejorar el LAB DE VEX&CO COMO PRODUCTO (el propio sistema multi-agente que operás), no para asesorar un proyecto de cliente?
   - labRelevant = true SOLO si el recurso aporta algo adoptable por el Lab mismo: una técnica de infraestructura o retrieval, un framework/metodología que podría entrar al ADN de un agente, una mejora de UX/diseño del producto, o una capacidad de producto que el Lab podría construir y hoy no tiene. La MAYORÍA de los recursos son false: son combustible para proyectos de cliente, no mejoras al Lab. No infles a true por entusiasmo — mismo criterio estricto que HYPE.
   - Si labRelevant = false: devolvé labTargetType, labRationale y labProposedChange vacíos.
   - Si labRelevant = true:
     - labTargetType: UNO exacto de "AGENT_DNA" (adaptar el consultingDNA de un agente), "FRAMEWORK" (alta o adaptación de un framework), "CORPUS" (conocimiento curado al corpus institucional), "PRODUCT_BACKLOG" (capacidad que el Lab debería construir).
     - labRationale: por qué aplica A VEX&CO ESPECÍFICAMENTE, no la tendencia genérica. Aplicá REGLA #0.5: fundamentá solo con lo que el texto declara.
     - labProposedChange: el cambio concreto propuesto (el delta), 1 a 2 oraciones.

CONTENIDO:
Título: ${sourceTitle}
URL: ${sourceUrl}

${content.slice(0, 20000)}`;

  const result = await callLLM({
    tier: "T2",
    systemPrompt: "",
    userPrompt: prompt,
    jsonMode: true,
    temperature: 0.2,
    maxTokens: 4000,
    responseSchema: STAGE_B_SCHEMA,
  });

  const parsed = JSON.parse(result.content || "{}");
  return {
    summary: parsed.summary || "",
    keyInsights: Array.isArray(parsed.keyInsights) ? parsed.keyInsights : [],
    suggestedTags: Array.isArray(parsed.suggestedTags) ? parsed.suggestedTags : [],
    resourceType: parsed.resourceType || undefined,
    capability: parsed.capability || undefined,
    labRelevant: parsed.labRelevant === true,
    labTargetType: parsed.labTargetType || undefined,
    labRationale: parsed.labRationale || undefined,
    labProposedChange: parsed.labProposedChange || undefined,
  };
}
