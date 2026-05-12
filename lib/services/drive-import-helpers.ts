// =============================================================================
// Drive Import Helpers
// Funciones compartidas por el import inicial (/api/drive/analyze-folder) y
// el re-import (/api/projects/[id]/reimport-drive). Convergencia v2.
// =============================================================================

import type { Part } from "@/lib/clients/llm";
import { callLLM, callGeminiMultimodal } from "@/lib/clients/llm";
import mammoth from "mammoth";

// ─── Configuration ─────────────────────────────────────────────────────────────

export const CONFIG = {
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
  TEXT_EXTENSIONS: [".json", ".md", ".html", ".txt", ".csv", ".markdown", ".docx"],
  EXPERT_MODE_FOLDER_ID: "1ekDx8PsLfS2Dgn4C7qMTYRcx_yDti2Lh",

  MAX_FILES_BUSINESS: 50,
  MAX_FILES_CODE: 20,

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

  CODE_EXCLUDE_PATHS: [
    "node_modules", ".next", ".nuxt", "dist", "build", "out",
    ".git", "vendor", "__pycache__", ".venv", "venv", "env",
    "target", "coverage", ".cache", ".vercel", ".turbo",
  ],
  CODE_EXCLUDE_EXTENSIONS: [
    ".lock", ".log", ".map", ".min.js", ".min.css",
    ".DS_Store", ".gitignore", ".env", ".env.local",
  ],

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

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
}

export interface ProcessedFile {
  name: string;
  type: "image" | "text" | "pdf" | "skipped";
  content?: Part;
  error?: string;
}

export interface FolderAnalysis {
  totalFiles: number;
  processedFiles: number;
  images: number;
  documents: number;
  errors: string[];
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

export function isTextFileByExtension(filename: string): boolean {
  const lowerName = filename.toLowerCase();
  return CONFIG.TEXT_EXTENSIONS.some(ext => lowerName.endsWith(ext));
}

export function isImageFileByExtension(filename: string): boolean {
  const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
  const lowerName = filename.toLowerCase();
  return imageExtensions.some(ext => lowerName.endsWith(ext));
}

export function detectProjectType(allFiles: DriveFile[]): "code" | "business" {
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

export function filterAndPrioritizeFiles(
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

    low.push(file);
  }

  const allCandidates = [...high, ...medium, ...low];
  const selected = allCandidates.slice(0, CONFIG.MAX_FILES_BUSINESS);

  for (let i = CONFIG.MAX_FILES_BUSINESS; i < allCandidates.length; i++) {
    excluded.push({ name: allCandidates[i].name, reason: `límite ${CONFIG.MAX_FILES_BUSINESS} archivos (modo business)` });
  }

  return { selected, excluded };
}

export async function scanFolderRecursively(
  folderId: string,
  accessToken: string,
  depth: number = 0,
  maxDepth: number = 10,
  folderName: string = "root"
): Promise<DriveFile[]> {
  if (depth > maxDepth) {
    return [];
  }

  try {
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

    const folders = items.filter(item => item.mimeType === "application/vnd.google-apps.folder");
    const files = items.filter(item => item.mimeType !== "application/vnd.google-apps.folder");

    files.forEach(_file => {});
    if (folders.length > 0) {}

    let allFiles: DriveFile[] = [];

    for (const file of files) {
      allFiles.push(file);
    }

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

export async function processImageFile(
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

export async function processPdfFile(
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

export async function processTextFile(
  file: DriveFile,
  accessToken: string
): Promise<ProcessedFile> {
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

export async function processFilesInBatches(
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

  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map(async (file) => {
        const isTextByExt = isTextFileByExtension(file.name);
        const isImageByExt = isImageFileByExtension(file.name);

        if (
          file.name.toLowerCase().endsWith(".pdf") ||
          file.mimeType === "application/pdf"
        ) {
          return processPdfFile(file, accessToken);
        }

        if (isTextByExt) {
          return processTextFile(file, accessToken);
        }

        if (isImageByExt) {
          return processImageFile(file, accessToken);
        }

        if (CONFIG.SUPPORTED_IMAGE_TYPES.some((type) => file.mimeType.startsWith(type.split("/")[0]) && file.mimeType.includes(type.split("/")[1])) ||
            file.mimeType.startsWith("image/")) {
          return processImageFile(file, accessToken);
        }

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

        return { name: file.name, type: "skipped" as const, error: "Unsupported type" };
      })
    );

    for (const result of batchResults) {
      if (result.content) {
        parts.push(result.content);
        analysis.processedFiles++;
        if (result.type === "image") analysis.images++;
        if (result.type === "text") analysis.documents++;
        if (result.type === "pdf") analysis.documents++;
      }
      if (result.error) {
        analysis.errors.push(`${result.name}: ${result.error}`);
      }
    }

    if (i + batchSize < files.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return { parts, analysis };
}

export function inferFileType(fileName: string, mimeType: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.match(/\.(js|ts|tsx|jsx|py|java|go|rs|rb|php|css|scss|html)$/)) return "code";
  if (lower.match(/\.(jpg|jpeg|png|gif|webp|svg)$/)) return "image";
  if (lower.match(/\.(csv|xlsx|xls)$/) || mimeType.includes("spreadsheet")) return "spreadsheet";
  if (lower.match(/\.(md|markdown|txt)$/) || mimeType.includes("document") || mimeType.startsWith("text/")) return "document";
  if (lower.endsWith(".json")) return "data";
  return "document";
}

export async function summarizeDocument(
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

export async function summarizeDocumentMultimodal(
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
