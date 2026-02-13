import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { getDefaultUserId } from "@/lib/get-default-user";

interface FileContent {
  name: string;
  path: string;
  mimeType: string;
  content: string;
  url?: string;
}

// Extraer contenido de un archivo de Google Drive
async function extractFileContent(fileId: string, mimeType: string, accessToken: string): Promise<string> {
  try {
    // Para Google Docs, Sheets, Slides - exportar como texto
    if (mimeType.includes("google-apps")) {
      let exportMimeType = "text/plain";
      
      if (mimeType.includes("document")) {
        exportMimeType = "text/plain";
      } else if (mimeType.includes("spreadsheet")) {
        exportMimeType = "text/csv";
      } else if (mimeType.includes("presentation")) {
        exportMimeType = "text/plain";
      }
      
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(exportMimeType)}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        }
      );
      
      if (response.ok) {
        return await response.text();
      }
    }
    
    // Para PDFs y otros archivos - obtener contenido directo
    if (mimeType === "application/pdf" || mimeType.startsWith("text/")) {
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        }
      );
      
      if (response.ok) {
        return await response.text();
      }
    }
    
    return "";
  } catch (error) {
    console.error(`Error extracting content from file ${fileId}:`, error);
    return "";
  }
}

// Analizar todos los archivos con IA y generar estructura de proyecto
async function analyzeFilesWithAI(fileContents: FileContent[]): Promise<any> {
  const apiKey = process.env.ABACUSAI_API_KEY;
  
  if (!apiKey) {
    throw new Error("API key no configurada");
  }
  
  const filesDescription = fileContents
    .map((file) => `
### ${file.name} (${file.path})
Tipo: ${file.mimeType}
Contenido:
${file.content.substring(0, 2000)}${file.content.length > 2000 ? "..." : ""}
`)
    .join("\n\n");
  
  const systemPrompt = `Eres un experto analista de proyectos empresariales. Tu tarea es analizar una colección de documentos de una carpeta y estructurarlos en un proyecto siguiendo este framework de 5 pasos:

1. CONCEPT (Concepto):
   - Idea principal
   - Problema que resuelve
   - Solución propuesta
   - Propuesta de valor

2. MARKET (Mercado):
   - Target/Público objetivo
   - Tamaño de mercado
   - Tendencias
   - Competidores

3. MODEL (Modelo de Negocio):
   - Fuentes de ingresos
   - Estructura de costos
   - Canales de distribución
   - Recursos clave

4. ACTION (Plan de Acción):
   - Hitos principales
   - Timeline
   - Tareas prioritarias
   - Métricas de éxito

5. RESOURCES (Recursos):
   - Equipo necesario
   - Herramientas y tecnología
   - Presupuesto
   - Partners/colaboradores

DEBES responder SOLO con un objeto JSON válido con esta estructura exacta:

{
  "title": "Título del proyecto",
  "description": "Descripción breve del proyecto",
  "category": "startup|product|service|research|other",
  "tags": ["tag1", "tag2", "tag3"],
  "concept": {
    "idea": "Idea principal extraída",
    "problem": "Problema identificado",
    "solution": "Solución propuesta",
    "value": "Propuesta de valor"
  },
  "market": {
    "target": "Público objetivo",
    "size": "Tamaño de mercado",
    "trends": "Tendencias relevantes",
    "competitors": "Competidores principales"
  },
  "model": {
    "revenue": "Fuentes de ingresos",
    "costs": "Estructura de costos",
    "channels": "Canales de distribución",
    "resources": "Recursos clave"
  },
  "action": {
    "milestones": "Hitos principales",
    "timeline": "Timeline estimado",
    "tasks": "Tareas prioritarias",
    "metrics": "Métricas de éxito"
  },
  "resourcesPlan": {
    "team": "Equipo necesario",
    "tools": "Herramientas y tecnología",
    "budget": "Presupuesto estimado",
    "partners": "Partners/colaboradores"
  },
  "extractedNotes": [
    {"title": "Título nota 1", "content": "Contenido relevante extraído"},
    {"title": "Título nota 2", "content": "Contenido relevante extraído"}
  ],
  "extractedLinks": [
    {"url": "https://example.com", "title": "Título del link", "description": "Descripción"}
  ]
}`;
  
  const userPrompt = `Analiza los siguientes documentos de una carpeta de Drive y genera una estructura de proyecto completa:\n\n${filesDescription}\n\nRecuerda: responde SOLO con el objeto JSON, sin texto adicional.`;
  
  const response = await fetch("https://routellm.abacus.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 4000
    })
  });
  
  if (!response.ok) {
    throw new Error("Error al analizar con IA");
  }
  
  const data = await response.json();
  const content = data.choices[0]?.message?.content || "";
  
  // Extraer JSON del contenido
  const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/\{[\s\S]*\}/);
  
  if (!jsonMatch) {
    throw new Error("No se pudo extraer JSON de la respuesta de IA");
  }
  
  const jsonStr = jsonMatch[1] || jsonMatch[0];
  return JSON.parse(jsonStr);
}

