import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import type { Part } from "@/lib/clients/llm";
import { callLLM, callGeminiMultimodal } from "@/lib/clients/llm";
import mammoth from "mammoth";

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
  TEXT_EXTENSIONS: [".json", ".md", ".html", ".pdf", ".txt", ".csv", ".markdown", ".docx"],
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
  // Special handler for .docx files (mammoth extracts text from binary)
  if (file.name.toLowerCase().endsWith(".docx")) {
    try {
      const downloadUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;
      const response = await fetch(downloadUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!response.ok) { return { name: file.name, type: "skipped", error: `HTTP ${response.status}` }; }
      const buffer = Buffer.from(await response.arrayBuffer());
      const result = await mammoth.extractRawText({ buffer });
      let text = result.value || "";
      if (text.length > CONFIG.MAX_TEXT_LENGTH) { text = text.substring(0, CONFIG.MAX_TEXT_LENGTH) + "\n[... contenido truncado ...]"; }
      return { name: file.name, type: "text", content: { text: `\n--- Archivo: ${file.name} ---\n${text}\n` } };
    } catch (error: any) {
      return { name: file.name, type: "skipped", error: `docx error: ${error.message}` };
    }
  }

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
    // 1. AUTH
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

    // EXPERT MODE DETECTION
    const isExpertMode = folderId === CONFIG.EXPERT_MODE_FOLDER_ID;

    // 2. SCAN — depth 2, rápido
    const allFiles = await scanFolderRecursively(folderId, accessToken, 0, 2, folderName);
    const scanTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[DRIVE_IMPORT] Scan: ${scanTime}s — ${allFiles.length} archivos encontrados`);

    if (allFiles.length === 0) {
      return NextResponse.json({
        error: `La carpeta está vacía o no contiene archivos compatibles. Carpeta ID: ${folderId}`
      }, { status: 400 });
    }

    // 3. FILTRAR — solo texto, max 10 archivos, sin imágenes
    const textFiles = allFiles.filter(file => {
      const isImage = isImageFileByExtension(file.name) || file.mimeType.startsWith("image/");
      return !isImage;
    }).slice(0, 10);

    console.log(`[DRIVE_IMPORT] Procesando ${textFiles.length} archivos de texto (${allFiles.length - textFiles.length} excluidos)`);

    // 4. DESCARGAR texto de cada archivo
    const textContents: string[] = [];
    const processedNames: string[] = [];
    const ignoredFiles: { name: string; reason: string }[] = [];

    for (const file of textFiles) {
      const processed = await processTextFile(file, accessToken);
      if (processed.type === "text" && processed.content && "text" in processed.content) {
        textContents.push((processed.content as { text: string }).text);
        processedNames.push(file.name);
      } else {
        ignoredFiles.push({ name: file.name, reason: processed.error ?? "tipo no soportado" });
      }
    }

    const downloadTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[DRIVE_IMPORT] Descarga: ${downloadTime}s`);
    console.log(`[DRIVE_IMPORT] Procesados (${processedNames.length}): ${processedNames.join(", ") || "ninguno"}`);
    console.log(`[DRIVE_IMPORT] Ignorados (${ignoredFiles.length}): ${ignoredFiles.map(f => `${f.name}(${f.reason})`).join(", ") || "ninguno"}`);

    if (textContents.length === 0) {
      return NextResponse.json({
        error: `No se pudo extraer contenido de los archivos. Carpeta ID: ${folderId}`
      }, { status: 400 });
    }

    // 5. SAFETY CHECK — si ya llevamos >45s, crear proyecto mínimo
    const elapsedBeforeAI = parseFloat(((Date.now() - startTime) / 1000).toFixed(1));
    if (elapsedBeforeAI > 45) {
      console.warn(`[DRIVE_IMPORT] ⚠️ ${elapsedBeforeAI}s — creando proyecto mínimo`);

      const project = existingProjectId
        ? await prisma.project.update({
            where: { id: existingProjectId },
            data: { driveFolderId: folderId },
          })
        : await prisma.project.create({
            data: {
              title: folderName,
              description: `Importado desde Drive. ${allFiles.length} archivos, ${textContents.length} procesados. Análisis pendiente por timeout.`,
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

      return NextResponse.json({
        success: true,
        project,
        stats: {
          totalFiles: allFiles.length,
          processedFiles: textContents.length,
          duration: `${((Date.now() - startTime) / 1000).toFixed(2)}s`,
          warning: "Análisis AI omitido por tiempo. Re-importa para completar.",
          files: { processed: processedNames, ignored: ignoredFiles },
        },
      });
    }

    // 6. ANÁLISIS AI — concatenar texto + single call a Flash
    const allText = textContents.join("\n\n");
    // Truncar a 30000 chars para que Flash lo procese rápido
    const truncatedText = allText.length > 30000
      ? allText.substring(0, 30000) + "\n\n[... contenido truncado ...]"
      : allText;

    let parsedResponse: any = {};
    let patternsExtracted: ExtractedPattern[] = [];

    if (isExpertMode) {
      // EXPERT MODE — extracción de patrones UX/UI
      const expertPrompt = `Eres un experto en UX/UI Design Systems analizando recursos del proyecto "${folderName}".

Tienes acceso al contenido de ${textContents.length} documentos.

MISIÓN: Extraer TODOS los patrones de diseño visual y herramientas de implementación.

Tu respuesta DEBE ser ÚNICAMENTE un objeto JSON válido (sin markdown, sin backticks):
{
  "patterns": [
    {
      "name": "Nombre del patrón",
      "description": "Descripción",
      "category": "VISUAL_PATTERN" | "TOOL_IMPLEMENTATION",
      "howToApply": "Guía (OBLIGATORIO para VISUAL_PATTERN)",
      "cssCode": "CSS (OBLIGATORIO para VISUAL_PATTERN)",
      "installationCommand": "npm install X (OBLIGATORIO para TOOL_IMPLEMENTATION)",
      "docsUrl": "URL (OBLIGATORIO para TOOL_IMPLEMENTATION)",
      "sourceUrl": "referencia única"
    }
  ]
}`;

      try {
        const expertResult = await callLLM({
          model: "gemini-flash",
          systemPrompt: expertPrompt,
          userPrompt: truncatedText,
          jsonMode: true,
          temperature: 0.5,
          maxTokens: 2048,
        });
        const parsed = JSON.parse(expertResult.content);
        patternsExtracted = parsed.patterns || [];
      } catch (e: any) {
        console.error("[DRIVE_IMPORT] Error en Expert Mode:", e.message);
      }

      // PM analysis para Expert Mode
      try {
        const pmResult = await callLLM({
          model: "gemini-flash",
          systemPrompt: `Eres un PM analizando recursos UX/UI del proyecto "${folderName}". Responde SOLO con JSON válido.`,
          userPrompt: `Contenido de ${textContents.length} documentos:\n\n${truncatedText.substring(0, 15000)}\n\nJSON requerido:
{
  "concept": "Descripción de los recursos UX/UI encontrados",
  "targetMarket": "Quién usaría estos recursos",
  "metrics": "Cantidad de patrones y herramientas",
  "actionPlan": "Cómo aplicar estos recursos",
  "resources": "Herramientas principales identificadas",
  "description": "Resumen ejecutivo"
}`,
          jsonMode: true,
          temperature: 0.5,
          maxTokens: 2048,
        });
        parsedResponse = JSON.parse(pmResult.content);
      } catch {
        parsedResponse = { concept: `Recursos UX/UI: ${folderName}` };
      }

    } else {
      // STANDARD MODE — análisis PM con contenido real de los documentos
      const analysisPrompt = `Analiza el siguiente contenido del proyecto "${folderName}" y genera un análisis estratégico.

CONTENIDO DE ${textContents.length} DOCUMENTOS DEL PROYECTO:

${truncatedText}

INSTRUCCIONES:
- Basa tu análisis EXCLUSIVAMENTE en el contenido proporcionado
- NO inventes información que no esté en los documentos
- Si no hay suficiente información para un campo, escribe "Información no disponible en los documentos"
- Responde ÚNICAMENTE con JSON válido (sin markdown, sin backticks)

{
  "concept": "Qué es este proyecto según los documentos. Problema que resuelve, solución propuesta. Max 2000 chars.",
  "targetMarket": "Público objetivo según lo descrito en los documentos. Max 2000 chars.",
  "metrics": "KPIs o métricas mencionadas en los documentos. Max 2000 chars.",
  "actionPlan": "Próximos pasos o plan descrito en los documentos. Max 2000 chars.",
  "resources": "Recursos, tecnologías o herramientas mencionadas. Max 2000 chars.",
  "description": "Resumen ejecutivo basado en los documentos. Max 2000 chars."
}`;

      try {
        const result = await callLLM({
          model: "gemini-flash",
          systemPrompt: "",
          userPrompt: analysisPrompt,
          jsonMode: true,
          temperature: 0.3,
          maxTokens: 2048,
        });
        parsedResponse = JSON.parse(result.content);
        console.log(`[DRIVE_IMPORT] Análisis AI completado. Campos: ${Object.keys(parsedResponse).join(", ")}`);
      } catch (e: any) {
        console.error("[DRIVE_IMPORT] Error parseando análisis:", e.message);
        parsedResponse = {
          concept: `Proyecto importado: ${folderName}. ${textContents.length} documentos procesados.`,
          description: `Importación automática de ${allFiles.length} archivos desde Google Drive.`,
        };
      }
    }

    // 7. TRUNCAR campos
    const truncate = (str: string | undefined, maxLen: number = 2000): string | null => {
      if (!str) return null;
      return str.length > maxLen ? str.substring(0, maxLen) + "..." : str;
    };

    const concept = truncate(parsedResponse.concept) || `Proyecto importado: ${folderName}`;
    const targetMarket = truncate(parsedResponse.targetMarket);
    const metrics = truncate(parsedResponse.metrics);
    const actionPlan = truncate(parsedResponse.actionPlan);
    const resources = truncate(parsedResponse.resources) || `${allFiles.length} archivos, ${textContents.length} procesados`;
    const description = truncate(parsedResponse.description) || `Proyecto importado desde Drive: ${folderName}`;

    // 8. GUARDAR PROYECTO
    let project;

    if (existingProjectId) {
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
    }

    console.log(`[DRIVE_IMPORT] Proyecto ${existingProjectId ? "actualizado" : "creado"}: ${project.id}`);

    // 9. EXPERT MODE: guardar patrones
    let patternStats = { saved: 0, duplicates: 0, invalid: 0 };
    if (isExpertMode && patternsExtracted.length > 0) {
      patternStats = await processAndSavePatterns(patternsExtracted, project.id);
    }

    // 10. GUARDAR DriveDocSummary — metadata sin AI (resúmenes AI = Sprint H async)
    let docsSaved = 0;
    for (const file of textFiles) {
      try {
        await prisma.driveDocSummary.upsert({
          where: {
            projectId_driveFileId: {
              projectId: project.id,
              driveFileId: file.id,
            },
          },
          update: { fileName: file.name },
          create: {
            projectId: project.id,
            driveFileId: file.id,
            fileName: file.name,
            fileType: inferFileType(file.name, file.mimeType),
            summary: `Documento importado: ${file.name}`,
            keyInsights: [],
            category: null,
          },
        });
        docsSaved++;
      } catch (err: any) {
        console.warn(`[DRIVE_IMPORT] Error guardando doc ${file.name}: ${err.message}`);
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[DRIVE_IMPORT] Completado en ${duration}s — proyecto: ${project.id}, docs: ${docsSaved}`);

    return NextResponse.json({
      success: true,
      project,
      linkedToExisting: !!existingProjectId,
      expertMode: isExpertMode,
      stats: {
        totalFiles: allFiles.length,
        processedFiles: textContents.length,
        documents: textContents.length,
        images: 0,
        docSummaries: docsSaved,
        duration: `${duration}s`,
        files: { processed: processedNames, ignored: ignoredFiles },
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
    console.error(`[DRIVE_IMPORT] ❌ Error después de ${duration}s:`, error.message);

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
