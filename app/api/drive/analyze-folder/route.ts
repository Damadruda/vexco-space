import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { GoogleGenAI } from "@google/genai";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel function timeout

// ============================================================
// Gemini Client (reemplaza Anthropic Claude API)
// ============================================================
const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

// ============================================================
// Tipos
// ============================================================
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

// ============================================================
// System Prompt - PM Ágil con Framework 4 Fases
// ============================================================
const PM_AGIL_SYSTEM_PROMPT = `# ROL
Eres un Product Manager senior con 20 años de experiencia en metodologías ágiles (Scrum, Kanban, Lean Startup, Shape Up). Tu especialidad es transformar información fragmentada en roadmaps ejecutables.

# INSTRUCCIONES
Analiza el contenido de una carpeta de Google Drive que contiene documentos de un proyecto. Tu tarea es:

1. **CLASIFICAR** el tipo de proyecto en UNA de estas 4 categorías:
   - **tech_product**: SaaS, App, Plataforma digital (ingresos: suscripción, licencia, freemium)
   - **service**: Consultoría, Agencia, Profesional (ingresos: por hora, proyecto, retainer)
   - **commerce**: E-commerce, Marketplace, Retail (ingresos: venta de productos, comisiones)
   - **content**: Media, Educación, Comunidad (ingresos: ads, sponsors, membresía, cursos)

   Algoritmo de clasificación:
   - Busca indicadores en los documentos: tecnologías mencionadas → tech_product, clientes/propuestas → service, productos/catálogo → commerce, contenido/audiencia → content
   - Si hay ambigüedad, elige la categoría con más evidencia

2. **DETERMINAR LA FASE** actual del proyecto según este framework:
   - **idea**: Concepto sin validar, solo documentación inicial, sin producto ni usuarios reales
   - **active**: En desarrollo activo, tiene MVP o prototipo, buscando product-market fit
   - **operational**: Funcionando con usuarios/clientes reales, generando ingresos o tracción medible
   - **completed**: Proyecto finalizado, entregado al cliente, o descontinuado

3. **GENERAR MILESTONES** adaptados al tipo de proyecto:

   ### tech_product (5 milestones)
   1. Definición → Problema validado, usuario definido, propuesta clara
   2. Validación → Entrevistas, landing, lista de espera, LOIs
   3. MVP → Funcionalidad core, primeros usuarios reales
   4. Product-Market Fit → Retención, NPS >40, revenue inicial
   5. Escala → Growth loops, unit economics positivos

   ### service (4 milestones)
   1. Propuesta → Oferta clara, pricing, diferenciación
   2. Piloto → 1-3 clientes piloto, case studies
   3. Sistematización → Procesos, templates, equipo
   4. Crecimiento → Pipeline, partnerships, expansión

   ### commerce (5 milestones)
   1. Producto → Catálogo, pricing, proveedores
   2. Plataforma → Tienda operativa, pagos, logística
   3. Lanzamiento → Marketing inicial, primeras ventas
   4. Optimización → Conversión, CAC/LTV, inventario
   5. Escala → Nuevos canales, categorías, geografías

   ### content (4 milestones)
   1. Estrategia → Nicho, formato, calendario editorial
   2. Producción → Contenido inicial, distribución
   3. Audiencia → 1000 true fans, engagement
   4. Monetización → Revenue streams activados

4. **EVALUAR CADA MILESTONE**: Analiza los documentos y marca qué milestones están completados según la evidencia encontrada.

5. **CALCULAR PROGRESO**: % general basado en milestones completados vs totales.

6. **ANÁLISIS TÉCNICO** (si hay código): Detecta stack tecnológico, frameworks, dependencias.

# OUTPUT
Responde ÚNICAMENTE con un JSON válido (sin markdown, sin backticks, sin texto adicional):

{
  "title": "Nombre del proyecto",
  "description": "Descripción breve (2-3 oraciones)",
  "category": "Categoría general del proyecto",
  "tags": ["tag1", "tag2", "tag3"],
  "projectType": "tech_product | service | commerce | content",
  "currentPhase": "idea | active | operational | completed",
  "overallProgress": 0-100,

  "concept": "Paso 1 - Concepto del proyecto",
  "problemSolved": "Problema principal que resuelve",
  "targetMarket": "Mercado objetivo y segmentos",
  "marketValidation": "Estado de validación de mercado",
  "businessModel": "Modelo de negocio identificado",
  "valueProposition": "Propuesta de valor única",
  "actionPlan": "Resumen del plan de acción",
  "resources": "Recursos necesarios identificados",
  "metrics": "Métricas clave sugeridas",
  "currentStep": 1-5,

  "milestones": [
    {
      "title": "Nombre del milestone",
      "description": "Qué significa completar este milestone",
      "order": 1,
      "isCompleted": false
    }
  ],

  "insights": "Análisis cualitativo del estado del proyecto. Fortalezas, debilidades, patrones detectados, recomendaciones. Mínimo 3 párrafos con observaciones profundas y accionables.",
  "nextActions": ["Acción 1 específica", "Acción 2 específica", "Acción 3 específica"],
  "blockers": ["Bloqueante identificado"],
  "confidence": "high | medium | low",

  "techStack": {
    "frontend": ["tecnologías detectadas"],
    "backend": ["tecnologías detectadas"],
    "database": ["bases de datos detectadas"],
    "infrastructure": ["infraestructura detectada"],
    "other": ["otras tecnologías"]
  },
  "techSummary": "Resumen técnico si hay código, null si no",
  "techRecommendations": "Recomendaciones técnicas si hay código, null si no"
}

# REGLAS
- Si no hay suficiente información para un campo, usa null para strings y [] para arrays
- Cada milestone debe tener title, description, order e isCompleted
- El progreso general se calcula: (milestones completados / total milestones) * 100
- Las nextActions deben ser específicas y accionables, no genéricas
- Los insights deben ser profundos y útiles, mínimo 3 párrafos
- La confianza (confidence) refleja cuánta información tenías para el análisis
- Si detectas archivos de código (marcados con [CÓDIGO]), analiza el stack tecnológico
- Si no hay código, deja techStack, techSummary y techRecommendations como null
`;