// Palabras clave de alta prioridad para documentos de negocio
const HIGH_PRIORITY_KEYWORDS = [
  'brief', 'plan', 'propuesta', 'análisis', 'analisis', 'roadmap', 'spec',
  'estrategia', 'presupuesto', 'budget', 'modelo', 'model', 'pitch',
  'resumen', 'summary', 'requirements', 'requisitos', 'scope', 'alcance',
  'timeline', 'cronograma', 'milestones', 'hitos', 'competencia', 'competitor',
  'mercado', 'market', 'cliente', 'customer', 'persona', 'user', 'business',
  'negocio', 'revenue', 'ingresos', 'costs', 'costos', 'pricing', 'precios'
];

// Extensiones/tipos a ignorar (archivos de desarrollo)
const IGNORED_PATTERNS = [
  // Código fuente
  '.js', '.ts', '.tsx', '.jsx', '.py', '.rb', '.php', '.java', '.swift', '.kt',
  '.css', '.scss', '.sass', '.less', '.html', '.vue', '.svelte',
  // Configuración
  'package.json', 'package-lock.json', 'yarn.lock', 'tsconfig', 'webpack',
  '.env', '.gitignore', '.eslint', '.prettier', 'babel', 'vite.config',
  'next.config', 'tailwind.config', 'postcss', 'dockerfile', 'docker-compose',
  // Carpetas de desarrollo
  'node_modules', '.git', '.next', 'dist', 'build', '__pycache__', '.cache'
];

function prioritizeFiles(files: any[]): any[] {
  // Separar por prioridad
  const highPriority: any[] = [];
  const mediumPriority: any[] = [];
  const lowPriority: any[] = [];
  
  for (const file of files) {
    const name = file.name.toLowerCase();
    const mimeType = file.mimeType || '';
    
    // Ignorar carpetas, media y archivos de desarrollo
    if (mimeType.includes('folder') ||
        mimeType.startsWith('image/') ||
        mimeType.startsWith('video/') ||
        mimeType.startsWith('audio/') ||
        IGNORED_PATTERNS.some(pattern => name.includes(pattern.toLowerCase()))) {
      continue;
    }
    
    // Alta prioridad: Google Docs, PDFs, Presentations con palabras clave
    const isGoogleDoc = mimeType.includes('document') || mimeType.includes('presentation');
    const isPDF = mimeType === 'application/pdf';
    const hasKeyword = HIGH_PRIORITY_KEYWORDS.some(kw => name.includes(kw));
    
    if ((isGoogleDoc || isPDF) && hasKeyword) {
      highPriority.push(file);
    } else if (isGoogleDoc || isPDF) {
      mediumPriority.push(file);
    } else if (mimeType.includes('spreadsheet')) {
      // Hojas de cálculo - prioridad media
      mediumPriority.push(file);
    } else if (name.endsWith('.md') || name.endsWith('.txt')) {
      // Markdown y texto - pueden tener contexto útil
      lowPriority.push(file);
    }
  }
  
  // Combinar manteniendo orden de prioridad
  return [...highPriority, ...mediumPriority, ...lowPriority];
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ 
        error: "No autenticado",
        needsGoogleAuth: true 
      }, { status: 401 });
    }
    
    const accessToken = (session.user as any).accessToken;
    
    if (!accessToken) {
      return NextResponse.json({ 
        error: "Token de Google no disponible",
        needsGoogleAuth: true 
      }, { status: 401 });
    }
    
    const { files, folderName } = await request.json();
    
    if (!files || !Array.isArray(files)) {
      return NextResponse.json({ error: "Archivos no proporcionados" }, { status: 400 });
    }
    
    // Filtrar y priorizar archivos inteligentemente
    const prioritizedFiles = prioritizeFiles(files);
    
    // Extraer contenido de cada archivo (máximo 50 archivos priorizados)
    const fileContents: FileContent[] = [];
    const maxFiles = Math.min(prioritizedFiles.length, 50);
    
    for (let i = 0; i < maxFiles; i++) {
      const file = prioritizedFiles[i];
      const content = await extractFileContent(file.id, file.mimeType, accessToken);
      
      if (content) {
        fileContents.push({
          name: file.name,
          path: file.path,
          mimeType: file.mimeType,
          content,
          url: file.webViewLink
        });
      }
    }
    
    if (fileContents.length === 0) {
      return NextResponse.json({ 
        error: "No se pudo extraer contenido de ningún archivo" 
      }, { status: 400 });
    }
    
    // Analizar con IA
    const projectStructure = await analyzeFilesWithAI(fileContents);
    
    // Añadir información de la carpeta original
    projectStructure.sourceFolderName = folderName;
    projectStructure.totalFilesProcessed = fileContents.length;
    projectStructure.totalFilesInFolder = files.length;
    
    return NextResponse.json({
      success: true,
      projectStructure
    });
    
  } catch (error) {
    console.error("Error importing from Drive:", error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Error al importar desde Drive" 
    }, { status: 500 });
  }
}

