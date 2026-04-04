import { NextRequest, NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { prisma } from "@/lib/db";
import { callLLM } from "@/lib/clients/llm";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// POST: Re-evaluate noise items against a new project
export async function POST(request: NextRequest) {
  try {
    const userId = await getDefaultUserId();
    const { projectId } = (await request.json()) as { projectId: string };

    if (!projectId) {
      return NextResponse.json({ error: "projectId requerido" }, { status: 400 });
    }

    const project = await prisma.project.findFirst({
      where: { id: projectId, userId },
      select: {
        id: true,
        title: true,
        description: true,
        concept: true,
        targetMarket: true,
        businessModel: true,
      },
    });

    if (!project) {
      return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
    }

    // Load noise items
    const noiseItems = await prisma.inboxItem.findMany({
      where: {
        userId,
        analysis: { category: "noise" },
      },
      include: { analysis: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    if (noiseItems.length === 0) {
      return NextResponse.json({
        results: [],
        totalEvaluated: 0,
        totalRelevant: 0,
        projectTitle: project.title,
        message: "No hay items clasificados como noise",
      });
    }

    // Build project context
    const projectContext = [
      `Nombre: ${project.title}`,
      project.description ? `Descripción: ${project.description}` : null,
      project.concept ? `Concepto: ${project.concept}` : null,
      project.targetMarket ? `Mercado: ${project.targetMarket}` : null,
      project.businessModel ? `Modelo: ${project.businessModel}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    // Build items list
    const itemsList = noiseItems
      .map((item, i) => {
        const title = item.sourceTitle || item.rawContent?.slice(0, 100) || "Sin título";
        const summary = item.analysis?.summary || "";
        const tags = (item.analysis?.suggestedTags ?? []).join(", ");
        return `[${i}] Título: ${title}${summary ? `\nResumen: ${summary}` : ""}${tags ? `\nTags: ${tags}` : ""}`;
      })
      .join("\n\n");

    const prompt = `Eres un analista de conocimiento para una firma de consultoría B2B.

PROYECTO NUEVO:
${projectContext}

ITEMS PENDIENTES DE CLASIFICAR:
Estos items fueron clasificados como "noise" (irrelevantes) cuando no existía este proyecto.
Ahora que el proyecto existe, re-evalúa cada uno.

${itemsList}

Para CADA item, responde si ahora es relevante para este proyecto.

Responde con JSON:
{
  "evaluations": [
    {
      "index": 0,
      "relevant": true,
      "suggestedCategory": "project",
      "reason": "Directamente aplicable al mercado objetivo del proyecto"
    },
    {
      "index": 1,
      "relevant": false,
      "reason": "Sigue sin ser relevante"
    }
  ]
}

CRITERIOS:
- "relevant: true" solo si el item aporta valor CONCRETO al proyecto (no conexiones forzadas)
- suggestedCategory: "project" si es específico, "trend" si es tendencia amplia, "discovery" si es hallazgo
- Sé selectivo — es mejor dejar algo como noise que forzar relevancia
- Si menos del 20% de items son relevantes, eso es normal`;

    const response = await callLLM({
      model: "gemini-flash",
      systemPrompt:
        "Eres un analista estratégico. Devuelve SOLO JSON válido, sin markdown ni explicaciones.",
      userPrompt: prompt,
      jsonMode: true,
      temperature: 0.3,
      maxTokens: 4096,
    });

    // Parse response
    interface Evaluation {
      index: number;
      relevant: boolean;
      suggestedCategory?: string;
      reason?: string;
    }

    let evaluations: Evaluation[] = [];
    try {
      const parsed = JSON.parse(response.content);
      evaluations = parsed.evaluations || [];
    } catch {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        evaluations = parsed.evaluations || [];
      }
    }

    // Map results to original items
    const results = evaluations
      .filter((e) => e.relevant === true)
      .map((e) => {
        const item = noiseItems[e.index];
        if (!item) return null;
        return {
          itemId: item.id,
          title: item.sourceTitle || item.rawContent?.slice(0, 100) || "Sin título",
          currentSummary: item.analysis?.summary || "",
          suggestedCategory: e.suggestedCategory || "project",
          reason: e.reason || "",
        };
      })
      .filter(Boolean);

    return NextResponse.json({
      results,
      totalEvaluated: noiseItems.length,
      totalRelevant: results.length,
      projectTitle: project.title,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[RE-EVALUATE]", msg);
    return NextResponse.json({ error: "Error al re-evaluar items" }, { status: 500 });
  }
}
