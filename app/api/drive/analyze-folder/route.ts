import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import type { Part } from "@/lib/clients/llm";
import { callLLM, callGeminiMultimodal } from "@/lib/clients/llm";
import { classifyProjectSector } from "@/lib/firm-insights/sector-classifier";
import mammoth from "mammoth";

export const dynamic = "force-dynamic";
export const maxDuration = 500;

// Configuration constants
const CONFIG = {
  MAX_FILE_SIZE_MB: 10,
  MAX_TEXT_LENGTH: 8000,
  MAX_FILES_PER_BATCH: 20,
  MAX_PDF_SIZE_MB: 20,  // límite de Gemini para PDFs vía inlineData
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
  TEXT_EXTENSIONS: [".json", ".md", ".html", ".txt", ".csv", ".markdown", ".docx"],
  // UX/UI Expert Mode folder ID
  EXPERT_MODE_FOLDER_ID: "1ekDx8PsLfS2Dgn4C7qMTYRcx_yDti2Lh",

  // SMART IMPORT (Sprint K5.2)
  MAX_FILES_BUSINESS: 50,
  MAX_FILES_CODE: 20,

  // Code project detection signals (root-level files)
  CODE_INDICATORS_FILES: [
    "package.json", "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
    "tsconfig.json", "next.config.js", "next.config.ts", "vite.config.ts", "vite.config.js",
    "pyproject.toml", "requirements.txt", "setup.py", "Pipfile",
    "Cargo.toml", "go.mod", "pom.xml", "build.gradle", "Gemfile", "composer.json",
    "Dockerfile", "docker-compose.yml", "docker-compose.yaml",
    "webpack.config.js", "rollup.config.js", "tailwind.config.js", "tailwind.config.ts",
  ],
  CODE_INDICATORS_FOLDERS: [
    "src", "lib", "app", "components", "pages", "api", "routes",
    "node_modules", ".git", ".next", "dist", "build",
  ],

  // Files to ALWAYS exclude in code mode
  CODE_EXCLUDE_PATHS: [
    "node_modules", ".next", ".nuxt", "dist", "build", "out",
    ".git", "vendor", "__pycache__", ".venv", "venv", "env",
    "target", "coverage", ".cache", ".vercel", ".turbo",
  ],
  CODE_EXCLUDE_EXTENSIONS: [
    ".lock", ".log", ".map", ".min.js", ".min.css",
    ".DS_Store", ".gitignore", ".env", ".env.local",
  ],

  // High-priority files for code projects (always include if found)
  CODE_PRIORITY_FILES: [
    "README.md", "README.txt", "README.rst", "README",
    "package.json", "pyproject.toml", "requirements.txt", "Cargo.toml", "go.mod",
    "tsconfig.json", "next.config.js", "next.config.ts",
    "tailwind.config.js", "tailwind.config.ts",
    "CHANGELOG.md", "ROADMAP.md", "ARCHITECTURE.md", "CONTRIBUTING.md",
    "Dockerfile", "docker-compose.yml",
    ".env.example",
  ],
  CODE_PRIORITY_FOLDERS: ["docs", "documentation"],
};

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
}