// ============================================================
// Funciones de extracción de contenido desde Google Drive
// ============================================================

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

// Descargar archivo y extraer texto
async function downloadAndExtractText(fileId: string, mimeType: string, accessToken: string): Promise<string> {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    {
      headers: { Authorization: `Bearer ${accessToken}` }
    }
  );
  
  if (!response.ok) {
    return "";
  }
  
  if (mimeType.startsWith("text/")) {
    return await response.text();
  }
  
  return `[Archivo: ${mimeType}]`;
}

// Extensiones de código soportadas
const CODE_EXTENSIONS: Record<string, string> = {
  ".js": "javascript",
  ".jsx": "javascript",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".mjs": "javascript",
  ".py": "python",
  ".html": "html",
  ".css": "css",
  ".scss": "scss",
  ".json": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".env": "env",
  ".env.local": "env",
  ".env.example": "env",
  ".md": "markdown",
  ".mdx": "markdown",
  ".sql": "sql",
  ".sh": "shell",
  ".dockerfile": "dockerfile",
};

// Archivos de config importantes
const IMPORTANT_FILES = [
  "package.json",
  "requirements.txt",
  "pyproject.toml",
  "Cargo.toml",
  "go.mod",
  "README.md",
  "README",
  ".env.example",
];

// Verificar si es un archivo de código
function isCodeFile(fileName: string): boolean {
  const lowerName = fileName.toLowerCase();
  
  if (IMPORTANT_FILES.some(f => lowerName === f.toLowerCase())) {
    return true;
  }
  
  const ext = "." + lowerName.split(".").pop();
  return ext in CODE_EXTENSIONS;
}

// Descargar archivo de código de Google Drive
async function downloadCodeFile(fileId: string, accessToken: string): Promise<string> {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    {
      headers: { Authorization: `Bearer ${accessToken}` }
    }
  );
  
  if (!response.ok) {
    console.error(`Error downloading code file ${fileId}:`, await response.text());
    return "";
  }
  
  return await response.text();
}