// Endpoint para confirmar y crear el proyecto
export async function PUT(request: NextRequest) {
  try {
    const userId = await getDefaultUserId();
    const { projectStructure } = await request.json();
    
    if (!projectStructure) {
      return NextResponse.json({ error: "Estructura de proyecto no proporcionada" }, { status: 400 });
    }
    
    // Crear el proyecto con campos que coinciden con el schema
    const project = await prisma.project.create({
      data: {
        userId,
        title: projectStructure.title,
        description: projectStructure.description,
        category: projectStructure.category || "other",
        tags: projectStructure.tags || [],
        status: "idea",
        progress: 20, // Ya tiene información inicial
        priority: "medium",
        
        // Step 1: Concept
        concept: `${projectStructure.concept?.idea || ''}\n\n${projectStructure.concept?.solution || ''}`,
        problemSolved: `${projectStructure.concept?.problem || ''}\n\nPropuesta de valor: ${projectStructure.concept?.value || ''}`,
        
        // Step 2: Market
        targetMarket: `${projectStructure.market?.target || ''}\n\nTamaño: ${projectStructure.market?.size || ''}`,
        marketValidation: `Tendencias: ${projectStructure.market?.trends || ''}\n\nCompetidores: ${projectStructure.market?.competitors || ''}`,
        
        // Step 3: Business Model
        businessModel: `Ingresos: ${projectStructure.model?.revenue || ''}\n\nCostos: ${projectStructure.model?.costs || ''}`,
        valueProposition: `Canales: ${projectStructure.model?.channels || ''}\n\nRecursos clave: ${projectStructure.model?.resources || ''}`,
        
        // Step 4: Action Plan
        actionPlan: projectStructure.action?.tasks || '',
        milestones: `${projectStructure.action?.milestones || ''}\n\nTimeline: ${projectStructure.action?.timeline || ''}`,
        
        // Step 5: Resources
        resources: `Equipo: ${projectStructure.resourcesPlan?.team || ''}\n\nHerramientas: ${projectStructure.resourcesPlan?.tools || ''}\n\nPresupuesto: ${projectStructure.resourcesPlan?.budget || ''}`,
        metrics: `${projectStructure.action?.metrics || ''}\n\nPartners: ${projectStructure.resourcesPlan?.partners || ''}`,
        
        currentStep: 5 // Ha completado la estructura inicial
      }
    });
    
    // Crear notas extraídas
    if (projectStructure.extractedNotes && projectStructure.extractedNotes.length > 0) {
      await Promise.all(
        projectStructure.extractedNotes.map((note: any) =>
          prisma.note.create({
            data: {
              userId,
              projectId: project.id,
              title: note.title,
              content: note.content,
              tags: []
            }
          })
        )
      );
    }
    
    // Crear links extraídos
    if (projectStructure.extractedLinks && projectStructure.extractedLinks.length > 0) {
      await Promise.all(
        projectStructure.extractedLinks.map((link: any) =>
          prisma.link.create({
            data: {
              userId,
              projectId: project.id,
              url: link.url,
              title: link.title,
              description: link.description,
              tags: []
            }
          })
        )
      );
    }
    
    return NextResponse.json({
      success: true,
      project
    });
    
  } catch (error) {
    console.error("Error creating project:", error);
    return NextResponse.json({ 
      error: "Error al crear el proyecto" 
    }, { status: 500 });
  }
}
