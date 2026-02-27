import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { GoogleGenerativeAI, Part } from "@google/generative-ai";

// Initialize Gemini with the correct model identifier
// NOTE: "gemini-1.5-flash" causes 404 on v1beta. Use "gemini-1.5-flash-latest" or "gemini-2.0-flash"
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// Configuration constants
const CONFIG = {
  // Model options (try in order if one fails)
  GEMINI_MODELS: ["gemini-1.5-flash-latest", "gemini-2.0-flash-exp", "gemini-pro-vision"],
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
 */
async function generateWithFallback(
  prompt: string,
  parts: Part[]
): Promise<string> {
  let lastError: Error | null = null;

  for (const modelName of CONFIG.GEMINI_MODELS) {
    try {
      console.log(`Trying Gemini model: ${modelName}`);
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent([prompt, ...parts]);
      const response = result.response.text();
      console.log(`Success with model: ${modelName}`);
      return response;
    } catch (error: any) {
      console.error(`Model ${modelName} failed:`, error.message);
      lastError = error;
      continue;
    }
  }

  throw lastError || new Error("All Gemini models failed");
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
    const analysisPrompt = `
Eres un consultor de negocios experto. Analiza en profundidad el proyecto "${folderName}" usando todos los archivos proporcionados.

IMPORTANTE: Recibirás archivos estructurados incluyendo:
- JSON (datos de X/Twitter, APIs, configuraciones) - PRIORIZA extraer tendencias, métricas de engagement, y patrones de crecimiento
- HTML (páginas web, emails, contenido)
- Markdown (documentación, notas)
- PDF (documentos, reportes)
- Imágenes y Google Docs

Si encuentras datos de X (Twitter) en archivos JSON, analiza especialmente:
- Métricas de engagement (likes, retweets, replies)
- Tendencias de crecimiento de seguidores
- Hashtags y temas más mencionados
- Horarios de publicación óptimos
- Contenido de mejor rendimiento

Tu análisis debe incluir las siguientes secciones en formato Markdown:

## 📊 RESUMEN EJECUTIVO
Un párrafo conciso describiendo el proyecto, su propósito y estado actual.

## 🎯 OBJETIVOS Y CONCEPTO
- Objetivo principal del proyecto
- Concepto o idea central
- Problema que resuelve

## 📈 TENDENCIAS Y MÉTRICAS
- Análisis de tendencias extraídas de los datos (JSON, métricas de redes sociales)
- Si hay datos de X/Twitter: engagement rate, crecimiento, mejores posts
- Oportunidades identificadas basadas en los datos
- Competencia potencial

## 🔧 ESTADO TÉCNICO
- Progreso actual del desarrollo/implementación
- Tecnologías o herramientas identificadas
- Áreas que necesitan atención

## 💡 RECOMENDACIONES
- Próximos pasos sugeridos basados en los datos analizados
- Prioridades a considerar
- Recursos potencialmente necesarios

## 📋 MÉTRICAS CLAVE
- KPIs extraídos de los datos o sugeridos
- Indicadores de éxito cuantificables

Archivos analizados: ${analysis.processedFiles} (${analysis.images} imágenes, ${analysis.documents} documentos)
`;

    console.log("🤖 Generando análisis con Gemini AI...");
    const aiResponse = await generateWithFallback(analysisPrompt, parts);
    console.log("✅ Análisis AI completado");

    // 5. EXTRACT STRUCTURED DATA FROM ANALYSIS
    // Parse sections from the AI response for framework fields
    const extractSection = (text: string, sectionName: string): string => {
      const regex = new RegExp(`##\\s*[^\\n]*${sectionName}[^\\n]*\\n([\\s\\S]*?)(?=##|$)`, "i");
      const match = text.match(regex);
      return match ? match[1].trim() : "";
    };

    const concept = extractSection(aiResponse, "OBJETIVOS|CONCEPTO");
    const targetMarket = extractSection(aiResponse, "TENDENCIAS|MERCADO");
    const metrics = extractSection(aiResponse, "MÉTRICAS|KPI");
    const actionPlan = extractSection(aiResponse, "RECOMENDACIONES|PRÓXIMOS");

    // 6. SAVE TO PROJECT TABLE (NEON DB)
    console.log("💾 Guardando análisis en base de datos...");
    const project = await prisma.project.create({
      data: {
        title: folderName,
        description: aiResponse,
        status: "active",
        projectType: "idea",
        category: "Google Drive Import",
        priority: "medium",
        progress: 10,
        userId: session.user.id,
        // Framework fields with extracted data
        concept: concept || `Proyecto importado desde Google Drive: ${folderName}`,
        targetMarket: targetMarket || null,
        metrics: metrics || null,
        actionPlan: actionPlan || null,
        resources: `Archivos analizados: ${analysis.processedFiles}\nImágenes: ${analysis.images}\nDocumentos: ${analysis.documents}`,
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