// Extraer contenido de un archivo
async function extractFileContent(file: DriveFile, accessToken: string): Promise<ExtractedContent | null> {
  const { id, name, mimeType } = file;
  
  try {
    let content = "";
    
    if (mimeType === "application/vnd.google-apps.document") {
      content = await exportGoogleFile(id, mimeType, accessToken);
    } else if (mimeType === "application/vnd.google-apps.spreadsheet") {
      content = await exportGoogleFile(id, mimeType, accessToken);
    } else if (mimeType === "application/vnd.google-apps.presentation") {
      content = await exportGoogleFile(id, mimeType, accessToken);
    } else if (mimeType === "application/pdf" || mimeType.startsWith("text/")) {
      content = await downloadAndExtractText(id, mimeType, accessToken);
    } else if (isCodeFile(name)) {
      content = await downloadCodeFile(id, accessToken);
      if (content) {
        const ext = "." + name.toLowerCase().split(".").pop();
        const lang = CODE_EXTENSIONS[ext] || "code";
        content = `[CÓDIGO - ${lang}]\n${content}`;
      }
    } else {
      return null;
    }
    
    if (!content || content.trim().length === 0) {
      return null;
    }
    
    return { fileName: name, content: content.slice(0, 10000), mimeType };
    
  } catch (error) {
    console.error(`Error extracting content from ${name}:`, error);
    return null;
  }
}

// Procesar archivos en paralelo (antes: secuencial con for-loop)
async function processFilesRecursively(files: DriveFile[], accessToken: string): Promise<ExtractedContent[]> {
  const promises: Promise<ExtractedContent | null>[] = [];
  
  for (const file of files) {
    if (file.mimeType === "application/vnd.google-apps.folder" && file.children) {
      // Recursión para subcarpetas (se resuelve en paralelo también)
      promises.push(
        processFilesRecursively(file.children, accessToken).then(results => results as any)
      );
    } else {
      promises.push(extractFileContent(file, accessToken));
    }
  }
  
  const results = await Promise.all(promises);
  
  // Aplanar resultados (subcarpetas devuelven arrays) y filtrar nulls
  return results.flat().filter((r): r is ExtractedContent => r !== null);
}

// ============================================================
// Análisis con Gemini (antes: Anthropic Claude API)
// ============================================================
async function analyzeWithAI(contents: ExtractedContent[], folderName: string): Promise<any> {
  const combinedContent = contents
    .map(c => `--- ${c.fileName} ---\n${c.content}`)
    .join("\n\n");

  const userMessage = `Analiza el contenido de la carpeta "${folderName}" y extrae la información del proyecto según el framework PM Ágil:\n\n${combinedContent.slice(0, 30000)}`;

  // Llamada a Gemini API — Flash para velocidad en importación
  const response = await gemini.models.generateContent({
    model: "gemini-1.5-flash",
    contents: userMessage,
    config: {
      systemInstruction: PM_AGIL_SYSTEM_PROMPT,
      maxOutputTokens: 4000,
      temperature: 0.3,
      // Forzar output JSON nativo de Gemini
      responseMimeType: "application/json",
    },
  });

  const rawText = response.text?.trim();

  if (!rawText) {
    console.error("Gemini devolvió respuesta vacía");
    return null;
  }

  // Limpiar posibles backticks de markdown (por seguridad)
  const cleanText = rawText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    const analysis = JSON.parse(cleanText);

    // Validar y normalizar campos críticos
    if (!analysis.title) analysis.title = folderName;
    if (!analysis.projectType) analysis.projectType = "tech_product";
    if (!["idea", "active", "operational", "completed"].includes(analysis.currentPhase)) {
      analysis.currentPhase = "idea";
    }
    if (!Array.isArray(analysis.milestones)) analysis.milestones = [];
    if (typeof analysis.overallProgress !== "number" || analysis.overallProgress < 0) {
      analysis.overallProgress = 0;
    }
    if (!Array.isArray(analysis.nextActions)) analysis.nextActions = [];
    if (!Array.isArray(analysis.blockers)) analysis.blockers = [];

    return analysis;
  } catch (e) {
    console.error("Error parsing Gemini response:", e);
    console.error("Raw response:", cleanText.slice(0, 500));
    return null;
  }
}

