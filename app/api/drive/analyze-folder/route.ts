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

    // 4. GEMINI AI ANALYSIS (with model fallback)
    // STRUCTURED JSON PROMPT: Request JSON output for reliable database persistence
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
    const aiResponse = await generateWithFallback(analysisPrompt, parts);
    console.log("✅ Análisis PM completado");

    // 5. PARSE JSON RESPONSE FROM AI
    // Extract JSON from response (handle potential markdown code blocks)
    let parsedResponse: {
      concept?: string;
      targetMarket?: string;
      metrics?: string;
      actionPlan?: string;
      resources?: string;
      description?: string;
    } = {};

    try {
      // Try to extract JSON from the response
      let jsonString = aiResponse.trim();
      
      // Remove markdown code blocks if present
      if (jsonString.startsWith("```json")) {
        jsonString = jsonString.replace(/^```json\s*/, "").replace(/\s*```$/, "");
      } else if (jsonString.startsWith("```")) {
        jsonString = jsonString.replace(/^```\s*/, "").replace(/\s*```$/, "");
      }
      
      // Parse the JSON
      parsedResponse = JSON.parse(jsonString);
      console.log("[JSON PARSER] ✅ JSON parseado correctamente");
      console.log("[JSON PARSER] Campos recibidos:", Object.keys(parsedResponse).join(", "));
    } catch (parseError: any) {
      console.error("[JSON PARSER] ❌ Error parseando JSON:", parseError.message);
      console.log("[JSON PARSER] Respuesta original (primeros 500 chars):", aiResponse.substring(0, 500));
      
      // Fallback: use raw response as description
      parsedResponse = {
        concept: `Proyecto importado desde Google Drive: ${folderName}`,
        description: aiResponse,
      };
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
    const description = truncate(parsedResponse.description) || aiResponse.substring(0, 2000);

    console.log("[PM PARSER] Campos mapeados para DB:");
    console.log("  - concept:", concept?.length, "chars");
    console.log("  - targetMarket:", targetMarket?.length || 0, "chars");
    console.log("  - metrics:", metrics?.length || 0, "chars");
    console.log("  - actionPlan:", actionPlan?.length || 0, "chars");
    console.log("  - resources:", resources?.length || 0, "chars");
    console.log("  - description:", description?.length || 0, "chars");

    // 6. SAVE TO PROJECT TABLE (NEON DB) - Structured JSON mapping
    console.log("💾 Guardando análisis PM en base de datos...");
    const project = await prisma.project.create({
      data: {
        title: folderName,
        description: description, // AI-generated executive summary
        status: "active",
        projectType: "idea",
        category: "Google Drive Import",
        priority: "medium",
        progress: 10,
        userId: session.user.id,
        // PM Framework fields - mapped from structured JSON response
        concept: concept,
        targetMarket: targetMarket,
        metrics: metrics,
        actionPlan: actionPlan,
        resources: resources,
        currentStep: 1,
      },
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`🏁 Análisis completado en ${duration}s`);

    return NextResponse.json({
      success: true,
      project,
      stats: {
        totalFiles: analysis.totalFiles,
        processedFiles: analysis.processedFiles,
        images: analysis.images,
        documents: analysis.documents,
        duration: `${duration}s`,
        errors: analysis.errors.length > 0 ? analysis.errors.slice(0, 5) : undefined,
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
