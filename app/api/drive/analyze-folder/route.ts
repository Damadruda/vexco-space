import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // 2 minutos para procesar carpetas grandes

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  path?: string;
  children?: DriveFile[];
}

interface ExtractedContent {
  fileName: string;
  content: string;
  mimeType: string;
}

// Exportar Google Docs/Sheets/Slides a texto
async function exportGoogleFile(fileId: string, mimeType: string, accessToken: string): Promise<string> {
  let exportMimeType = "text/plain";
  
  if (mimeType === "application/vnd.google-apps.spreadsheet") {
    exportMimeType = "text/csv";
  } else if (mimeType === "application/vnd.google-apps.presentation") {
    exportMimeType = "text/plain";
  }
  
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(exportMimeType)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` }
    }
  );
  
  if (!response.ok) {
    console.error(`Error exporting file ${fileId}:`, await response.text());
    return "";
  }
  
  return await response.text();
}

// Descargar archivo binario y extraer texto (PDFs, etc.)
async function downloadAndExtractText(fileId: string, mimeType: string, accessToken: string): Promise<string> {
  // Para PDFs, descargamos y extraemos texto básico
  // En producción podrías usar una librería como pdf-parse
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    {
      headers: { Authorization: `Bearer ${accessToken}` }
    }
  );
  
  if (!response.ok) {
    return "";
  }
  
  // Para archivos de texto plano
  if (mimeType.startsWith("text/")) {
    return await response.text();
  }
  
  // Para PDFs y otros, retornamos indicación del archivo
  // Una mejora futura sería usar pdf-parse o similar
  return `[Archivo: ${mimeType}]`;
}

// Extraer contenido de un archivo
async function extractFileContent(file: DriveFile, accessToken: string): Promise<ExtractedContent | null> {
  const { id, name, mimeType } = file;
  
  try {
    let content = "";
    
    // Google Docs
    if (mimeType === "application/vnd.google-apps.document") {
      content = await exportGoogleFile(id, mimeType, accessToken);
    }
    // Google Sheets
    else if (mimeType === "application/vnd.google-apps.spreadsheet") {
      content = await exportGoogleFile(id, mimeType, accessToken);
    }
    // Google Slides
    else if (mimeType === "application/vnd.google-apps.presentation") {
      content = await exportGoogleFile(id, mimeType, accessToken);
    }
    // PDFs y archivos de texto
    else if (mimeType === "application/pdf" || mimeType.startsWith("text/")) {
      content = await downloadAndExtractText(id, mimeType, accessToken);
    }
    // Otros archivos - solo mencionamos que existen
    else {
      return null;
    }
    
    if (!content || content.trim().length === 0) {
      return null;
    }
    
    return { fileName: name, content: content.slice(0, 10000), mimeType }; // Limitar a 10k chars por archivo
    
  } catch (error) {
    console.error(`Error extracting content from ${name}:`, error);
    return null;
  }
}

// Procesar archivos recursivamente
async function processFilesRecursively(files: DriveFile[], accessToken: string): Promise<ExtractedContent[]> {
  const contents: ExtractedContent[] = [];
  
  for (const file of files) {
    if (file.mimeType === "application/vnd.google-apps.folder" && file.children) {
      // Procesar subcarpetas
      const childContents = await processFilesRecursively(file.children, accessToken);
      contents.push(...childContents);
    } else {
      // Extraer contenido del archivo
      const extracted = await extractFileContent(file, accessToken);
      if (extracted) {
        contents.push(extracted);
      }
    }
  }
  
  return contents;
}

// Analizar contenido con IA
async function analyzeWithAI(contents: ExtractedContent[], folderName: string): Promise<any> {
  const combinedContent = contents
    .map(c => `--- ${c.fileName} ---\n${c.content}`)
    .join("\n\n");
  
  const systemPrompt = `Eres un experto consultor de negocios con más de 20 años de experiencia. 
Tu tarea es analizar el contenido de una carpeta de proyecto y extraer información estructurada.

Analiza los documentos proporcionados y extrae la siguiente información para cada campo.
Si no encuentras información para un campo, déjalo como null.
Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional.

Estructura requerida:
{
  "title": "Nombre del proyecto (inferido de los documentos)",
  "description": "Descripción general del proyecto (2-3 oraciones)",
  "category": "Categoría del proyecto (ej: SaaS, E-commerce, Consultoría, etc.)",
  "tags": ["tag1", "tag2", "tag3"],
  
  "concept": "Paso 1 - Concepto: ¿Cuál es la idea central del proyecto?",
  "problemSolved": "¿Qué problema específico resuelve?",
  
  "targetMarket": "Paso 2 - Mercado objetivo: ¿Quiénes son los clientes ideales?",
  "marketValidation": "¿Qué validación de mercado existe o se necesita?",
  
  "businessModel": "Paso 3 - Modelo de negocio: ¿Cómo genera ingresos?",
  "valueProposition": "¿Cuál es la propuesta de valor única?",
  
  "actionPlan": "Paso 4 - Plan de acción: ¿Cuáles son los próximos pasos?",
  "milestones": "¿Cuáles son los hitos principales?",
  
  "resources": "Paso 5 - Recursos: ¿Qué recursos se necesitan?",
  "metrics": "¿Qué métricas se deben seguir?",
  
  "currentStep": 1,
  "insights": "Observaciones adicionales o recomendaciones basadas en el análisis"
}`;

  const userMessage = `Analiza el contenido de la carpeta "${folderName}" y extrae la información del proyecto:

${combinedContent.slice(0, 50000)}`;

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
      max_tokens: 4000,
      temperature: 0.3 // Más determinista para extracción de datos
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("AI API error:", errorText);
    throw new Error("Error en la API de IA");
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content || "";
  
  // Extraer JSON de la respuesta
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error("Error parsing AI response:", e);
  }
  
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    
    const accessToken = (session.user as any).accessToken;
    const userId = (session.user as any).id;
    
    if (!accessToken) {
      return NextResponse.json({ 
        error: "No hay token de Google Drive",
        needsGoogleAuth: true 
      }, { status: 401 });
    }
    
    const { folderId, folderName, createProject = true } = await request.json();
    
    if (!folderId) {
      return NextResponse.json({ error: "folderId es requerido" }, { status: 400 });
    }
    
    // 1. Obtener todos los archivos de la carpeta
    const folderResponse = await fetch(
      `${request.nextUrl.origin}/api/drive/folder?folderId=${folderId}`,
      {
        headers: {
          Cookie: request.headers.get("cookie") || ""
        }
      }
    );
    
    if (!folderResponse.ok) {
      const error = await folderResponse.json();
      return NextResponse.json(error, { status: folderResponse.status });
    }
    
    const { files, stats } = await folderResponse.json();
    
    if (!files || files.length === 0) {
      return NextResponse.json({ 
        error: "La carpeta está vacía",
        stats 
      }, { status: 400 });
    }
    
    // 2. Extraer contenido de los archivos
    const extractedContents = await processFilesRecursively(files, accessToken);
    
    if (extractedContents.length === 0) {
      return NextResponse.json({ 
        error: "No se pudo extraer contenido de ningún archivo. Asegúrate de que la carpeta contenga documentos de Google Docs, Sheets o archivos de texto.",
        stats 
      }, { status: 400 });
    }
    
    // 3. Analizar con IA
    const analysis = await analyzeWithAI(extractedContents, folderName || "Proyecto");
    
    if (!analysis) {
      return NextResponse.json({ 
        error: "No se pudo analizar el contenido con IA",
        extractedFiles: extractedContents.length,
        stats 
      }, { status: 500 });
    }
    
    // 4. Crear proyecto si se solicita
    let project = null;
    if (createProject) {
      project = await prisma.project.create({
        data: {
          title: analysis.title || folderName || "Proyecto importado",
          description: analysis.description || null,
          category: analysis.category || null,
          tags: analysis.tags || [],
          status: "idea",
          priority: "medium",
          progress: 0,
          
          // Framework de 5 pasos
          concept: analysis.concept || null,
          problemSolved: analysis.problemSolved || null,
          targetMarket: analysis.targetMarket || null,
          marketValidation: analysis.marketValidation || null,
          businessModel: analysis.businessModel || null,
          valueProposition: analysis.valueProposition || null,
          actionPlan: analysis.actionPlan || null,
          milestones: analysis.milestones || null,
          resources: analysis.resources || null,
          metrics: analysis.metrics || null,
          currentStep: analysis.currentStep || 1,
          
          userId
        }
      });
      
      // Crear una nota con los insights del análisis
      if (analysis.insights) {
        await prisma.note.create({
          data: {
            title: "Análisis IA - Importación desde Drive",
            content: `## Análisis del proyecto\n\n${analysis.insights}\n\n---\n\n**Archivos analizados:** ${extractedContents.length}\n**Carpeta origen:** ${folderName || folderId}`,
            category: "Análisis IA",
            tags: ["importado", "análisis-ia", "google-drive"],
            userId,
            projectId: project.id
          }
        });
      }
    }
    
    return NextResponse.json({
      success: true,
      analysis,
      project,
      stats: {
        ...stats,
        filesAnalyzed: extractedContents.length,
        filesExtracted: extractedContents.map(c => c.fileName)
      }
    });
    
  } catch (error) {
    console.error("Error analyzing folder:", error);
    return NextResponse.json({ 
      error: "Error interno del servidor",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
}
