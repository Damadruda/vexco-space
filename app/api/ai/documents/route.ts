import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type DocumentType = "business_plan" | "pitch_deck" | "executive_summary" | "competitor_report" | "market_analysis";

interface DocumentRequest {
  projectId: string;
  documentType: DocumentType;
}

const documentTemplates: Record<DocumentType, { title: string; prompt: string }> = {
  business_plan: {
    title: "Plan de Negocios",
    prompt: `Genera un Plan de Negocios completo y profesional con las siguientes secciones:

1. **Resumen Ejecutivo**
   - Visión general del negocio
   - Propuesta de valor
   - Objetivos principales

2. **Descripción del Negocio**
   - Misión y visión
   - Modelo de negocio
   - Estructura legal recomendada

3. **Análisis de Mercado**
   - Tamaño del mercado
   - Tendencias
   - Segmentación de clientes

4. **Análisis Competitivo**
   - Competidores principales
   - Ventajas competitivas
   - Posicionamiento

5. **Estrategia de Marketing y Ventas**
   - Estrategia de precios
   - Canales de distribución
   - Plan de promoción

6. **Plan Operativo**
   - Procesos clave
   - Recursos necesarios
   - Proveedores

7. **Equipo y Organización**
   - Estructura organizacional
   - Roles clave
   - Plan de contratación

8. **Plan Financiero**
   - Proyecciones de ingresos (3 años)
   - Estructura de costos
   - Punto de equilibrio
   - Necesidades de financiamiento

9. **Análisis de Riesgos**
   - Riesgos identificados
   - Estrategias de mitigación

10. **Hoja de Ruta**
    - Hitos principales
    - Timeline de implementación`
  },
  pitch_deck: {
    title: "Contenido para Pitch Deck",
    prompt: `Genera el contenido para un Pitch Deck de 10-12 slides:

**Slide 1: Portada**
- Nombre del proyecto
- Tagline impactante

**Slide 2: El Problema**
- Problema que resolvemos
- Dolor del cliente
- Magnitud del problema

**Slide 3: La Solución**
- Nuestra propuesta
- Cómo resolvemos el problema
- Beneficios clave

**Slide 4: Producto/Servicio**
- Descripción detallada
- Características principales
- Screenshots/mockups sugeridos

**Slide 5: Modelo de Negocio**
- Cómo generamos ingresos
- Pricing
- Unit economics

**Slide 6: Mercado**
- TAM, SAM, SOM
- Crecimiento del mercado
- Tendencias

**Slide 7: Competencia**
- Panorama competitivo
- Nuestra diferenciación
- Ventajas competitivas

**Slide 8: Tracción**
- Métricas actuales (o proyectadas)
- Hitos alcanzados
- Testimonios/casos de éxito

**Slide 9: Equipo**
- Fundadores y roles
- Experiencia relevante
- Advisors

**Slide 10: Financieros**
- Proyecciones de ingresos
- Runway actual
- Métricas clave

**Slide 11: El Ask**
- Cuánto necesitamos
- Uso de fondos
- Términos

**Slide 12: Contacto**
- Información de contacto
- Call to action`
  },
  executive_summary: {
    title: "Resumen Ejecutivo",
    prompt: `Genera un Resumen Ejecutivo de 1-2 páginas que incluya:

**1. Visión General del Negocio** (1 párrafo)
- Qué hacemos y para quién

**2. El Problema** (1 párrafo)
- Problema que resolvemos
- Por qué es importante

**3. Nuestra Solución** (1-2 párrafos)
- Cómo lo resolvemos
- Propuesta de valor única

**4. Oportunidad de Mercado** (1 párrafo)
- Tamaño del mercado
- Potencial de crecimiento

**5. Modelo de Negocio** (1 párrafo)
- Cómo generamos dinero
- Principales fuentes de ingreso

**6. Ventaja Competitiva** (1 párrafo)
- Qué nos hace diferentes
- Barreras de entrada

**7. Estado Actual y Tracción** (1 párrafo)
- Dónde estamos
- Logros hasta la fecha

**8. Equipo** (1 párrafo)
- Quiénes somos
- Por qué estamos calificados

**9. Necesidades de Financiamiento** (1 párrafo)
- Cuánto necesitamos
- Para qué lo usaremos

**10. Proyecciones** (datos clave)
- Revenue proyectado
- Métricas de crecimiento`
  },
  competitor_report: {
    title: "Informe de Competencia",
    prompt: `Genera un Informe de Análisis Competitivo detallado:

**1. Resumen Ejecutivo**
- Panorama competitivo general
- Principales hallazgos

**2. Metodología de Análisis**
- Criterios de selección de competidores
- Fuentes de información

**3. Competidores Directos** (3-5 empresas)
Para cada uno:
- Nombre y descripción
- Productos/servicios
- Modelo de negocio
- Fortalezas
- Debilidades
- Precios
- Market share estimado

**4. Competidores Indirectos** (2-3 empresas)
- Alternativas que resuelven el mismo problema
- Análisis breve de cada uno

**5. Matriz Comparativa**
- Tabla de características
- Comparación de precios
- Comparación de valor

**6. Análisis de Posicionamiento**
- Mapa de posicionamiento
- Espacios no atendidos

**7. Tendencias Competitivas**
- Hacia dónde va el mercado
- Movimientos recientes de competidores

**8. Oportunidades de Diferenciación**
- Espacios donde podemos destacar
- Nichos desatendidos

**9. Amenazas y Riesgos**
- Riesgos competitivos
- Barreras de entrada

**10. Recomendaciones Estratégicas**
- Acciones concretas
- Prioridades`
  },
  market_analysis: {
    title: "Análisis de Mercado",
    prompt: `Genera un Análisis de Mercado completo:

**1. Resumen Ejecutivo**
- Principales hallazgos
- Oportunidad identificada

**2. Definición del Mercado**
- Alcance del mercado
- Segmentos incluidos

**3. Tamaño del Mercado**
- TAM (Total Addressable Market)
- SAM (Serviceable Available Market)
- SOM (Serviceable Obtainable Market)
- Metodología de cálculo

**4. Crecimiento del Mercado**
- Tasa de crecimiento histórica
- Proyecciones futuras
- Drivers de crecimiento

**5. Tendencias del Mercado**
- Tendencias tecnológicas
- Tendencias de consumo
- Tendencias regulatorias

**6. Análisis de la Demanda**
- Perfil del cliente ideal
- Comportamiento de compra
- Necesidades no satisfechas

**7. Segmentación del Mercado**
- Segmentos identificados
- Características de cada segmento
- Tamaño de cada segmento

**8. Análisis de Precios**
- Rangos de precios del mercado
- Disposición a pagar
- Estrategias de precios de competidores

**9. Canales de Distribución**
- Canales principales
- Tendencias en distribución

**10. Barreras de Entrada**
- Barreras identificadas
- Requisitos regulatorios
- Capital necesario

**11. Factores de Éxito**
- Factores críticos
- Mejores prácticas

**12. Conclusiones y Recomendaciones**
- Oportunidad validada
- Próximos pasos recomendados`
  }
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
        links: { take: 20 }
      }
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