// ============================================================
// POST /api/drive/analyze-folder
// ============================================================
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

    // Validar que GEMINI_API_KEY esté configurada
    if (!process.env.GEMINI_API_KEY) {
      console.error("GEMINI_API_KEY no está configurada");
      return NextResponse.json({ 
        error: "Configuración de IA incompleta. Contacta al administrador.",
      }, { status: 500 });
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
    
    // 3. Analizar con Gemini (antes: Claude/Anthropic)
    const analysis = await analyzeWithAI(extractedContents, folderName || "Proyecto");
    
    if (!analysis) {
      return NextResponse.json({ 
        error: "No se pudo analizar el contenido con IA",
        extractedFiles: extractedContents.length,
        stats 
      }, { status: 500 });
    }
    
    // 4. Crear proyecto y milestones si se solicita
    let project = null;
    if (createProject) {
      // Mapear currentPhase al campo status del proyecto
      const statusMap: Record<string, string> = {
        idea: "idea",
        active: "development",
        operational: "execution",
        completed: "completed",
      };

      project = await prisma.project.create({
        data: {
          title: analysis.title || folderName || "Proyecto importado",
          description: analysis.description || null,
          category: analysis.category || null,
          tags: analysis.tags || [],
          status: statusMap[analysis.currentPhase] || "idea",
          projectType: analysis.currentPhase || "idea",
          priority: "medium",
          progress: analysis.overallProgress || 0,
          
          // Framework de 5 pasos
          concept: analysis.concept || null,
          problemSolved: analysis.problemSolved || null,
          targetMarket: analysis.targetMarket || null,
          marketValidation: analysis.marketValidation || null,
          businessModel: analysis.businessModel || null,
          valueProposition: analysis.valueProposition || null,
          actionPlan: analysis.actionPlan || null,
          milestones: analysis.milestones ? JSON.stringify(analysis.milestones) : null,
          resources: analysis.resources || null,
          metrics: analysis.metrics || null,
          currentStep: analysis.currentStep || 1,
          
          userId
        }
      });
      
      // Crear milestones en la tabla Milestone
      if (analysis.milestones && Array.isArray(analysis.milestones) && analysis.milestones.length > 0) {
        for (const milestone of analysis.milestones) {
          await prisma.milestone.create({
            data: {
              title: milestone.title || milestone.name || "Milestone",
              description: milestone.description || null,
              order: milestone.order || 0,
              isCompleted: milestone.isCompleted === true,
              projectId: project.id,
            }
          });
        }
      }
      
      // Crear nota con insights del análisis
      if (analysis.insights) {
        const nextActionsText = analysis.nextActions?.length
          ? `\n\n### Próximas acciones\n${analysis.nextActions.map((a: string, i: number) => `${i + 1}. ${a}`).join("\n")}`
          : "";

        const blockersText = analysis.blockers?.length
          ? `\n\n### Bloqueantes\n${analysis.blockers.map((b: string) => `- ${b}`).join("\n")}`
          : "";

        const techText = analysis.techSummary
          ? `\n\n### Stack Técnico\n${analysis.techSummary}${analysis.techRecommendations ? `\n\n**Recomendaciones:** ${analysis.techRecommendations}` : ""}`
          : "";

        await prisma.note.create({
          data: {
            title: `Análisis IA - ${analysis.title || folderName}`,
            content: `## Análisis del proyecto\n\n${analysis.insights}${nextActionsText}${blockersText}${techText}\n\n---\n\n**Motor IA:** Gemini 1.5 Flash\n**Tipo de proyecto:** ${analysis.projectType}\n**Fase detectada:** ${analysis.currentPhase}\n**Confianza:** ${analysis.confidence || "medium"}\n**Archivos analizados:** ${extractedContents.length}\n**Carpeta origen:** ${folderName || folderId}`,
            category: "Análisis IA",
            tags: ["importado", "análisis-ia", "google-drive", "gemini", analysis.projectType].filter(Boolean),
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
        filesExtracted: extractedContents.map(c => c.fileName),
        aiEngine: "gemini-1.5-flash",
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
