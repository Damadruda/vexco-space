import { NextRequest, NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const userId = await getDefaultUserId();
    const body = await request.json();
    const { message, context } = body;

    // Get user's projects for context
    const projects = await prisma.project.findMany({
      where: { userId },
      select: {
        title: true,
        description: true,
        status: true,
        category: true,
        concept: true,
        targetMarket: true,
        businessModel: true
      },
      take: 5
    });

    const projectsContext = projects?.length > 0
      ? `\n\nContexto de los proyectos del usuario:\n${projects.map((p) => 
          `- ${p.title}: ${p.description || "Sin descripción"} (Estado: ${p.status})`
        ).join("\n")}`
      : "";

    const systemPrompt = `Eres un asistente experto en emprendimiento y gestión de proyectos. Tu rol es ayudar a emprendedores a:
- Validar y mejorar sus ideas de negocio
- Crear planes de acción estructurados
- Analizar la viabilidad de proyectos
- Dar consejos prácticos basados en su contexto

Responde siempre en español, de forma clara y estructurada. Sé práctico y orientado a la acción.
${projectsContext}
${context ? `\nContexto adicional: ${context}` : ""}`;

    const response = await fetch("https://apps.abacus.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.ABACUSAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message }
        ],
        stream: true,
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      throw new Error("Error en la API del asistente");
    }

    // Stream the response
    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        const encoder = new TextEncoder();

        try {
          while (reader) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value);
            controller.enqueue(encoder.encode(chunk));
          }
        } catch (error) {
          console.error("Stream error:", error);
          controller.error(error);
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      }
    });
  } catch (error) {
    console.error("Assistant error:", error);
    return NextResponse.json(
      { error: "Error al procesar la solicitud" },
      { status: 500 }
    );
  }
}