CONCEPTO:
${project.concept || "No definido"}

MERCADO OBJETIVO:
${project.targetMarket || "No definido"}

MODELO DE NEGOCIO:
${project.businessModel || "No definido"}

PLAN DE ACCIÓN:
${project.actionPlan || "No definido"}

RECURSOS:
${project.resources || "No definidos"}

NOTAS DEL PROYECTO:
${project.notes.map((n: any) => `- ${n.title}: ${n.content?.substring(0, 200)}...`).join("\n") || "Sin notas"}

ENLACES GUARDADOS:
${project.links.map((l: any) => `- ${l.title}: ${l.url}`).join("\n") || "Sin enlaces"}
`;

    const systemPrompt = `Eres un consultor de negocios senior con más de 25 años de experiencia. Tu tarea es generar documentos profesionales de alta calidad basados en la información del proyecto proporcionada.

Responde siempre en español. El documento debe ser:
- Profesional y listo para presentar
- Basado en la información real del proyecto
- Completo pero conciso
- Orientado a la acción

Si falta información crítica, haz suposiciones razonables basadas en el contexto e indícalo claramente.`;

    const userMessage = `${template.prompt}\n\nINFORMACIÓN DEL PROYECTO:\n${projectContext}`;

    const response = await fetch("https://apps.abacus.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.ABACUSAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4.1",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage }
        ],
        stream: true,
        max_tokens: 8000,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      throw new Error("Error en la API de IA");
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
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      }
    });

  } catch (error) {
    console.error("Document generation error:", error);
    return NextResponse.json(
      { success: false, error: "Error al generar el documento" },
      { status: 500 }
    );
  }
}
