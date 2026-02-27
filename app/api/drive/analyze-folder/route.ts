import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { GoogleGenerativeAI, Part } from "@google/generative-ai";

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// Configuration constants
const CONFIG = {
  // Model options optimized for large file processing (try in order if one fails)
  // Priority: gemini-1.5-pro (large context), gemini-1.5-flash (fast), gemini-pro (fallback)
  // CRITICAL: Models require "models/" prefix for Gemini API
  GEMINI_MODELS: ["models/gemini-1.5-pro", "models/gemini-1.5-flash", "models/gemini-pro"],
  MAX_FILE_SIZE_MB: 10,
  MAX_TEXT_LENGTH: 8000,
  MAX_FILES_PER_BATCH: 20,
  SUPPORTED_IMAGE_TYPES: ["image/jpeg", "image/png", "image/gif", "image/webp"],
  SUPPORTED_TEXT_TYPES: [
    "application/vnd.google-apps.document",
    "application/vnd.google-apps.spreadsheet",
    "text/plain",
    "text/html",
    "text/csv",
    "text/markdown",
    "text/x-markdown",
    "application/json",
    "application/pdf",
  ],
  // File extensions to ALWAYS process as text (regardless of MIME type)
  // This handles Google Drive reporting .json/.md/.html as application/octet-stream
  TEXT_EXTENSIONS: [".json", ".md", ".html", ".pdf", ".txt", ".csv", ".markdown"],
  // UX/UI Expert Mode folder ID
  EXPERT_MODE_FOLDER_ID: "1ekDx8PsLfS2Dgn4C7qMTYRcx_yDti2Lh",
};

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
}

interface ProcessedFile {
  name: string;
  type: "image" | "text" | "skipped";
  content?: Part;
  error?: string;
}

interface FolderAnalysis {
  totalFiles: number;
  processedFiles: number;
  images: number;
  documents: number;
  errors: string[];
}

// Pattern/Tool interface for Expert Mode
interface ExtractedPattern {
  name: string;
  description: string;
  category: "VISUAL_PATTERN" | "TOOL_IMPLEMENTATION";
  howToApply: string;
  cssCode?: string;
  installationCommand?: string;
  docsUrl?: string;
  sourceUrl: string;
}

/**
 * Helper function to check if a file should be processed as text based on extension
 * CRITICAL: This handles cases where Google Drive reports .json, .md, .html as 
 * text/plain or application/octet-stream - we ALWAYS process these by extension
 */
function isTextFileByExtension(filename: string): boolean {
  const lowerName = filename.toLowerCase();
  return CONFIG.TEXT_EXTENSIONS.some(ext => lowerName.endsWith(ext));
}

/**
 * Helper function to check if a file is an image based on extension
 */
function isImageFileByExtension(filename: string): boolean {
  const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
  const lowerName = filename.toLowerCase();
  return imageExtensions.some(ext => lowerName.endsWith(ext));
}

/**
 * Recursively scan all files in a Google Drive folder and its subfolders
 * Query explicitly does NOT filter by mimeType to ensure both files AND folders are returned
 */
