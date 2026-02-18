import { NextRequest, NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type AIAction = 
  | "analyze_link"
  | "summarize_note"
  | "auto_tag"
  | "competitor_analysis"
  | "business_model_suggestions"
  | "action_plan"
  | "market_validation"
  | "generate_document"
  | "project_insights"
  | "chat";

interface AIRequest {
  action: AIAction;
  data: Record<string, unknown>;
  stream?: boolean;
}

const getSystemPrompt = (action: AIAction, context: string): string => {
  const basePrompt = `Eres un experto consultor de negocios y estrategia con más de 20 años de experiencia en B2B, marketing y desarrollo de nuevos negocios. Responde siempre en español, de forma clara, estructurada y orientada a la acción.\n\n${context}`;

  const actionPrompts: Record<AIAction, string> = {
    analyze_link: `${basePrompt}\n\nTu tarea es analizar el contenido de un enlace web y extraer:\n1. Resumen ejecutivo (2-3 oraciones)\n2. Puntos clave (máximo 5)\n3. Relevancia para emprendimiento/negocios\n4. Tags sugeridos (máximo 5)\n\nResponde en formato JSON con las claves: summary, keyPoints, relevance, tags`,
    
    summarize_note: `${basePrompt}\n\nTu tarea es analizar una nota y proporcionar:\n1. Resumen conciso\n2. Ideas principales\n3. Posibles acciones a tomar\n4. Tags sugeridos\n\nResponde en formato JSON con las claves: summary, mainIdeas, suggestedActions, tags`,
    
    auto_tag: `${basePrompt}\n\nTu tarea es generar tags relevantes para el contenido proporcionado. Los tags deben ser:\n- Concisos (1-3 palabras)\n- Relevantes para categorización\n- Útiles para búsqueda\n\nResponde SOLO con un array JSON de strings, máximo 5 tags.`,
    
    competitor_analysis: `${basePrompt}\n\nRealiza un análisis de competencia exhaustivo que incluya:\n1. **Competidores Directos**: Lista de 3-5 competidores principales con análisis de cada uno\n2. **Competidores Indirectos**: Alternativas que resuelven el mismo problema\n3. **Análisis Comparativo**: Tabla de fortalezas/debilidades\n4. **Oportunidades de Diferenciación**: Espacios donde el proyecto puede destacar\n5. **Amenazas del Mercado**: Riesgos competitivos a considerar\n6. **Recomendaciones Estratégicas**: Acciones concretas\n\nSé específico y proporciona ejemplos reales cuando sea posible.`,
    
    business_model_suggestions: `${basePrompt}\n\nAnaliza el proyecto y sugiere modelos de negocio viables:\n1. **Modelos Recomendados**: 3 opciones de modelo de negocio con pros/contras\n2. **Flujos de Ingresos**: Fuentes de monetización potenciales\n3. **Estructura de Costos**: Principales costos a considerar\n4. **Propuesta de Valor**: Cómo articular el valor único\n5. **Canales de Distribución**: Cómo llegar al cliente\n6. **Métricas Clave**: KPIs a seguir\n\nBasado en el mercado objetivo y las tendencias actuales.`,
    
    action_plan: `${basePrompt}\n\nCrea un plan de acción detallado:\n1. **Fase 1 - Validación** (Semanas 1-4)\n   - Tareas específicas con responsables\n   - Hitos y entregables\n2. **Fase 2 - Desarrollo MVP** (Semanas 5-12)\n   - Tareas de desarrollo\n   - Recursos necesarios\n3. **Fase 3 - Lanzamiento** (Semanas 13-16)\n   - Actividades de go-to-market\n   - Métricas de éxito\n4. **Presupuesto Estimado**: Desglose por fase\n5. **Riesgos y Mitigación**: Principales riesgos y cómo manejarlos\n\nSé realista y práctico.`,
    
    market_validation: `${basePrompt}\n\nRealiza un análisis de validación de mercado:\n1. **Tamaño del Mercado**: TAM, SAM, SOM estimados\n2. **Tendencias del Mercado**: Hacia dónde va la industria\n3. **Perfil del Cliente Ideal**: Demografía, psicografía, comportamiento\n4. **Dolor/Necesidad**: Problema específico que se resuelve\n5. **Disposición a Pagar**: Análisis de precios del mercado\n6. **Barreras de Entrada**: Obstáculos a considerar\n7. **Estrategia de Validación**: Experimentos recomendados\n\nUsa datos y ejemplos cuando sea posible.`,
    
    generate_document: `${basePrompt}\n\nGenera un documento profesional y completo basado en la información del proyecto. El documento debe ser:\n- Bien estructurado con secciones claras\n- Profesional y listo para presentar\n- Basado en datos y análisis\n- Orientado a la acción`,
    
    project_insights: `${basePrompt}\n\nAnaliza el estado actual del proyecto y proporciona:\n1. **Resumen de Progreso**: Estado actual y avances\n2. **Fortalezas Identificadas**: Lo que está funcionando bien\n3. **Áreas de Mejora**: Aspectos a trabajar\n4. **Próximos Pasos Recomendados**: 3-5 acciones prioritarias\n5. **Alertas**: Posibles problemas o bloqueos\n\nSé específico basándote en los datos del proyecto.`,
    
    chat: basePrompt
  };

  return actionPrompts[action] || basePrompt;
};

export async function POST(request: NextRequest) {
  try {
    const userId = await getDefaultUserId();
    const body: AIRequest = await request.json();
    const { action, data, stream = false } = body;

    // Build context based on action
    let context = "";
    
    if (data.projectId) {
      const project = await prisma.project.findUnique({
        where: { id: data.projectId as string },
        include: {
          notes: { take: 10 },
          links: { take: 10 },
          images: { take: 5 }
        }
      });
      
      if (project) {
        context = `\n\nProyecto: ${project.title}\nDescripción: ${project.description || "N/A"}\nEstado: ${project.status}\nCategoría: ${project.category || "N/A"}\nConcepto: ${project.concept || "N/A"}\nMercado Objetivo: ${project.targetMarket || "N/A"}\nModelo de Negocio: ${project.businessModel || "N/A"}\nRecursos: ${project.resources || "N/A"}\nNotas asociadas: ${project.notes.length}\nEnlaces guardados: ${project.links.length}`;
      }
    }

    // Add user projects context for general queries
    if (action === "chat" || action === "project_insights") {
      const projects = await prisma.project.findMany({
        where: { userId },
        select: {
          title: true,
          description: true,
          status: true,
          category: true,
          progress: true
        },
        take: 10
      });
      
      if (projects.length > 0) {
        context += `\n\nProyectos del usuario:\n${projects.map(p => 
          `- ${p.title} (${p.status}, ${p.progress}% completado): ${p.description || "Sin descripción"}`
        ).join("\n")}`;
      }
    }

    const systemPrompt = getSystemPrompt(action, context);
    const userMessage = typeof data.content === "string" ? data.content : JSON.stringify(data);

    // Llamada a Claude API
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY || "",
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 4000,
        stream,
        system: systemPrompt,
        messages: [
          { role: "user", content: userMessage }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Claude API error:", errorText);
      throw new Error("Error en la API de Claude");
    }

    if (stream) {
      const streamResponse = new ReadableStream({
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
                    if (parsed.type === "content_block_delta" && parsed.delta?.text) {
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

      return new Response(streamResponse, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive"
        }
      });
    }

    const result = await response.json();
    const content = result.content?.[0]?.text || "";

    // Try to parse JSON responses for structured actions
    if (["analyze_link", "summarize_note", "auto_tag"].includes(action)) {
      try {
        const jsonMatch = content.match(/\[.*\]|\{.*\}/s);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return NextResponse.json({ success: true, data: parsed, raw: content });
        }
      } catch {
        // Return raw content if JSON parsing fails
      }
    }

    return NextResponse.json({ success: true, data: content });

  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    console.error("AI route error:", error);
    return NextResponse.json(
      { success: false, error: "Error al procesar la solicitud de IA" },
      { status: 500 }
    );
  }
}