interface ProcessedFile {
  name: string;
  type: "image" | "text" | "pdf" | "skipped";
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
 * Detect if a folder contains a code project by looking at its file/folder names.
 * Returns "code" if 2+ code indicators are found, "business" otherwise.
 */
function detectProjectType(allFiles: DriveFile[]): "code" | "business" {
  let codeScore = 0;

  for (const file of allFiles) {
    const lowerName = file.name.toLowerCase();

    if (CONFIG.CODE_INDICATORS_FILES.some(indicator =>
      lowerName === indicator.toLowerCase()
    )) {
      codeScore += 2;
    }

    if (file.mimeType === "application/vnd.google-apps.folder") {
      if (CONFIG.CODE_INDICATORS_FOLDERS.includes(lowerName)) {
        codeScore += 1;
      }
    }
  }

  return codeScore >= 2 ? "code" : "business";
}

/**
 * Filter and prioritize files based on project type.
 * - For "code" projects: only include README, configs, docs, exclude node_modules etc.
 * - For "business" projects: exclude images, prioritize PDFs/DOCX/Sheets.
 */
function filterAndPrioritizeFiles(
  allFiles: DriveFile[],
  projectType: "code" | "business"
): { selected: DriveFile[]; excluded: { name: string; reason: string }[] } {
  const excluded: { name: string; reason: string }[] = [];

  if (projectType === "code") {
    const priority: DriveFile[] = [];
    const docs: DriveFile[] = [];
    const other: DriveFile[] = [];

    for (const file of allFiles) {
      const lowerName = file.name.toLowerCase();

      if (file.mimeType === "application/vnd.google-apps.folder") continue;

      if (CONFIG.CODE_EXCLUDE_PATHS.some(excl => lowerName.includes(excl))) {
        excluded.push({ name: file.name, reason: "carpeta excluida (build/deps)" });
        continue;
      }

      if (CONFIG.CODE_EXCLUDE_EXTENSIONS.some(ext => lowerName.endsWith(ext))) {
        excluded.push({ name: file.name, reason: "extensión excluida" });
        continue;
      }

      if (isImageFileByExtension(file.name) || file.mimeType.startsWith("image/")) {
        excluded.push({ name: file.name, reason: "imagen" });
        continue;
      }

      if (CONFIG.CODE_PRIORITY_FILES.some(prio =>
        lowerName === prio.toLowerCase()
      )) {
        priority.push(file);
        continue;
      }

      if (lowerName.endsWith(".md") || lowerName.endsWith(".txt") || lowerName.endsWith(".rst")) {
        docs.push(file);
        continue;
      }

      other.push(file);
    }

    const allCandidates = [...priority, ...docs, ...other];
    const selected = allCandidates.slice(0, CONFIG.MAX_FILES_CODE);

    for (let i = CONFIG.MAX_FILES_CODE; i < allCandidates.length; i++) {
      excluded.push({ name: allCandidates[i].name, reason: `límite ${CONFIG.MAX_FILES_CODE} archivos (modo código)` });
    }

    return { selected, excluded };
  }

  // BUSINESS MODE
  const high: DriveFile[] = [];
  const medium: DriveFile[] = [];
  const low: DriveFile[] = [];

  for (const file of allFiles) {
    const lowerName = file.name.toLowerCase();

    if (file.mimeType === "application/vnd.google-apps.folder") continue;

    // Imágenes en business mode: incluir como medium priority (assets visuales del proyecto)
    if (isImageFileByExtension(file.name) || file.mimeType.startsWith("image/")) {
      const fileSize = parseInt(file.size || "0");
      if (fileSize > CONFIG.MAX_FILE_SIZE_MB * 1024 * 1024) {
        excluded.push({ name: file.name, reason: `imagen > ${CONFIG.MAX_FILE_SIZE_MB}MB` });
        continue;
      }
      medium.push(file);
      continue;
    }

    if (lowerName.endsWith(".pdf") || lowerName.endsWith(".docx") || file.mimeType.includes("document")) {
      high.push(file);
      continue;
    }

    if (lowerName.endsWith(".csv") || lowerName.endsWith(".xlsx") ||
        file.mimeType.includes("spreadsheet") || file.mimeType.includes("presentation")) {
      medium.push(file);
      continue;
    }

    if (lowerName.endsWith(".txt") || lowerName.endsWith(".md") ||
        lowerName.endsWith(".json") || lowerName.endsWith(".html")) {
      low.push(file);
      continue;
    }

    // Remaining supported types (Google Docs, etc. caught by mimeType above)
    low.push(file);
  }

  const allCandidates = [...high, ...medium, ...low];
  const selected = allCandidates.slice(0, CONFIG.MAX_FILES_BUSINESS);

  for (let i = CONFIG.MAX_FILES_BUSINESS; i < allCandidates.length; i++) {
    excluded.push({ name: allCandidates[i].name, reason: `límite ${CONFIG.MAX_FILES_BUSINESS} archivos (modo business)` });
  }

  return { selected, excluded };
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
 * Download PDF as Base64 inlineData for Gemini multimodal.
 * Gemini 2.5 Pro acepta PDFs nativos hasta 20MB y procesa texto + layout + imágenes embebidas.
 */
async function processPdfFile(
  file: DriveFile,
  accessToken: string
): Promise<ProcessedFile> {
  try {
    const fileSize = parseInt(file.size || "0");
    if (fileSize > CONFIG.MAX_PDF_SIZE_MB * 1024 * 1024) {
      return { name: file.name, type: "skipped", error: `PDF > ${CONFIG.MAX_PDF_SIZE_MB}MB` };
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
      type: "pdf",
      content: {
        inlineData: {
          data: base64Data,
          mimeType: "application/pdf",
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
        
        // PRIORITY 0.5: PDFs vía multimodal inlineData (no como texto)
        if (
          file.name.toLowerCase().endsWith(".pdf") ||
          file.mimeType === "application/pdf"
        ) {
          return processPdfFile(file, accessToken);
        }

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
        if (result.type === "pdf") analysis.documents++;
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
 * Generate dense individual summary for a text document using Pro 2.5 stable + REGLA #0.5.
 * T2 — output read by agents in War Room context. Per Convergencia v2.
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

  const truncated =
    textContent.length > 12000
      ? textContent.substring(0, 12000) + "\n[... contenido truncado ...]"
      : textContent;

  try {
    const response = await callLLM({
      model: "gemini-pro-stable",
      systemPrompt: `Eres un analista de documentos de Vex&Co Lab. Tu tarea es producir un summary denso del documento + 3-5 insights clave + categoria.

REGLA #0.5 — ANTI-ALUCINACION (CRITICA):
PROHIBIDO inventar nombres de empresas, marcas, productos, personas, lugares, cifras, frameworks o estadisticas que NO aparezcan literalmente en el texto fuente. Si una informacion no aparece, omite el campo o usa formulaciones genericas. La omision es siempre mejor que la invencion.

PROHIBIDO inventar estadisticas de mercado, porcentajes de fracaso, tamaños de TAM/SAM/SOM, valoraciones, precios o ratios que no aparezcan literalmente en el documento. Si necesitas referirte a un patron sin tener la cifra, usa "multiples casos documentados" o "patron observado en el documento". NUNCA inventes el numero, ni siquiera para hacer un argumento mas convincente.

CONTEXTO DEL PROYECTO: ${projectContext}

OBJETIVO DEL SUMMARY:
El summary debe permitir a otro analista o agente entender el contenido del documento sin tener que leerlo. NO es un titular — es una sintesis densa de 4-7 frases que captura: que es el documento, que datos/decisiones contiene, que conclusiones se pueden extraer, y por que es relevante al proyecto.

KEY INSIGHTS:
3-5 insights concretos extraidos del documento, cada uno una frase declarativa. NO generalidades — datos especificos, decisiones tomadas, hallazgos validados.

CATEGORY: una de strategy, technical, financial, design, research, operations, legal, other.

RESPONDE UNICAMENTE con JSON valido (sin markdown, sin backticks):
{
  "summary": "sintesis densa de 4-7 frases",
  "keyInsights": ["insight 1", "insight 2", "insight 3"],
  "category": "strategy|technical|financial|design|research|operations|legal|other"
}`,
      userPrompt: `Documento: ${fileName}\n\nContenido:\n${truncated}`,
      jsonMode: true,
      temperature: 0.2,
      maxTokens: 2048,
    });

    const parsed = JSON.parse(response.content);
    return {
      summary: parsed.summary || `Documento: ${fileName}`,
      keyInsights: Array.isArray(parsed.keyInsights) ? parsed.keyInsights.slice(0, 5) : [],
      category: parsed.category || null,
      wordCount,
    };
  } catch (error: any) {
    console.warn(`[DOC_SUMMARY] Error summarizing ${fileName}: ${error.message}`);
    return {
      summary: `Documento importado: ${fileName} (${wordCount} palabras). Resumen automatico fallo — leer archivo original.`,
      keyInsights: [],
      category: null,
      wordCount,
    };
  }
}

/**
 * Per-file PDF summary via Gemini multimodal Pro 2.5.
 * Used when the file is a PDF (already in inlineData base64 form).
 */
async function summarizeDocumentMultimodal(
  fileName: string,
  pdfPart: Part,
  projectContext: string
): Promise<{
  summary: string;
  keyInsights: string[];
  category: string | null;
  wordCount: number;
}> {
  try {
    const systemPrompt = `Eres un analista de documentos de Vex&Co Lab. Tienes un PDF nativo. Produce summary denso + insights + categoria.

REGLA #0.5 — ANTI-ALUCINACION:
PROHIBIDO inventar nombres, cifras, fechas, empresas o estadisticas que no aparezcan en el PDF. La omision es siempre mejor que la invencion.

CONTEXTO DEL PROYECTO: ${projectContext}

OBJETIVO: summary denso 4-7 frases + 3-5 keyInsights concretos + category.`;

    const userPrompt = `Documento PDF: ${fileName}.

Devuelve JSON:
{
  "summary": "sintesis densa 4-7 frases",
  "keyInsights": ["insight 1", "insight 2", "insight 3"],
  "category": "strategy|technical|financial|design|research|operations|legal|other"
}`;

    const result = await callGeminiMultimodal(
      systemPrompt,
      userPrompt,
      [pdfPart],
      true,
      2048,
      0.2,
      "gemini-2.5-pro"
    );

    const parsed = JSON.parse(result.content);
    return {
      summary: parsed.summary || `PDF: ${fileName}`,
      keyInsights: Array.isArray(parsed.keyInsights) ? parsed.keyInsights.slice(0, 5) : [],
      category: parsed.category || null,
      wordCount: 0,
    };
  } catch (error: any) {
    console.warn(`[DOC_SUMMARY_PDF] Error summarizing ${fileName}: ${error.message}`);
    return {
      summary: `PDF importado: ${fileName}. Resumen automatico fallo — leer archivo original.`,
      keyInsights: [],
      category: null,
      wordCount: 0,
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

    // 2. SCAN — depth 5 to capture both code repos and business folders
    const allFiles = await scanFolderRecursively(folderId, accessToken, 0, 5, folderName);
    const scanTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[DRIVE_IMPORT] Scan: ${scanTime}s — ${allFiles.length} archivos encontrados`);

    if (allFiles.length === 0) {
      return NextResponse.json({
        error: `La carpeta está vacía o no contiene archivos compatibles. Carpeta ID: ${folderId}`
      }, { status: 400 });
    }

    // 3. DETECTAR TIPO DE PROYECTO + FILTRAR INTELIGENTEMENTE (Sprint K5.2)
    const projectType = detectProjectType(allFiles);
    console.log(`[DRIVE_IMPORT] Tipo detectado: ${projectType.toUpperCase()}`);

    const { selected: textFiles, excluded: smartExcluded } = filterAndPrioritizeFiles(allFiles, projectType);

    console.log(`[DRIVE_IMPORT] Procesando ${textFiles.length} archivos (${smartExcluded.length} excluidos por filtro inteligente)`);
    if (textFiles.length > 0) {
      console.log(`[DRIVE_IMPORT] Archivos seleccionados:`, textFiles.map(f => f.name).slice(0, 10).join(", "), textFiles.length > 10 ? `... y ${textFiles.length - 10} más` : "");
    }

    // 4. PROCESAR archivos vía multimodal (texto + imágenes + PDFs)
    const { parts, analysis: batchAnalysis } = await processFilesInBatches(
      textFiles,
      accessToken,
      CONFIG.MAX_FILES_PER_BATCH
    );

    const downloadTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(
      `[DRIVE_IMPORT] Procesado: ${downloadTime}s | ` +
      `${batchAnalysis.processedFiles}/${textFiles.length} archivos ` +
      `(${batchAnalysis.documents} docs, ${batchAnalysis.images} imágenes)`
    );
    console.log(`[DRIVE_IMPORT] Errores de descarga: ${batchAnalysis.errors.length}`);

    if (parts.length === 0) {
      return NextResponse.json({
        error: `No se pudo procesar ningún archivo. Carpeta ID: ${folderId}`,
        details: batchAnalysis.errors.slice(0, 5).join("; "),
      }, { status: 400 });
    }

    // Lista de nombres procesados (para metadata + DriveDocSummary loop)
    const processedFileNames = textFiles
      .filter((f) => !batchAnalysis.errors.some(e => e.startsWith(f.name)))
      .map(f => f.name);

    const ignoredFiles = batchAnalysis.errors.map(e => {
      const [name, ...rest] = e.split(": ");
      return { name, reason: rest.join(": ") };
    });

    // 5. SAFETY CHECK — si llevamos >240s, crear proyecto mínimo
    const elapsedBeforeAI = parseFloat(((Date.now() - startTime) / 1000).toFixed(1));
    if (elapsedBeforeAI > 240) {
      console.warn(`[DRIVE_IMPORT] ⚠️ ${elapsedBeforeAI}s — creando proyecto mínimo sin análisis AI`);

      const project = existingProjectId
        ? await prisma.project.update({
            where: { id: existingProjectId },
            data: { driveFolderId: folderId },
          })
        : await prisma.project.create({
            data: {
              title: folderName,
              description: `Importado desde Drive. ${allFiles.length} archivos, ${parts.length} procesados. Análisis pendiente por timeout.`,
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
          processedFiles: parts.length,
          duration: `${((Date.now() - startTime) / 1000).toFixed(2)}s`,
          warning: "Análisis AI omitido por tiempo. Re-importa para completar.",
          files: { processed: processedFileNames, ignored: ignoredFiles },
        },
      });
    }

    // 6. ANÁLISIS AI MULTIMODAL — Gemini 2.5 Pro ve texto + imágenes + PDFs nativamente
    let parsedResponse: any = {};
    let patternsExtracted: ExtractedPattern[] = [];
    let documentsClassified: Array<{ fileName: string; assetRole: string; visualDescription: string }> = [];

    if (isExpertMode) {
      // EXPERT MODE — extracción de patrones UX/UI (texto-only por ahora)
      const textOnlyParts = parts.filter(p => "text" in p);
      const truncatedText = textOnlyParts
        .map(p => ("text" in p ? p.text : ""))
        .join("\n\n")
        .substring(0, 30000);

      const expertPrompt = `Eres un experto en UX/UI Design Systems analizando recursos del proyecto "${folderName}".

Tienes acceso al contenido de ${textOnlyParts.length} documentos.

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

      // PM analysis para Expert Mode (también texto-only por ahora)
      try {
        const pmResult = await callLLM({
          model: "gemini-flash",
          systemPrompt: `Eres un PM analizando recursos UX/UI del proyecto "${folderName}". Responde SOLO con JSON válido.`,
          userPrompt: `Contenido de ${textOnlyParts.length} documentos:\n\n${truncatedText.substring(0, 15000)}\n\nJSON requerido:
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
      // STANDARD MODE — análisis multimodal con texto + imágenes + PDFs
      const fileListForPrompt = textFiles
        .map((f, i) => `${i + 1}. ${f.name} (${f.mimeType})`)
        .join("\n");

      const analysisPrompt = `Analiza los siguientes archivos del proyecto "${folderName}" y genera un análisis estratégico estructurado.

ARCHIVOS DISPONIBLES (${textFiles.length} total):
${fileListForPrompt}

INSTRUCCIONES:
- Tienes acceso multimodal: lees texto, ves imágenes y procesas PDFs nativamente.
- Basa tu análisis EXCLUSIVAMENTE en el contenido proporcionado.
- NO inventes información que no esté en los archivos.
- Si no hay info para un campo, escribe "Información no disponible en los archivos".
- Para CADA archivo procesado, clasifica su rol (assetRole). Para IMAGENES (mimeType image/*), describe brevemente qué se ve en visualDescription. Para documentos de texto y PDFs, deja visualDescription vacio o null — el summary denso vendra de un proceso posterior per-file.

REGLA #0.5 ANTI-HALUCINACION (CRITICA):
- Si los archivos no contienen informacion sobre un campo, NO lo inventes. Indica explicitamente la ausencia.
- PROHIBIDO inventar estadisticas de mercado, porcentajes, tamaños TAM/SAM/SOM, valoraciones, ratios o cifras cuantitativas que no aparezcan literalmente en los archivos. Usa formulaciones cualitativas si hace falta.
- Una cifra inventada destruye la credibilidad de todo el analisis.

Responde ÚNICAMENTE con JSON válido:
{
  "concept": "Qué es este proyecto según los archivos. Problema y solución. Max 2000 chars.",
  "targetMarket": "Público objetivo según los archivos. Max 2000 chars.",
  "metrics": "KPIs o métricas mencionadas. Max 2000 chars.",
  "actionPlan": "Próximos pasos descritos. Max 2000 chars.",
  "resources": "Recursos, tecnologías o herramientas mencionadas. Max 2000 chars.",
  "description": "Resumen ejecutivo. Max 2000 chars.",
  "documents": [
    {
      "fileName": "nombre exacto del archivo procesado",
      "assetRole": "logo|brand_asset|mockup|screenshot|reference|content|data|technical_spec|other",
      "visualDescription": "Descripción concreta de qué contiene el archivo (1-2 frases). Para imágenes: describe lo que se ve. Para docs: describe el contenido principal."
    }
  ]
}`;

      try {
        const result = await callGeminiMultimodal(
          "",
          analysisPrompt,
          parts,
          true,
          4096,
          0.3
        );
        parsedResponse = JSON.parse(result.content);
        documentsClassified = parsedResponse.documents || [];
        console.log(
          `[DRIVE_IMPORT] Multimodal análisis OK. ` +
          `Campos: ${Object.keys(parsedResponse).join(", ")}. ` +
          `Documentos clasificados: ${documentsClassified.length}`
        );
      } catch (e: any) {
        console.error("[DRIVE_IMPORT] Error parseando análisis multimodal:", e.message);
        parsedResponse = {
          concept: `Proyecto importado: ${folderName}. ${parts.length} archivos procesados.`,
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
    const resources = truncate(parsedResponse.resources) || `${allFiles.length} archivos, ${parts.length} procesados`;
    const description = truncate(parsedResponse.description) || `Proyecto importado desde Drive: ${folderName}`;

    // 8. GUARDAR PROYECTO
    let project: Awaited<ReturnType<typeof prisma.project.create>>;

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

    // Auto-classify NAICS sector (fire-and-forget)
    classifyProjectSector({
      title: project.title,
      description: project.description,
      concept: parsedResponse.concept ?? null,
      targetMarket: parsedResponse.targetMarket ?? null,
    })
      .then((res) => {
        if (res.naicsSector || res.confidence > 0) {
          return prisma.project.update({
            where: { id: project.id },
            data: {
              naicsSector: res.naicsSector,
              naicsSectorConfidence: res.confidence,
            },
          });
        }
      })
      .catch((err) => console.warn("[PROJECT_NAICS_HOOK]", err));

    // 9. EXPERT MODE: guardar patrones
    let patternStats = { saved: 0, duplicates: 0, invalid: 0 };
    if (isExpertMode && patternsExtracted.length > 0) {
      patternStats = await processAndSavePatterns(patternsExtracted, project.id);
    }

    // 10. GUARDAR DriveDocSummary — caller per-file con Pro 2.5 (Convergencia v2)
    let docsSaved = 0;
    const classificationByName = new Map(
      documentsClassified.map(d => [d.fileName, d])
    );

    // Construir mapas para que cada file tenga su contenido recuperable sin re-fetch.
    const textContentByName = new Map<string, string>();
    for (const part of parts) {
      if ("text" in part) {
        const m = part.text.match(/--- Archivo: (.+?) ---\n([\s\S]*?)(?=\n--- Archivo:|$)/);
        if (m) {
          textContentByName.set(m[1].trim(), m[2].trim());
        }
      }
    }

    // PDFs: el orden de pdf parts en `parts` coincide con el orden de PDFs en textFiles
    const pdfPartByName = new Map<string, Part>();
    const pdfPartsOrdered = parts.filter(
      (p): p is { inlineData: { data: string; mimeType: string } } =>
        "inlineData" in p && p.inlineData.mimeType === "application/pdf"
    );
    let pdfIdx = 0;
    for (const file of textFiles) {
      const isPdf =
        file.mimeType === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf");
      if (isPdf && pdfPartsOrdered[pdfIdx]) {
        pdfPartByName.set(file.name, pdfPartsOrdered[pdfIdx]);
        pdfIdx++;
      }
    }

    const projectContextStr = `Titulo: ${folderName}. ${parsedResponse.concept ? `Concepto: ${String(parsedResponse.concept).slice(0, 300)}.` : ""}`;

    // Procesar en batches de 4 para paralelismo controlado
    const BATCH_SIZE = 4;
    for (let i = 0; i < textFiles.length; i += BATCH_SIZE) {
      const batch = textFiles.slice(i, i + BATCH_SIZE);
      const summaryResults = await Promise.all(
        batch.map(async (file) => {
          const fileType = inferFileType(file.name, file.mimeType);
          // Skip imagenes — su visualDescription viene del multimodal global
          if (fileType === "image") {
            return null;
          }

          // PDFs: multimodal per-file
          const isPdf =
            file.mimeType === "application/pdf" ||
            file.name.toLowerCase().endsWith(".pdf");
          if (isPdf) {
            const pdfPart = pdfPartByName.get(file.name);
            if (pdfPart) {
              return await summarizeDocumentMultimodal(file.name, pdfPart, projectContextStr);
            }
            return null;
          }

          // Text files
          const textContent = textContentByName.get(file.name);
          if (!textContent) return null;
          return await summarizeDocument(file.name, textContent, projectContextStr);
        })
      );

      for (let j = 0; j < batch.length; j++) {
        const file = batch[j];
        const summaryRes = summaryResults[j];
        const classification = classificationByName.get(file.name);
        const fileType = inferFileType(file.name, file.mimeType);

        try {
          // Para imagenes: usar visualDescription del global como summary (sin caller)
          // Para text/PDF: usar summary denso del caller
          const summaryText = summaryRes?.summary
            ?? classification?.visualDescription
            ?? `Documento importado: ${file.name}`;
          const keyInsights = summaryRes?.keyInsights ?? [];
          const category = summaryRes?.category ?? null;
          const wordCount = summaryRes?.wordCount ?? null;

          await prisma.driveDocSummary.upsert({
            where: {
              projectId_driveFileId: {
                projectId: project.id,
                driveFileId: file.id,
              },
            },
            update: {
              fileName: file.name,
              summary: summaryText,
              keyInsights,
              category,
              wordCount,
              ...(classification?.assetRole ? { assetRole: classification.assetRole } : {}),
              ...(classification?.visualDescription ? { visualDescription: classification.visualDescription } : {}),
            },
            create: {
              projectId: project.id,
              driveFileId: file.id,
              fileName: file.name,
              fileType,
              summary: summaryText,
              keyInsights,
              category,
              wordCount,
              assetRole: classification?.assetRole ?? null,
              visualDescription: classification?.visualDescription ?? null,
            },
          });
          docsSaved++;
        } catch (err: any) {
          console.warn(`[DRIVE_IMPORT] Error guardando doc ${file.name}: ${err.message}`);
        }
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
        processedFiles: batchAnalysis.processedFiles,
        projectType,
        documents: batchAnalysis.documents,
        images: batchAnalysis.images,
        docSummaries: docsSaved,
        duration: `${duration}s`,
        files: {
          processed: processedFileNames,
          ignored: ignoredFiles,
          smartExcluded: smartExcluded.slice(0, 20),
        },
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