async function scanFolderRecursively(
  folderId: string,
  accessToken: string,
  depth: number = 0,
  maxDepth: number = 10,
  folderName: string = "root"
): Promise<DriveFile[]> {
  // TELEMETRY: Log entry into folder with specified format
  console.log('[SCAN] Entrando en carpeta:', folderName, '(ID:', folderId, ', Profundidad:', depth, ')');
  
  if (depth > maxDepth) {
    console.log(`[SCAN] Profundidad máxima ${maxDepth} alcanzada, deteniendo recursión`);
    return [];
  }

  try {
    // CRITICAL: Query does NOT filter by mimeType - returns ALL items including folders
    // The query 'folderId' in parents and trashed=false returns:
    // - Files (any mimeType except folders)
    // - Folders (mimeType = 'application/vnd.google-apps.folder')
    const query = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    const fields = encodeURIComponent("files(id,name,mimeType,size)");
    const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}&pageSize=1000`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      console.error(`[SCAN] Error al escanear carpeta ${folderId}: HTTP ${response.status}`);
      return [];
    }

    const data = await response.json();
    const items: DriveFile[] = data.files || [];
    
    // Separate folders (mimeType = 'application/vnd.google-apps.folder') from files
    const folders = items.filter(item => item.mimeType === "application/vnd.google-apps.folder");
    const files = items.filter(item => item.mimeType !== "application/vnd.google-apps.folder");
    
    console.log(`[SCAN] Encontrados: ${items.length} items (${folders.length} carpetas, ${files.length} archivos)`);
    
    // TELEMETRY: Log each file found with specified format
    files.forEach(file => {
      console.log('[FOUND] Archivo detectado:', file.name, '(', file.mimeType, ')');
    });
    
    // Log subfolder names if any
    if (folders.length > 0) {
      console.log(`[SCAN] Subcarpetas encontradas: ${folders.map(f => f.name).join(", ")}`);
    }

    let allFiles: DriveFile[] = [];

    // First, add all non-folder files
    for (const file of files) {
      allFiles.push(file);
    }

    // Then recursively scan all subfolders (mimeType = 'application/vnd.google-apps.folder')
    for (const folder of folders) {
      const subFiles = await scanFolderRecursively(
        folder.id, 
        accessToken, 
        depth + 1, 
        maxDepth,
        folder.name
      );
      allFiles = allFiles.concat(subFiles);
    }

    console.log(`[SCAN] Carpeta "${folderName}" completada: ${allFiles.length} archivos recolectados`);
    return allFiles;
  } catch (error: any) {
    console.error(`[SCAN] Error en carpeta ${folderId}:`, error.message);
    return [];
  }
}

/**
 * Download and convert image to Base64 for Gemini inlineData
 */
async function processImageFile(
  file: DriveFile,
  accessToken: string
): Promise<ProcessedFile> {
  try {
    const fileSize = parseInt(file.size || "0");
    if (fileSize > CONFIG.MAX_FILE_SIZE_MB * 1024 * 1024) {
      return { name: file.name, type: "skipped", error: "File too large" };
    }

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!response.ok) {
      return { name: file.name, type: "skipped", error: `HTTP ${response.status}` };
    }

    const buffer = await response.arrayBuffer();
    const base64Data = Buffer.from(buffer).toString("base64");

    return {
      name: file.name,
      type: "image",
      content: {
        inlineData: {
          data: base64Data,
          mimeType: file.mimeType,
        },
      },
    };
  } catch (error: any) {
    return { name: file.name, type: "skipped", error: error.message };
  }
}

/**
 * Extract text content from documents (Google Docs, text files, etc.)
 */
async function processTextFile(
  file: DriveFile,
  accessToken: string
): Promise<ProcessedFile> {
  try {
    let exportUrl: string;

    // Google Workspace files need to be exported
    if (file.mimeType.includes("google-apps")) {
      if (file.mimeType.includes("spreadsheet")) {
        exportUrl = `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=text/csv`;
      } else {
        exportUrl = `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=text/plain`;
      }
    } else {
      exportUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;
    }

    const response = await fetch(exportUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      return { name: file.name, type: "skipped", error: `HTTP ${response.status}` };
    }

    let text = await response.text();
    
    // Truncate if too long
    if (text.length > CONFIG.MAX_TEXT_LENGTH) {
      text = text.substring(0, CONFIG.MAX_TEXT_LENGTH) + "\n[... contenido truncado ...]";
    }

    return {
      name: file.name,
      type: "text",
      content: {
        text: `\n--- Archivo: ${file.name} ---\n${text}\n`,
      },
    };
  } catch (error: any) {
    return { name: file.name, type: "skipped", error: error.message };
  }
}

/**
 * Process files in batches to handle large folders within timeout
 */
async function processFilesInBatches(
  files: DriveFile[],
  accessToken: string,
  batchSize: number = CONFIG.MAX_FILES_PER_BATCH
): Promise<{ parts: Part[]; analysis: FolderAnalysis }> {
  const analysis: FolderAnalysis = {
    totalFiles: files.length,
    processedFiles: 0,
    images: 0,
    documents: 0,
    errors: [],
  };

  const parts: Part[] = [];
  let totalProcessed = 0;
  
  // Process in batches
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    const currentBatchSize = batch.length;
    
    // TELEMETRY: Log batch processing start
    console.log('[BATCH] Procesando lote de', currentBatchSize, 'archivos...');
    
    const batchResults = await Promise.all(
      batch.map(async (file) => {
        // CRITICAL: Check by file extension FIRST (handles misreported MIME types)
        // If filename ends in .json, .md, or .html, ALWAYS process as text
        const isTextByExt = isTextFileByExtension(file.name);
        const isImageByExt = isImageFileByExtension(file.name);
        
        // PRIORITY 1: Extension-based detection for text files (.json, .md, .html)
        // This OVERRIDES MIME type - even if Google reports application/octet-stream
        if (isTextByExt) {
          console.log('[OVERRIDE] Procesando por extensión:', file.name);
          return processTextFile(file, accessToken);
        }
        
        // PRIORITY 2: Extension-based detection for images
        if (isImageByExt) {
          console.log('[OVERRIDE] Procesando por extensión:', file.name);
          return processImageFile(file, accessToken);
        }
        
        // PRIORITY 3: MIME type based detection for images
        if (CONFIG.SUPPORTED_IMAGE_TYPES.some((type) => file.mimeType.startsWith(type.split("/")[0]) && file.mimeType.includes(type.split("/")[1])) ||
            file.mimeType.startsWith("image/")) {
          return processImageFile(file, accessToken);
        }
        
        // PRIORITY 4: MIME type based detection for text/documents
        if (
          CONFIG.SUPPORTED_TEXT_TYPES.some((type) => file.mimeType === type || file.mimeType.includes(type.replace("application/vnd.", ""))) ||
          file.mimeType.includes("document") ||
          file.mimeType.startsWith("text/") ||
          file.mimeType.includes("spreadsheet") ||
          file.mimeType === "application/json" ||
          file.mimeType === "application/pdf"
        ) {
          return processTextFile(file, accessToken);
        }
        
        // Skip unsupported types
        return { name: file.name, type: "skipped" as const, error: "Unsupported type" };
      })
    );

    for (const result of batchResults) {
      if (result.content) {
        parts.push(result.content);
        analysis.processedFiles++;
        totalProcessed++;
        if (result.type === "image") analysis.images++;
        if (result.type === "text") analysis.documents++;
      }
      if (result.error) {
        analysis.errors.push(`${result.name}: ${result.error}`);
      }
    }

    // TELEMETRY: Log batch completion with total processed count
    console.log('[BATCH] Lote completado. Total procesado:', totalProcessed);

    // Small delay between batches to avoid rate limiting
    if (i + batchSize < files.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return { parts, analysis };
}

/**
 * Try multiple Gemini models until one works
 * Includes diagnostic logging and model availability check
 */
async function generateWithFallback(
  prompt: string,
  parts: Part[]
): Promise<string> {
  let lastError: Error | null = null;

  // DIAGNOSTIC: List available models before attempting analysis
  try {
    console.log('[GEMINI] Listando modelos disponibles...');
    const modelList = await genAI.listModels();
    const modelNames = [];
    for await (const model of modelList) {
      modelNames.push(model.name);
    }
    console.log('[GEMINI] Modelos disponibles:', modelNames.slice(0, 10).join(', '), modelNames.length > 10 ? `... (+${modelNames.length - 10} más)` : '');
  } catch (listError: any) {
    console.log('[GEMINI] No se pudo listar modelos (puede continuar):', listError.message);
  }

  // Try each configured model
  for (const modelName of CONFIG.GEMINI_MODELS) {
    try {
      console.log(`[GEMINI] Intentando modelo: ${modelName}`);
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent([prompt, ...parts]);
      const response = result.response.text();
      console.log(`[GEMINI] ✅ Éxito con modelo: ${modelName}`);
      return response;
    } catch (error: any) {
      console.log(`[GEMINI] Error con modelo: ${modelName}`, error.message);
      lastError = error;
      continue;
    }
  }

  throw lastError || new Error("Todos los modelos de Gemini fallaron");
}

/**
 * Validate extracted pattern has required fields based on category
 */
function validatePattern(pattern: ExtractedPattern): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Common required fields
  if (!pattern.name || pattern.name.trim() === "") {
    errors.push("name is required");
  }
  if (!pattern.description || pattern.description.trim() === "") {
    errors.push("description is required");
  }
  if (!pattern.category || !["VISUAL_PATTERN", "TOOL_IMPLEMENTATION"].includes(pattern.category)) {
    errors.push("category must be VISUAL_PATTERN or TOOL_IMPLEMENTATION");
  }
  if (!pattern.sourceUrl || pattern.sourceUrl.trim() === "") {
    errors.push("sourceUrl is required");
  }
  
  // Category-specific validation
  if (pattern.category === "VISUAL_PATTERN") {
    if (!pattern.cssCode || pattern.cssCode.trim() === "") {
      errors.push("cssCode is required for VISUAL_PATTERN");
    }
    if (!pattern.howToApply || pattern.howToApply.trim() === "") {
      errors.push("howToApply is required for VISUAL_PATTERN");
    }
  }
  
  if (pattern.category === "TOOL_IMPLEMENTATION") {
    if (!pattern.installationCommand || pattern.installationCommand.trim() === "") {
      errors.push("installationCommand is required for TOOL_IMPLEMENTATION");
    }
    if (!pattern.docsUrl || pattern.docsUrl.trim() === "") {
      errors.push("docsUrl is required for TOOL_IMPLEMENTATION");
    }
  }
  
  return { valid: errors.length === 0, errors };
}

/**
 * Process patterns in Expert Mode - check duplicates and save to PatternCard
 */
async function processAndSavePatterns(
  patterns: ExtractedPattern[],
  projectId: string
): Promise<{ saved: number; duplicates: number; invalid: number }> {
  let saved = 0;
  let duplicates = 0;
  let invalid = 0;
  
  for (const pattern of patterns) {
    // Validate pattern
    const validation = validatePattern(pattern);
    if (!validation.valid) {
      console.log(`[INVALID] Patrón inválido "${pattern.name}":`, validation.errors.join(", "));
      invalid++;
      continue;
    }
    
    // Check for duplicates by sourceUrl
    const existingPattern = await prisma.patternCard.findFirst({
      where: { sourceUrl: pattern.sourceUrl }
    });
    
    if (existingPattern) {
      console.log(`[DUPLICATE] Patrón ya existe: ${pattern.sourceUrl}`);
      duplicates++;
      continue;
    }
    
    // Save new pattern
    try {
      await prisma.patternCard.create({
        data: {
          name: pattern.name,
          description: pattern.description,
          category: pattern.category,
          howToApply: pattern.howToApply || null,
          cssCode: pattern.cssCode || null,
          installationCommand: pattern.installationCommand || null,
          docsUrl: pattern.docsUrl || null,
          sourceUrl: pattern.sourceUrl,
          projectId: projectId,
        }
      });
      console.log(`[PATTERN SAVED] ${pattern.name} (${pattern.category})`);
      saved++;
    } catch (error: any) {
      console.error(`[SAVE ERROR] Error guardando patrón "${pattern.name}":`, error.message);
      invalid++;
    }
  }
  
  return { saved, duplicates, invalid };
}

export async function POST(request: Request) {
  const startTime = Date.now();
  let requestFolderId: string | undefined;

  try {
    // 1. AUTH VALIDATION
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const account = await prisma.account.findFirst({
      where: { userId: session.user.id, provider: "google" },
    });

    if (!account?.access_token) {
      return NextResponse.json({ error: "Token de Google no encontrado" }, { status: 401 });
    }

    const { folderId, folderName } = await request.json();
    requestFolderId = folderId;
    
    if (!folderId || !folderName) {
      return NextResponse.json({ error: "folderId y folderName son requeridos" }, { status: 400 });
    }

    const accessToken = account.access_token;
    
    // TOKEN DEBUGGING - para verificar que el token está sincronizado correctamente
    console.log('[TOKEN] Token preview (primeros 10 chars):', accessToken?.substring(0, 10));
    console.log('[TOKEN] Token existe:', !!accessToken, ', Longitud:', accessToken?.length);
    console.log('[TOKEN] Account expires_at:', account.expires_at, ', Ahora:', Math.floor(Date.now() / 1000));

    // EXPERT MODE DETECTION
    const isExpertMode = folderId === CONFIG.EXPERT_MODE_FOLDER_ID;
    if (isExpertMode) {
      console.log('[EXPERT MODE] Activado: Motor de Extracción UX/UI');
    }

    // 2. RECURSIVE FOLDER SCAN (subcarpetas)
    console.log(`\n${"=".repeat(60)}`);
    console.log(`[SCAN] Iniciando escaneo recursivo de: "${folderName}" (${folderId})`);
    console.log(`${"=".repeat(60)}`);
    
    const allFiles = await scanFolderRecursively(folderId, accessToken, 0, 10, folderName);
    
    console.log(`\n${"=".repeat(60)}`);
    console.log(`[SCAN] ESCANEO COMPLETO: ${allFiles.length} archivos encontrados en toda la jerarquía`);
    console.log(`${"=".repeat(60)}\n`);

    // ENHANCED ERROR: If no files found, include folder ID in error message
    if (allFiles.length === 0) {
      return NextResponse.json({ 
        error: `La carpeta está vacía o no contiene archivos compatibles. Carpeta ID: ${folderId}` 
      }, { status: 400 });
    }

    // 3. MULTIMODAL PROCESSING (Images → Base64, Docs → Text)
    console.log("[BATCH] Iniciando procesamiento multimodal...");
    const { parts, analysis } = await processFilesInBatches(allFiles, accessToken);
    console.log(`\n[BATCH] Procesamiento completado: ${analysis.processedFiles} archivos (${analysis.images} imágenes, ${analysis.documents} documentos)`);

    // ENHANCED ERROR: If no parts processed, include folder ID in error message
    if (parts.length === 0) {
      return NextResponse.json({ 
        error: `La carpeta está vacía o no contiene archivos compatibles. Carpeta ID: ${folderId}`,
        details: analysis.errors.slice(0, 10)
      }, { status: 400 });
    }

    // 4. GEMINI AI ANALYSIS
    let aiResponse: string;
    let parsedResponse: any = {};
    let patternsExtracted: ExtractedPattern[] = [];

    if (isExpertMode) {
      // EXPERT MODE PROMPT: Extract patterns and tools
      const expertPrompt = `Eres un experto en UX/UI Design Systems analizando recursos del proyecto "${folderName}".

Tienes acceso a ${analysis.processedFiles} archivos (${analysis.images} imágenes, ${analysis.documents} documentos).

MISIÓN: Extraer TODOS los patrones de diseño visual y herramientas de implementación encontrados en estos archivos.

INSTRUCCIONES CRÍTICAS:
1. Tu respuesta DEBE ser ÚNICAMENTE un objeto JSON válido (sin markdown, sin \`\`\`json, sin texto adicional)
2. Analiza TODOS los archivos buscando:
   - Patrones visuales de UI (botones, cards, layouts, tipografía, colores, animaciones, etc.)
   - Herramientas y librerías mencionadas (npm packages, frameworks, APIs)
3. Si encuentras URLs externas en archivos .json o .md, infiere patrones de diseño de esos sitios basándote en tu conocimiento
4. Para cada hallazgo, clasifica como VISUAL_PATTERN o TOOL_IMPLEMENTATION

FORMATO DE RESPUESTA (JSON array):
{
  "patterns": [
    {
      "name": "Nombre descriptivo del patrón o herramienta",
      "description": "Descripción detallada de qué es y para qué sirve",
      "category": "VISUAL_PATTERN" | "TOOL_IMPLEMENTATION",
      "howToApply": "Guía paso a paso de cómo aplicar este patrón (OBLIGATORIO para VISUAL_PATTERN)",
      "cssCode": "/* Código CSS ejemplo */\\n.clase { ... } (OBLIGATORIO para VISUAL_PATTERN)",
      "installationCommand": "npm install package-name (OBLIGATORIO para TOOL_IMPLEMENTATION)",
      "docsUrl": "https://docs.example.com (OBLIGATORIO para TOOL_IMPLEMENTATION)",
      "sourceUrl": "URL de origen o referencia única del archivo/sitio donde se encontró"
    }
  ]
}

REGLAS:
- VISUAL_PATTERN DEBE tener: cssCode y howToApply
- TOOL_IMPLEMENTATION DEBE tener: installationCommand y docsUrl
- sourceUrl DEBE ser único para cada patrón (usa la URL del archivo o sitio de referencia)
- Extrae el máximo de patrones posibles (mínimo 5, máximo 50)
- Si un archivo .json o .md contiene URLs, analiza esas URLs y extrae patrones inferidos

RESPONDE ÚNICAMENTE con el objeto JSON (sin texto antes o después):`;

      console.log("🤖 [EXPERT MODE] Generando extracción de patrones UX/UI...");
      aiResponse = await generateWithFallback(expertPrompt, parts);
      console.log("✅ [EXPERT MODE] Extracción completada");

      // Parse Expert Mode response
      try {
        let jsonString = aiResponse.trim();
        if (jsonString.startsWith("```json")) {
          jsonString = jsonString.replace(/^```json\s*/, "").replace(/\s*```$/, "");
        } else if (jsonString.startsWith("```")) {
          jsonString = jsonString.replace(/^```\s*/, "").replace(/\s*```$/, "");
        }
        
        const parsed = JSON.parse(jsonString);
        patternsExtracted = parsed.patterns || [];
        console.log(`[EXPERT MODE] ${patternsExtracted.length} patrones extraídos del análisis`);
      } catch (parseError: any) {
        console.error("[EXPERT MODE] Error parseando patrones JSON:", parseError.message);
        console.log("[EXPERT MODE] Respuesta (primeros 500 chars):", aiResponse.substring(0, 500));
        patternsExtracted = [];
      }

      // Also generate standard PM analysis for the Project
      const pmPrompt = `Eres un Product Manager experto analizando el proyecto "${folderName}" para la plataforma VEXCO.

Tienes acceso a ${analysis.processedFiles} archivos del proyecto (${analysis.images} imágenes, ${analysis.documents} documentos).

Este es un proyecto de RECURSOS UX/UI. Resume los recursos encontrados.

INSTRUCCIONES CRÍTICAS:
- Tu respuesta DEBE ser ÚNICAMENTE un objeto JSON válido (sin markdown, sin \`\`\`json, sin texto adicional)

RESPONDE ÚNICAMENTE con este objeto JSON:

{
  "concept": "Descripción del tipo de recursos UX/UI encontrados. Máximo 2000 caracteres.",
  "targetMarket": "Diseñadores y desarrolladores que buscan recursos de UI/UX. Máximo 2000 caracteres.",
  "metrics": "Cantidad de patrones, herramientas, y categorías encontradas. Máximo 2000 caracteres.",
  "actionPlan": "Cómo utilizar estos recursos en proyectos. Máximo 2000 caracteres.",
  "resources": "Lista de las principales herramientas y recursos identificados. Máximo 2000 caracteres.",
  "description": "Resumen ejecutivo de la colección de recursos UX/UI. Máximo 2000 caracteres."
}`;

      console.log("🤖 Generando análisis PM para Expert Mode...");
      const pmResponse = await generateWithFallback(pmPrompt, parts);
      
      try {
        let jsonString = pmResponse.trim();
        if (jsonString.startsWith("```json")) {
          jsonString = jsonString.replace(/^```json\s*/, "").replace(/\s*```$/, "");
        } else if (jsonString.startsWith("```")) {
          jsonString = jsonString.replace(/^```\s*/, "").replace(/\s*```$/, "");
        }
        parsedResponse = JSON.parse(jsonString);
      } catch (e) {
        parsedResponse = {
          concept: `Colección de recursos UX/UI: ${folderName}`,
          description: pmResponse.substring(0, 2000),
        };
      }

    } else {
      // STANDARD MODE: Original PM analysis prompt
      const analysisPrompt = `Eres un Product Manager experto analizando el proyecto "${folderName}" para la plataforma VEXCO.

Tienes acceso a ${analysis.processedFiles} archivos del proyecto (${analysis.images} imágenes, ${analysis.documents} documentos).

IMPORTANTE: Con ${analysis.processedFiles} archivos, debes RESUMIR y SINTETIZAR la información. NO copies texto completo. Extrae insights clave, tendencias y métricas. Mantén cada campo conciso (máximo 2000 caracteres por campo).

INSTRUCCIONES CRÍTICAS:
- Tu respuesta DEBE ser ÚNICAMENTE un objeto JSON válido (sin markdown, sin \`\`\`json, sin texto adicional)
- El JSON debe poder ser parseado directamente con JSON.parse()
- Analiza TODOS los archivos proporcionados
- Para el campo "metrics", da PRIORIDAD ABSOLUTA a los datos de archivos .json de Twitter: engagement, impresiones, likes, retweets, alcance, crecimiento de seguidores, etc.

RESPONDE ÚNICAMENTE con este objeto JSON (sin texto antes o después):

{
  "concept": "Descripción del concepto del proyecto. Incluye: problema que resuelve, solución propuesta, y diferenciadores clave. Máximo 2000 caracteres.",
  "targetMarket": "Define el público objetivo: demografía, psicografía, tamaño estimado del mercado, y tendencias relevantes. Máximo 2000 caracteres.",
  "metrics": "PRIORIDAD: Datos de Twitter/X JSON (engagement, impresiones, likes, retweets, seguidores, mejores posts, hashtags efectivos). Si no hay datos Twitter, incluye KPIs sugeridos. Máximo 2000 caracteres.",
  "actionPlan": "Próximos pasos concretos: 1) Esta semana, 2) Este mes, 3) Este trimestre. Incluye timeline estimado. Máximo 2000 caracteres.",
  "resources": "Recursos necesarios: técnicos (tecnologías), humanos (roles), financieros (estimación). Máximo 2000 caracteres.",
  "description": "Resumen ejecutivo completo del análisis PM. Incluye modelo de negocio, propuesta de valor, y validación de mercado. Máximo 2000 caracteres."
}`;

      console.log("🤖 Generando análisis PM con Gemini AI (formato JSON estructurado)...");
      aiResponse = await generateWithFallback(analysisPrompt, parts);
      console.log("✅ Análisis PM completado");

      // Parse standard response
      try {
        let jsonString = aiResponse.trim();
        if (jsonString.startsWith("```json")) {
          jsonString = jsonString.replace(/^```json\s*/, "").replace(/\s*```$/, "");
        } else if (jsonString.startsWith("```")) {
          jsonString = jsonString.replace(/^```\s*/, "").replace(/\s*```$/, "");
        }
        parsedResponse = JSON.parse(jsonString);
        console.log("[JSON PARSER] ✅ JSON parseado correctamente");
        console.log("[JSON PARSER] Campos recibidos:", Object.keys(parsedResponse).join(", "));
      } catch (parseError: any) {
        console.error("[JSON PARSER] ❌ Error parseando JSON:", parseError.message);
        console.log("[JSON PARSER] Respuesta original (primeros 500 chars):", aiResponse.substring(0, 500));
        parsedResponse = {
          concept: `Proyecto importado desde Google Drive: ${folderName}`,
          description: aiResponse,
        };
      }
    }

    // Truncate fields to prevent database errors (max 2000 chars each)
    const truncate = (str: string | undefined, maxLen: number = 2000): string | null => {
      if (!str) return null;
      return str.length > maxLen ? str.substring(0, maxLen) + "..." : str;
    };

    // Map to database fields
    const concept = truncate(parsedResponse.concept) || `Proyecto importado desde Google Drive: ${folderName}`;
    const targetMarket = truncate(parsedResponse.targetMarket);
    const metrics = truncate(parsedResponse.metrics);
    const actionPlan = truncate(parsedResponse.actionPlan);
    const resources = truncate(parsedResponse.resources) || `Archivos analizados: ${analysis.processedFiles}\nImágenes: ${analysis.images}\nDocumentos: ${analysis.documents}`;
    const description = truncate(parsedResponse.description) || (aiResponse ? aiResponse.substring(0, 2000) : "Análisis completado");

    console.log("[PM PARSER] Campos mapeados para DB:");
    console.log("  - concept:", concept?.length, "chars");
    console.log("  - targetMarket:", targetMarket?.length || 0, "chars");
    console.log("  - metrics:", metrics?.length || 0, "chars");
    console.log("  - actionPlan:", actionPlan?.length || 0, "chars");
    console.log("  - resources:", resources?.length || 0, "chars");
    console.log("  - description:", description?.length || 0, "chars");

    // 5. SAVE TO PROJECT TABLE (NEON DB) - Structured JSON mapping
    console.log("💾 Guardando análisis PM en base de datos...");
    const project = await prisma.project.create({
      data: {
        title: folderName,
        description: description,
        status: "active",
        projectType: isExpertMode ? "ux_resources" : "idea",
        category: isExpertMode ? "UX/UI Resources" : "Google Drive Import",
        priority: "medium",
        progress: 10,
        userId: session.user.id,
        concept: concept,
        targetMarket: targetMarket,
        metrics: metrics,
        actionPlan: actionPlan,
        resources: resources,
        currentStep: 1,
      },
    });

    // 6. EXPERT MODE: Save patterns to PatternCard table
    let patternStats = { saved: 0, duplicates: 0, invalid: 0 };
    if (isExpertMode && patternsExtracted.length > 0) {
      console.log(`\n[EXPERT MODE] Procesando ${patternsExtracted.length} patrones extraídos...`);
      patternStats = await processAndSavePatterns(patternsExtracted, project.id);
      console.log(`[EXPERT MODE] Resultado: ${patternStats.saved} guardados, ${patternStats.duplicates} duplicados, ${patternStats.invalid} inválidos`);
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`🏁 Análisis completado en ${duration}s`);

    return NextResponse.json({
      success: true,
      project,
      expertMode: isExpertMode,
      stats: {
        totalFiles: analysis.totalFiles,
        processedFiles: analysis.processedFiles,
        images: analysis.images,
        documents: analysis.documents,
        duration: `${duration}s`,
        errors: analysis.errors.length > 0 ? analysis.errors.slice(0, 5) : undefined,
        ...(isExpertMode && {
          patterns: {
            extracted: patternsExtracted.length,
            saved: patternStats.saved,
            duplicates: patternStats.duplicates,
            invalid: patternStats.invalid,
          }
        }),
      },
    });

  } catch (error: any) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error(`❌ Análisis falló después de ${duration}s:`, error);

    return NextResponse.json(
      {
        error: "Error en el análisis del proyecto",
        details: error.message,
        folderId: requestFolderId,
        duration: `${duration}s`,
      },
      { status: 500 }
    );
  }
}
