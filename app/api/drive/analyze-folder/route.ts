import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { Part } from "@google/generative-ai";
import { callLLM, callGeminiMultimodal } from "@/lib/clients/llm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Configuration constants
const CONFIG = {
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
  
  if (depth > maxDepth) {
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
    
    
    // TELEMETRY: Log each file found with specified format
    files.forEach(file => {
    });
    
    // Log subfolder names if any
    if (folders.length > 0) {
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
    
    const batchResults = await Promise.all(
      batch.map(async (file) => {
        // CRITICAL: Check by file extension FIRST (handles misreported MIME types)
        // If filename ends in .json, .md, or .html, ALWAYS process as text
        const isTextByExt = isTextFileByExtension(file.name);
        const isImageByExt = isImageFileByExtension(file.name);
        
        // PRIORITY 1: Extension-based detection for text files (.json, .md, .html)
        // This OVERRIDES MIME type - even if Google reports application/octet-stream
        if (isTextByExt) {
          return processTextFile(file, accessToken);
        }
        
        // PRIORITY 2: Extension-based detection for images
        if (isImageByExt) {
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

    // Small delay between batches to avoid rate limiting
    if (i + batchSize < files.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return { parts, analysis };
}

/**
 * Infer file type category from filename and MIME type
 */
function inferFileType(fileName: string, mimeType: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.match(/\.(js|ts|tsx|jsx|py|java|go|rs|rb|php|css|scss|html)$/)) return "code";
  if (lower.match(/\.(jpg|jpeg|png|gif|webp|svg)$/)) return "image";
  if (lower.match(/\.(csv|xlsx|xls)$/) || mimeType.includes("spreadsheet")) return "spreadsheet";
  if (lower.match(/\.(md|markdown|txt)$/) || mimeType.includes("document") || mimeType.startsWith("text/")) return "document";
  if (lower.endsWith(".json")) return "data";
  return "document";
}

/**
 * Generate individual summary for a text document using callLLM (fast, with retry)
 */
async function summarizeDocument(
  fileName: string,
  textContent: string,
  projectContext: string
): Promise<{
  summary: string;
  keyInsights: string[];
  category: string | null;
  wordCount: number;
}> {
  const wordCount = textContent.split(/\s+/).length;

  // Truncate very long docs for summary
  const truncated =
    textContent.length > 6000
      ? textContent.substring(0, 6000) + "\n[... contenido truncado ...]"
      : textContent;

  try {
    const response = await callLLM({
      model: "gemini-flash",
      systemPrompt: `Eres un analista de documentos. Resume el documento de forma concisa y extrae insights clave.
Contexto del proyecto: ${projectContext}

RESPONDE ÚNICAMENTE con JSON válido (sin markdown, sin backticks):
{
  "summary": "Resumen de 2-3 oraciones del documento",
  "keyInsights": ["insight 1", "insight 2", "insight 3"],
  "category": "strategy|technical|financial|design|research|operations|legal|other"
}`,
      userPrompt: `Documento: ${fileName}\n\nContenido:\n${truncated}`,
      jsonMode: true,
      temperature: 0.3,
      maxTokens: 1024,
    });

    const parsed = JSON.parse(response.content);
    return {
      summary: parsed.summary || `Documento: ${fileName}`,
      keyInsights: parsed.keyInsights || [],
      category: parsed.category || null,
      wordCount,
    };
  } catch (error: any) {
    console.warn(`[DOC_SUMMARY] Error summarizing ${fileName}: ${error.message}`);
    return {
      summary: `Documento importado: ${fileName} (${wordCount} palabras)`,
      keyInsights: [],
      category: null,
      wordCount,
    };
  }
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
      invalid++;
      continue;
    }
    
    // Check for duplicates by sourceUrl
    const existingPattern = await prisma.patternCard.findFirst({
      where: { sourceUrl: pattern.sourceUrl }
    });
    
    if (existingPattern) {
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

    const { folderId, folderName, existingProjectId } = await request.json();
    requestFolderId = folderId;

    if (!folderId || !folderName) {
      return NextResponse.json({ error: "folderId y folderName son requeridos" }, { status: 400 });
    }

    const accessToken = account.access_token;
    
    // TOKEN DEBUGGING - para verificar que el token está sincronizado correctamente

    // EXPERT MODE DETECTION
    const isExpertMode = folderId === CONFIG.EXPERT_MODE_FOLDER_ID;
    if (isExpertMode) {
    }

    // 2. RECURSIVE FOLDER SCAN (subcarpetas)
    
    const allFiles = await scanFolderRecursively(folderId, accessToken, 0, 2, folderName);

    // HOTFIX: Limit total files to prevent timeout on large folders
    const MAX_FILES = 10;
    const allFilesLimited = allFiles.slice(0, MAX_FILES);
    if (allFiles.length > MAX_FILES) {
      console.log(`[SPRINT_G] Carpeta tiene ${allFiles.length} archivos, procesando solo los primeros ${MAX_FILES}`);
    }

    // ENHANCED ERROR: If no files found, include folder ID in error message
    if (allFiles.length === 0) {
      return NextResponse.json({ 
        error: `La carpeta está vacía o no contiene archivos compatibles. Carpeta ID: ${folderId}` 
      }, { status: 400 });
    }

    const scanDuration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[SPRINT_G] Scan completado en ${scanDuration}s — ${allFiles.length} archivos encontrados, procesando ${allFilesLimited.length}`);

    // HOTFIX 3: Solo procesar texto (imágenes = descarga base64 lenta)
    const textOnlyFiles = allFilesLimited.filter(file => {
      const isImage = isImageFileByExtension(file.name) ||
        file.mimeType.startsWith("image/");
      return !isImage;
    });
    console.log(`[SPRINT_G] ${allFilesLimited.length} archivos limitados, ${textOnlyFiles.length} son texto (imágenes excluidas)`);

    // 3. MULTIMODAL PROCESSING (Images → Base64, Docs → Text)
    const { parts, analysis } = await processFilesInBatches(textOnlyFiles, accessToken);

    // ENHANCED ERROR: If no parts processed, include folder ID in error message
    if (parts.length === 0) {
      return NextResponse.json({ 
        error: `La carpeta está vacía o no contiene archivos compatibles. Carpeta ID: ${folderId}`,
        details: analysis.errors.slice(0, 10)
      }, { status: 400 });
    }

    // 4. AI ANALYSIS — Two phases: per-doc summaries + global analysis

    // Phase 1: SKIP per-doc summaries (moved to future async job)
    // Per-doc summaries consume too much time in sync flow
    const docSummaries: Array<{
      file: typeof allFilesLimited[0];
      summary: string;
      keyInsights: string[];
      category: string | null;
      wordCount: number;
    }> = [];
    console.log(`[SPRINT_G] Per-doc summaries SKIPPED (async job pendiente)`);

    const elapsedBeforeGlobal = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[SPRINT_G] Listo para análisis global en ${elapsedBeforeGlobal}s — ${parts.length} parts, ${analysis.processedFiles} procesados de ${allFiles.length} totales`);

    // SAFETY CHECK: if we've already used > 40s, skip global analysis
    if (parseFloat(elapsedBeforeGlobal) > 40) {
      console.warn(`[SPRINT_G] ⚠️ ${elapsedBeforeGlobal}s elapsed — skipping global analysis to avoid timeout`);
      const project = existingProjectId
        ? await prisma.project.update({
            where: { id: existingProjectId },
            data: { driveFolderId: folderId },
          })
        : await prisma.project.create({
            data: {
              title: folderName,
              description: `Proyecto importado desde Drive. ${allFiles.length} archivos encontrados, ${analysis.processedFiles} procesados. Análisis completo pendiente (timeout).`,
              status: "active",
              projectType: "idea",
              category: "Google Drive Import",
              priority: "medium",
              progress: 5,
              userId: session.user.id,
              driveFolderId: folderId,
              currentStep: 1,
            },
          });

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      return NextResponse.json({
        success: true,
        project,
        linkedToExisting: !!existingProjectId,
        stats: {
          totalFiles: allFiles.length,
          processedFiles: analysis.processedFiles,
          images: analysis.images,
          documents: analysis.documents,
          docSummaries: 0,
          duration: `${duration}s`,
          warning: "Análisis global omitido por timeout. Re-escanea la carpeta para completar.",
        },
      });
    }

    // Phase 2: Global project analysis using all parts (multimodal if images exist)
    let aiResponse: string;
    let parsedResponse: any = {};
    let patternsExtracted: ExtractedPattern[] = [];

    const docDigest =
      docSummaries.length > 0
        ? `\n\nRESÚMENES DE DOCUMENTOS INDIVIDUALES:\n` +
          docSummaries
            .map(
              (d) =>
                `- ${d.file.name} [${d.category || "sin categoría"}]: ${d.summary}`
            )
            .join("\n")
        : "";

    if (isExpertMode) {
      const expertPrompt = `Eres un experto en UX/UI Design Systems analizando recursos del proyecto "${folderName}".

Tienes acceso a ${analysis.processedFiles} archivos (${analysis.images} imágenes, ${analysis.documents} documentos).
${docDigest}

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
      "cssCode": "/* Código CSS ejemplo */ (OBLIGATORIO para VISUAL_PATTERN)",
      "installationCommand": "npm install package-name (OBLIGATORIO para TOOL_IMPLEMENTATION)",
      "docsUrl": "https://docs.example.com (OBLIGATORIO para TOOL_IMPLEMENTATION)",
      "sourceUrl": "URL de origen o referencia única del archivo/sitio donde se encontró"
    }
  ]
}

REGLAS:
- VISUAL_PATTERN DEBE tener: cssCode y howToApply
- TOOL_IMPLEMENTATION DEBE tener: installationCommand y docsUrl
- sourceUrl DEBE ser único para cada patrón
- Extrae el máximo de patrones posibles (mínimo 5, máximo 50)`;

      const expertResult = await callGeminiMultimodal(
        "",
        expertPrompt,
        parts,
        true,       // jsonMode
        4096,       // maxTokens
        0.5,        // temperature
        "gemini-2.5-flash"  // modelOverride — Flash para cumplir timeout
      );
      aiResponse = expertResult.content;

      try {
        const parsed = JSON.parse(aiResponse);
        patternsExtracted = parsed.patterns || [];
      } catch (parseError: any) {
        console.error("[EXPERT MODE] Error parseando patrones JSON:", parseError.message);
        patternsExtracted = [];
      }

      // PM analysis for Expert Mode project
      const pmResult = await callLLM({
        model: "gemini-flash",
        systemPrompt: `Eres un Product Manager experto analizando el proyecto "${folderName}" para la plataforma VEXCO. Este es un proyecto de RECURSOS UX/UI.`,
        userPrompt: `Archivos: ${analysis.processedFiles} (${analysis.images} imágenes, ${analysis.documents} documentos).${docDigest}

RESPONDE ÚNICAMENTE con JSON válido:
{
  "concept": "Descripción del tipo de recursos UX/UI encontrados. Max 2000 chars.",
  "targetMarket": "Diseñadores y desarrolladores que buscan recursos de UI/UX. Max 2000 chars.",
  "metrics": "Cantidad de patrones, herramientas, y categorías encontradas. Max 2000 chars.",
  "actionPlan": "Cómo utilizar estos recursos en proyectos. Max 2000 chars.",
  "resources": "Lista de las principales herramientas y recursos identificados. Max 2000 chars.",
  "description": "Resumen ejecutivo de la colección de recursos UX/UI. Max 2000 chars."
}`,
        jsonMode: true,
        temperature: 0.5,
        maxTokens: 4096,
      });

      try {
        parsedResponse = JSON.parse(pmResult.content);
      } catch {
        parsedResponse = {
          concept: `Colección de recursos UX/UI: ${folderName}`,
          description: pmResult.content.substring(0, 2000),
        };
      }
    } else {
      const analysisPrompt = `Eres un Product Manager experto analizando el proyecto "${folderName}" para la plataforma VEXCO.

Tienes acceso a ${analysis.processedFiles} archivos del proyecto (${analysis.images} imágenes, ${analysis.documents} documentos).
${docDigest}

IMPORTANTE: SINTETIZA la información. NO copies texto completo. Extrae insights clave, tendencias y métricas.

RESPONDE ÚNICAMENTE con JSON válido:
{
  "concept": "Descripción del concepto del proyecto. Problema, solución, diferenciadores. Max 2000 chars.",
  "targetMarket": "Público objetivo: demografía, psicografía, tamaño estimado, tendencias. Max 2000 chars.",
  "metrics": "PRIORIDAD: Datos de Twitter/X JSON si existen. Si no, KPIs sugeridos. Max 2000 chars.",
  "actionPlan": "Próximos pasos: 1) Esta semana, 2) Este mes, 3) Este trimestre. Max 2000 chars.",
  "resources": "Recursos necesarios: técnicos, humanos, financieros. Max 2000 chars.",
  "description": "Resumen ejecutivo: modelo de negocio, propuesta de valor, validación de mercado. Max 2000 chars."
}`;

      if (analysis.images > 0 && parts.length > 0) {
        const result = await callGeminiMultimodal(
          "",
          analysisPrompt,
          parts,
          true,       // jsonMode
          4096,       // maxTokens
          0.5,        // temperature
          "gemini-2.5-flash"  // modelOverride — Flash para cumplir timeout
        );
        aiResponse = result.content;
      } else {
        const result = await callLLM({
          model: "gemini-flash",
          systemPrompt: "",
          userPrompt: analysisPrompt,
          jsonMode: true,
          temperature: 0.5,
          maxTokens: 2048,
        });
        aiResponse = result.content;
      }

      try {
        parsedResponse = JSON.parse(aiResponse);
      } catch (parseError: any) {
        console.error("[JSON PARSER] Error parseando JSON:", parseError.message);
        parsedResponse = {
          concept: `Proyecto importado desde Google Drive: ${folderName}`,
          description: aiResponse?.substring(0, 2000) || "Análisis completado",
        };
      }
    }

    // 5. SAVE OR UPDATE PROJECT
    const truncate = (str: string | undefined, maxLen: number = 2000): string | null => {
      if (!str) return null;
      return str.length > maxLen ? str.substring(0, maxLen) + "..." : str;
    };

    const concept = truncate(parsedResponse.concept) || `Proyecto importado desde Google Drive: ${folderName}`;
    const targetMarket = truncate(parsedResponse.targetMarket);
    const metrics = truncate(parsedResponse.metrics);
    const actionPlan = truncate(parsedResponse.actionPlan);
    const resources =
      truncate(parsedResponse.resources) ||
      `Archivos: ${analysis.processedFiles} | Imágenes: ${analysis.images} | Documentos: ${analysis.documents}`;
    const description = truncate(parsedResponse.description) || "Análisis completado";

    let project;

    if (existingProjectId) {
      // UPDATE existing project — enrich with Drive data
      const existing = await prisma.project.findUnique({ where: { id: existingProjectId } });
      project = await prisma.project.update({
        where: { id: existingProjectId },
        data: {
          driveFolderId: folderId,
          ...(!existing?.concept ? { concept } : {}),
          ...(!existing?.targetMarket ? { targetMarket } : {}),
          ...(!existing?.metrics ? { metrics } : {}),
          ...(!existing?.actionPlan ? { actionPlan } : {}),
          ...(!existing?.resources ? { resources } : {}),
          ...(!existing?.description ? { description } : {}),
        },
      });
      console.log(`[SPRINT_G] Proyecto existente actualizado: ${project.id}`);
    } else {
      project = await prisma.project.create({
        data: {
          title: folderName,
          description,
          status: "active",
          projectType: isExpertMode ? "ux_resources" : "idea",
          category: isExpertMode ? "UX/UI Resources" : "Google Drive Import",
          priority: "medium",
          progress: 10,
          userId: session.user.id,
          concept,
          targetMarket,
          metrics,
          actionPlan,
          resources,
          currentStep: 1,
          driveFolderId: folderId,
        },
      });
      console.log(`[SPRINT_G] Nuevo proyecto creado: ${project.id}`);
    }

    // 5B. SAVE PER-DOCUMENT SUMMARIES
    let docsSaved = 0;
    for (const doc of docSummaries) {
      try {
        await prisma.driveDocSummary.upsert({
          where: {
            projectId_driveFileId: {
              projectId: project.id,
              driveFileId: doc.file.id,
            },
          },
          update: {
            summary: doc.summary,
            keyInsights: doc.keyInsights,
            category: doc.category,
            wordCount: doc.wordCount,
            fileName: doc.file.name,
          },
          create: {
            projectId: project.id,
            driveFileId: doc.file.id,
            fileName: doc.file.name,
            fileType: inferFileType(doc.file.name, doc.file.mimeType),
            summary: doc.summary,
            keyInsights: doc.keyInsights,
            category: doc.category,
            wordCount: doc.wordCount,
          },
        });
        docsSaved++;
      } catch (err: any) {
        console.warn(`[DOC_SAVE] Error saving summary for ${doc.file.name}: ${err.message}`);
      }
    }
    console.log(`[SPRINT_G] ${docsSaved}/${docSummaries.length} resúmenes guardados`);

    // 6. EXPERT MODE: Save patterns to PatternCard table
    let patternStats = { saved: 0, duplicates: 0, invalid: 0 };
    if (isExpertMode && patternsExtracted.length > 0) {
      patternStats = await processAndSavePatterns(patternsExtracted, project.id);
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    return NextResponse.json({
      success: true,
      project,
      linkedToExisting: !!existingProjectId,
      expertMode: isExpertMode,
      stats: {
        totalFiles: allFiles.length,
        processedFiles: analysis.processedFiles,
        images: analysis.images,
        documents: analysis.documents,
        docSummaries: docsSaved,
        duration: `${duration}s`,
        errors: analysis.errors.length > 0 ? analysis.errors.slice(0, 5) : undefined,
        ...(isExpertMode && {
          patterns: {
            extracted: patternsExtracted.length,
            saved: patternStats.saved,
            duplicates: patternStats.duplicates,
            invalid: patternStats.invalid,
          },
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
