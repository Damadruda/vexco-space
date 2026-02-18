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

    // Llamada a Claude API con streaming
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY || "",
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-20241022", // Haiku para chat (más rápido y económico)
        max_tokens: 2000,
        stream: true,
        system: systemPrompt,
        messages: [
          { role: "user", content: message }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Claude API error:", errorText);
      throw new Error("Error en la API del asistente");
    }

    // Stream the response - adaptar formato Anthropic a SSE estándar
    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        const encoder = new TextEncoder();

        try {
          let buffer = "";
          while (reader) {
            const { done, value } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            
            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const data = line.slice(6);
                if (data === "[DONE]") continue;
                
                try {
                  const parsed = JSON.parse(data);
                  // Extraer texto del formato Anthropic
                  if (parsed.type === "content_block_delta" && parsed.delta?.text) {
                    // Convertir a formato OpenAI-compatible para el frontend
                    const openAIFormat = {
                      choices: [{ delta: { content: parsed.delta.text } }]
                    };
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(openAIFormat)}\n\n`));
                  }
                } catch (e) {
                  // Ignorar líneas que no son JSON válido
                }
              }
            }
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
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    console.error("Assistant error:", error);
    return NextResponse.json(
      { error: "Error al procesar la solicitud" },
      { status: 500 }
    );
  }
}
