import { NextRequest, NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { prisma } from "@/lib/db";
import { jinaClient } from "@/lib/clients/jina";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ANALYSIS_PROMPT = (
  sourceTitle: string,
  sourceUrl: string,
  content: string
) => `Eres un analista estratégico de negocios. Analiza el siguiente contenido y devuelve un JSON con esta estructura exacta:

{
  "summary": "resumen ejecutivo en 2-3 oraciones, tono C-Level, directo",
  "keyInsights": ["insight 1", "insight 2", "insight 3"],
  "suggestedTags": ["tag1", "tag2", "tag3"],
  "category": "project|trend|discovery|noise",
  "sentiment": "positive|negative|neutral|mixed",
  "relevanceScore": 0.0
}

Reglas:
- Escribe con oraciones cortas e impactantes. Voz activa.
- Cero jerga o palabras como "sumérgete", "tapiz", "crucial", "descubre".
- "noise" = contenido irrelevante para decisiones de negocio.
- relevanceScore: 1.0 = altamente relevante para estrategia B2B.
- Devuelve SOLO el JSON, sin markdown ni explicaciones adicionales.

CONTENIDO A ANALIZAR:
Título: ${sourceTitle}
URL: ${sourceUrl}
Contenido: ${content.slice(0, 25_000)}`;

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await getDefaultUserId();

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY no configurada en el servidor" },
        { status: 500 }
      );
    }

    const item = await prisma.inboxItem.findFirst({
      where: { id: params.id, userId },
      include: { analysis: true },
    });

    if (!item) {
      return NextResponse.json(
        { error: "Item no encontrado o no autorizado" },
        { status: 404 }
      );
    }

    // Enrich content via Jina if it's a URL with short rawContent
    let content = item.rawContent;
    let processingStart = Date.now();

    if (item.sourceUrl && item.rawContent.length < 500) {
      try {
        const jinaApiKey = process.env.JINA_API_KEY;
        const extracted = await jinaClient.extractContent(
          item.sourceUrl,
          jinaApiKey
        );
        if (extracted.content) {
          content = extracted.content;
        }
      } catch (jinaError) {
        console.warn("[ANALYZE] Jina extraction failed, using rawContent:", jinaError);
      }
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = ANALYSIS_PROMPT(
      item.sourceTitle ?? item.rawContent.slice(0, 80),
      item.sourceUrl ?? "",
      content
    );

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    const processingTimeMs = Date.now() - processingStart;

    // Parse JSON — strip markdown fences if present
    const cleaned = responseText.replace(/```json\n?|\n?```/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Respuesta de Gemini no contiene JSON válido");
    }

    const aiData = JSON.parse(jsonMatch[0]) as {
      summary: string;
      keyInsights: string[];
      suggestedTags: string[];
      category: string;
      sentiment: string;
      relevanceScore: number;
    };

    // Upsert AnalysisResult (in case of re-analysis)
    const analysis = await prisma.analysisResult.upsert({
      where: { inboxItemId: item.id },
      create: {
        inboxItemId: item.id,
        summary: aiData.summary,
        keyInsights: aiData.keyInsights ?? [],
        suggestedTags: aiData.suggestedTags ?? [],
        category: aiData.category,
        sentiment: aiData.sentiment,
        relevanceScore: aiData.relevanceScore,
        rawAiResponse: responseText,
        modelUsed: "gemini-1.5-flash",
        processingTimeMs,
      },
      update: {
        summary: aiData.summary,
        keyInsights: aiData.keyInsights ?? [],
        suggestedTags: aiData.suggestedTags ?? [],
        category: aiData.category,
        sentiment: aiData.sentiment,
        relevanceScore: aiData.relevanceScore,
        rawAiResponse: responseText,
        modelUsed: "gemini-1.5-flash",
        processingTimeMs,
        updatedAt: new Date(),
      },
    });

    // Mark item as processed
    await prisma.inboxItem.update({
      where: { id: item.id },
      data: { status: "processed", updatedAt: new Date() },
    });

    return NextResponse.json({ analysis });
  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    console.error("[ANALYZE] Error:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
