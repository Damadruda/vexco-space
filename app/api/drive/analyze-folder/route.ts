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
  // File extensions to process as text (regardless of MIME type)
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
 * This handles cases where Google Drive reports .json, .md, .html as text/plain or application/octet-stream
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
 */
async function scanFolderRecursively(
  folderId: string,
  accessToken: string,
  depth: number = 0,
  maxDepth: number = 10,
  folderName: string = "root"
): Promise<DriveFile[]> {
  // DEBUG: Log current folder being scanned
  console.log(`\n📂 [Depth ${depth}] Scanning folder: "${folderName}" (ID: ${folderId})`);
  
  if (depth > maxDepth) {
    console.log(`⚠️ Max depth ${maxDepth} reached, stopping recursion`);
    return [];
  }

  try {
    // Query explicitly does NOT filter by mimeType - we want ALL items (files AND folders)
    const query = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    const fields = encodeURIComponent("files(id,name,mimeType,size)");
    const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}&pageSize=1000`;

    console.log(`   🔍 Query: '${folderId}' in parents and trashed=false`);

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      console.error(`   ❌ Failed to scan folder ${folderId}: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const items: DriveFile[] = data.files || [];
    
    // DEBUG: Separate folders and files for logging
    const folders = items.filter(item => item.mimeType === "application/vnd.google-apps.folder");
    const files = items.filter(item => item.mimeType !== "application/vnd.google-apps.folder");
    
    console.log(`   📊 Found ${items.length} items total: ${folders.length} folders, ${files.length} files`);
    
    // DEBUG: Log folder names found
    if (folders.length > 0) {
      console.log(`   📁 Subfolders: ${folders.map(f => f.name).join(", ")}`);
    }
    
    // DEBUG: Log file names and MIME types
    if (files.length > 0) {
      console.log(`   📄 Files at this level:`);
      files.forEach(file => {
        const extMatch = isTextFileByExtension(file.name) ? " ✅(text by ext)" : 
                        isImageFileByExtension(file.name) ? " ✅(image by ext)" : "";
        console.log(`      - "${file.name}" [${file.mimeType}]${extMatch}`);
      });
    }

    let allFiles: DriveFile[] = [];

    // First, add all non-folder files
    for (const file of files) {
      allFiles.push(file);
    }

    // Then recursively scan all subfolders
    for (const folder of folders) {
      console.log(`   ➡️ Entering subfolder: "${folder.name}"`);
      const subFiles = await scanFolderRecursively(
        folder.id, 
        accessToken, 
        depth + 1, 
        maxDepth,
        folder.name
      );
      allFiles = allFiles.concat(subFiles);
    }

    console.log(`   ✅ [Depth ${depth}] "${folderName}" total collected: ${allFiles.length} files`);
    return allFiles;
  } catch (error: any) {
    console.error(`   ❌ Error scanning folder ${folderId}:`, error.message);
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
  
  // Process in batches
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    
    const batchResults = await Promise.all(
      batch.map(async (file) => {
        // FIRST: Check by file extension (handles misreported MIME types)
        const isTextByExt = isTextFileByExtension(file.name);
        const isImageByExt = isImageFileByExtension(file.name);
        
        // Process as image if extension OR MIME type indicates image
        if (isImageByExt || 
            CONFIG.SUPPORTED_IMAGE_TYPES.some((type) => file.mimeType.startsWith(type.split("/")[0]) && file.mimeType.includes(type.split("/")[1])) ||
            file.mimeType.startsWith("image/")) {
          console.log(`   🖼️ Processing as IMAGE: "${file.name}" [${file.mimeType}]`);
          return processImageFile(file, accessToken);
        }
        // Process as text if extension indicates text file (regardless of MIME type)
        else if (isTextByExt) {
          console.log(`   📝 Processing as TEXT (by extension): "${file.name}" [${file.mimeType}]`);
          return processTextFile(file, accessToken);
        }
        // Check if MIME type indicates text/document
        else if (
          CONFIG.SUPPORTED_TEXT_TYPES.some((type) => file.mimeType === type || file.mimeType.includes(type.replace("application/vnd.", ""))) ||
          file.mimeType.includes("document") ||
          file.mimeType.startsWith("text/") ||
          file.mimeType.includes("spreadsheet") ||
          file.mimeType === "application/json" ||
          file.mimeType === "application/pdf"
        ) {
          console.log(`   📝 Processing as TEXT (by MIME): "${file.name}" [${file.mimeType}]`);
          return processTextFile(file, accessToken);
        }
        // Skip unsupported types
        console.log(`   ⏭️ Skipping unsupported: "${file.name}" [${file.mimeType}]`);
        return { name: file.name, type: "skipped" as const, error: "Unsupported type" };
      })
    );

    for (const result of batchResults) {
      if (result.content) {
        parts.push(result.content);
        analysis.processedFiles++;
        if (result.type === "image") analysis.images++;
        if (result.type === "text") analysis.documents++;
      }
      if (result.error) {
        analysis.errors.push(`${result.name}: ${result.error}`);
      }
    }

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
    
    if (!folderId || !folderName) {
      return NextResponse.json({ error: "folderId y folderName son requeridos" }, { status: 400 });
    }

    const accessToken = account.access_token;

    // 2. RECURSIVE FOLDER SCAN (subcarpetas)
    console.log(`\n${"=".repeat(60)}`);
    console.log(`🚀 Starting recursive scan of folder: "${folderName}" (${folderId})`);
    console.log(`${"=".repeat(60)}`);
    
    const allFiles = await scanFolderRecursively(folderId, accessToken, 0, 10, folderName);
    
    console.log(`\n${"=".repeat(60)}`);
    console.log(`📊 SCAN COMPLETE: Found ${allFiles.length} total files in folder hierarchy`);
    console.log(`${"=".repeat(60)}\n`);

    if (allFiles.length === 0) {
      return NextResponse.json({ 
        error: "La carpeta está vacía o no se pudo acceder" 
      }, { status: 400 });
    }

    // 3. MULTIMODAL PROCESSING (Images → Base64, Docs → Text)
    console.log("📥 Processing files for multimodal analysis...");
    const { parts, analysis } = await processFilesInBatches(allFiles, accessToken);
    console.log(`\n✅ Processed: ${analysis.processedFiles} files (${analysis.images} images, ${analysis.documents} documents)`);

    if (parts.length === 0) {
      return NextResponse.json({ 
        error: "No se pudieron procesar archivos compatibles",
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

    console.log("🤖 Generating AI analysis with Gemini...");
    const aiResponse = await generateWithFallback(analysisPrompt, parts);
    console.log("✅ AI analysis completed");

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
    console.log("💾 Saving analysis to database...");
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
    console.log(`🏁 Analysis completed in ${duration}s`);

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
    console.error(`❌ Analysis failed after ${duration}s:`, error);

    return NextResponse.json(
      {
        error: "Error en el análisis del proyecto",
        details: error.message,
        duration: `${duration}s`,
      },
      { status: 500 }
    );
  }
}
