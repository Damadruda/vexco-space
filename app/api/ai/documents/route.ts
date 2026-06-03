import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { MODEL_IDS } from "@/lib/clients/llm";
import { GoogleGenAI } from "@google/genai";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type DocumentType =
  | "business_plan"
  | "pitch_deck"
  | "executive_summary"
  | "competitor_report"
  | "market_analysis";

interface DocumentRequest {
  projectId: string;
  documentType: DocumentType;
}

const documentTemplates: Record<DocumentType, { title: string; prompt: string }> = {
  business_plan: {
    title: "Plan de Negocios",
    prompt: `Genera un Plan de Negocios completo y profesional con las siguientes secciones:

1. **Resumen Ejecutivo**
2. **Descripción del Negocio**
3. **Análisis de Mercado**
4. **Análisis Competitivo**
5. **Estrategia de Marketing y Ventas**
6. **Plan Operativo**
7. **Equipo y Organización**
8. **Plan Financiero**
9. **Análisis de Riesgos**
10. **Hoja de Ruta**`,
  },
  pitch_deck: {
    title: "Contenido para Pitch Deck",
    prompt: `Genera el contenido para un Pitch Deck de 10-12 slides:
Slide 1: Portada — Slide 2: El Problema — Slide 3: La Solución — Slide 4: Producto/Servicio —
Slide 5: Modelo de Negocio — Slide 6: Mercado — Slide 7: Competencia — Slide 8: Tracción —
Slide 9: Equipo — Slide 10: Financieros — Slide 11: El Ask — Slide 12: Contacto`,
  },
  executive_summary: {
    title: "Resumen Ejecutivo",
    prompt: `Genera un Resumen Ejecutivo de 1-2 páginas que incluya:
1. Visión General — 2. El Problema — 3. Nuestra Solución — 4. Oportunidad de Mercado —
5. Modelo de Negocio — 6. Ventaja Competitiva — 7. Estado Actual — 8. Equipo —
9. Necesidades de Financiamiento — 10. Proyecciones`,
  },
  competitor_report: {
    title: "Informe de Competencia",
    prompt: `Genera un Informe de Análisis Competitivo detallado:
1. Resumen Ejecutivo — 2. Metodología — 3. Competidores Directos (3-5) — 4. Competidores Indirectos —
5. Matriz Comparativa — 6. Posicionamiento — 7. Tendencias — 8. Oportunidades de Diferenciación —
9. Amenazas — 10. Recomendaciones Estratégicas`,
  },
  market_analysis: {
    title: "Análisis de Mercado",
    prompt: `Genera un Análisis de Mercado completo:
1. Resumen — 2. Definición del Mercado — 3. TAM/SAM/SOM — 4. Crecimiento — 5. Tendencias —
6. Análisis de Demanda — 7. Segmentación — 8. Precios — 9. Canales — 10. Barreras de Entrada —
11. Factores de Éxito — 12. Conclusiones`,
  },
};

export async function POST(request: NextRequest) {
  try {
    const body: DocumentRequest = await request.json();
    const { projectId, documentType } = body;

    if (!projectId || !documentType) {
      return NextResponse.json(
        { success: false, error: "Se requiere projectId y documentType" },
        { status: 400 }
      );
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        notes: { take: 20 },
        links: { take: 20 },
      },
    });

    if (!project) {
      return NextResponse.json(
        { success: false, error: "Proyecto no encontrado" },
        { status: 404 }
      );
    }

    const template = documentTemplates[documentType];
    if (!template) {
      return NextResponse.json(
        { success: false, error: "Tipo de documento no válido" },
        { status: 400 }
      );
    }

    const projectContext = `
PROYECTO: ${project.title}
DESCRIPCIÓN: ${project.description || "No especificada"}
CATEGORÍA: ${project.category || "No especificada"}
ESTADO: ${project.status}

CONCEPTO: ${project.concept || "No definido"}
MERCADO OBJETIVO: ${project.targetMarket || "No definido"}
MODELO DE NEGOCIO: ${project.businessModel || "No definido"}
PLAN DE ACCIÓN: ${project.actionPlan || "No definido"}
RECURSOS: ${project.resources || "No definidos"}

NOTAS: ${project.notes.map((n: any) => `- ${n.title}: ${n.content?.substring(0, 200)}`).join("\n") || "Sin notas"}
ENLACES: ${project.links.map((l: any) => `- ${l.title}: ${l.url}`).join("\n") || "Sin enlaces"}`;

    const systemPrompt = `Eres un consultor de negocios senior con más de 25 años de experiencia. Genera documentos profesionales de alta calidad basados en la información del proyecto. Responde siempre en español. Si falta información, haz suposiciones razonables e indícalo.`;

    const userMessage = `${template.prompt}\n\nINFORMACIÓN DEL PROYECTO:\n${projectContext}`;

    // Gemini streaming
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) {
      throw new Error("GOOGLE_GENERATIVE_AI_API_KEY no configurada");
    }

    const ai = new GoogleGenAI({ apiKey });
    const fullPrompt = `${systemPrompt}\n\n${userMessage}`;

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          const streamIter = await ai.models.generateContentStream({
            model: MODEL_IDS.geminiT2,
            contents: fullPrompt,
            config: { maxOutputTokens: 8192, temperature: 0.7 },
          });

          for await (const chunk of streamIter) {
            const text = chunk.text || "";
            if (text) {
              const openAIFormat = {
                choices: [{ delta: { content: text } }],
              };
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(openAIFormat)}\n\n`)
              );
            }
          }
        } catch (error) {
          console.error("[ai/documents] stream error:", error);
          controller.error(error);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("[ai/documents] error:", error);
    return NextResponse.json(
      { success: false, error: "Error al generar el documento" },
      { status: 500 }
    );
  }
}
