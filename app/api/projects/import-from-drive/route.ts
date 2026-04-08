import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { getDefaultUserId } from "@/lib/get-default-user";
import { callLLM } from "@/lib/clients/llm";

export const maxDuration = 300;

interface FileContent {
  name: string;
  path: string;
  mimeType: string;
  content: string;
  url?: string;
}

// ─── File extraction from Google Drive ───────────────────────────────────────

async function extractFileContent(
  fileId: string,
  mimeType: string,
  accessToken: string
): Promise<string> {
  try {
    if (mimeType.includes("google-apps")) {
      let exportMimeType = "text/plain";
      if (mimeType.includes("spreadsheet")) exportMimeType = "text/csv";

      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(exportMimeType)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (response.ok) return await response.text();
    }

    if (mimeType === "application/pdf" || mimeType.startsWith("text/")) {
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (response.ok) return await response.text();
    }

    return "";
  } catch (error) {
    console.error(`[import-from-drive] extract error for ${fileId}:`, error);
    return "";
  }
}

// ─── Smart file filtering (Sprint K5.2 + Sprint Audit enhancements) ─────────

const BUSINESS_MIMES = [
  "application/vnd.google-apps.document",
  "application/vnd.google-apps.presentation",
  "application/vnd.google-apps.spreadsheet",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
];

const CODE_EXTENSIONS = [
  ".js", ".ts", ".tsx", ".jsx", ".py", ".rb", ".php", ".java", ".swift",
  ".kt", ".go", ".rs", ".css", ".scss", ".html", ".vue", ".svelte",
];

const IGNORED_PATTERNS = [
  "node_modules", ".git", ".next", "dist", "build", "__pycache__", ".cache",
  "package-lock.json", "yarn.lock", "tsconfig", "webpack", ".env",
  ".gitignore", ".eslint", ".prettier", "babel", "vite.config",
  "next.config", "tailwind.config", "postcss", "dockerfile", "docker-compose",
];

const HIGH_PRIORITY_KEYWORDS = [
  "brief", "plan", "propuesta", "análisis", "analisis", "roadmap", "spec",
  "estrategia", "presupuesto", "budget", "modelo", "model", "pitch",
  "resumen", "summary", "requirements", "requisitos", "scope", "alcance",
  "timeline", "cronograma", "milestones", "hitos", "mercado", "market",
  "cliente", "customer", "business", "negocio", "revenue", "pricing",
];

interface DriveFile {
  id: string;
  name: string;
  path: string;
  mimeType: string;
  modifiedTime?: string;
  size?: number;
  webViewLink?: string;
}

function smartFilter(files: DriveFile[]): DriveFile[] {
  const isCodeProject = files.some(
    (f) =>
      f.name === "README.md" ||
      f.name === "package.json" ||
      CODE_EXTENSIONS.some((ext) => f.name.toLowerCase().endsWith(ext))
  );

  const maxBusiness = 50;
  const maxCode = isCodeProject ? 20 : 0;

  const business: Array<DriveFile & { priority: number }> = [];
  const code: DriveFile[] = [];

  for (const file of files) {
    const name = file.name.toLowerCase();
    const mime = file.mimeType || "";

    // Skip folders, media, ignored patterns
    if (
      mime.includes("folder") ||
      mime.startsWith("image/") ||
      mime.startsWith("video/") ||
      mime.startsWith("audio/") ||
      IGNORED_PATTERNS.some((p) => name.includes(p.toLowerCase()))
    ) {
      continue;
    }

    const isBusiness = BUSINESS_MIMES.some((bm) => mime.includes(bm.split(".").pop() || bm));
    const isCode = CODE_EXTENSIONS.some((ext) => name.endsWith(ext));
    const hasKeyword = HIGH_PRIORITY_KEYWORDS.some((kw) => name.includes(kw));

    if (isBusiness || name.endsWith(".md") || name.endsWith(".txt")) {
      let priority = 2; // medium
      if (hasKeyword) priority = 3; // high
      if (mime.includes("spreadsheet")) priority = 1; // lower
      business.push({ ...file, priority });
    } else if (isCode && isCodeProject) {
      // For code projects, prioritize README, configs, docs
      if (name === "readme.md" || name.endsWith(".md") || name.includes("doc")) {
        business.push({ ...file, priority: 3 });
      } else {
        code.push(file);
      }
    }
  }

  // Sort business by priority desc, then by recency
  business.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    const aTime = a.modifiedTime ? new Date(a.modifiedTime).getTime() : 0;
    const bTime = b.modifiedTime ? new Date(b.modifiedTime).getTime() : 0;
    return bTime - aTime;
  });

  const selected = [
    ...business.slice(0, maxBusiness),
    ...code.slice(0, maxCode),
  ];

  // If total > 70, trim by keeping highest priority
  if (selected.length > 70) {
    return selected.slice(0, 70);
  }

  return selected;
}

// ─── Analyze files with Gemini ───────────────────────────────────────────────

async function analyzeFilesWithGemini(fileContents: FileContent[]): Promise<Record<string, unknown>> {
  const filesDescription = fileContents
    .map(
      (file) =>
        `### ${file.name} (${file.path})\nTipo: ${file.mimeType}\nContenido:\n${file.content.substring(0, 8000)}`
    )
    .join("\n\n");

  const systemPrompt = `Eres un experto analista de proyectos empresariales. Analiza documentos de una carpeta y estructúralos en un proyecto.

REGLA: Devuelve SOLO JSON válido. Sin markdown, sin texto extra.`;

  const userPrompt = `Analiza estos documentos y genera un objeto JSON con esta estructura exacta:

{
  "title": "Título del proyecto",
  "description": "Descripción breve",
  "category": "startup|product|service|research|other",
  "tags": ["tag1", "tag2", "tag3"],
  "concept": {
    "idea": "Idea principal",
    "problem": "Problema identificado",
    "solution": "Solución propuesta",
    "value": "Propuesta de valor"
  },
  "market": {
    "target": "Público objetivo",
    "size": "Tamaño de mercado",
    "trends": "Tendencias",
    "competitors": "Competidores"
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
    "tools": "Herramientas",
    "budget": "Presupuesto",
    "partners": "Partners"
  },
  "extractedNotes": [{"title": "...", "content": "..."}],
  "extractedLinks": [{"url": "...", "title": "...", "description": "..."}]
}

DOCUMENTOS:
${filesDescription}

Responde SOLO con el JSON.`;

  const response = await callLLM({
    model: "gemini-pro",
    systemPrompt,
    userPrompt,
    jsonMode: true,
    maxTokens: 4096,
    temperature: 0.5,
  });

  const jsonMatch = response.content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No se pudo extraer JSON de la respuesta de Gemini");
  }

  return JSON.parse(jsonMatch[0]);
}

// ─── POST: Analyze Drive folder ──────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json(
        { error: "No autenticado", needsGoogleAuth: true },
        { status: 401 }
      );
    }

    const accessToken = (session.user as any).accessToken;
    if (!accessToken) {
      return NextResponse.json(
        { error: "Token de Google no disponible", needsGoogleAuth: true },
        { status: 401 }
      );
    }

    const { files, folderName } = await request.json();

    if (!files || !Array.isArray(files)) {
      return NextResponse.json(
        { error: "Archivos no proporcionados", stage: "filter" },
        { status: 400 }
      );
    }

    // Smart filter
    const filtered = smartFilter(files);
    console.log(
      `[import-from-drive] Smart filter: ${files.length} archivos → ${filtered.length} seleccionados`
    );

    // Extract content (truncated to 8000 chars each)
    const fileContents: FileContent[] = [];
    for (const file of filtered) {
      try {
        const content = await extractFileContent(file.id, file.mimeType, accessToken);
        if (content) {
          fileContents.push({
            name: file.name,
            path: file.path,
            mimeType: file.mimeType,
            content: content.substring(0, 8000),
            url: file.webViewLink,
          });
        }
      } catch (err) {
        console.warn(`[import-from-drive] extract skip ${file.name}:`, err);
      }
    }

    if (fileContents.length === 0) {
      return NextResponse.json(
        { error: "No se pudo extraer contenido de ningun archivo", stage: "extract" },
        { status: 400 }
      );
    }

    // Analyze with Gemini
    let projectStructure: Record<string, unknown>;
    try {
      projectStructure = await analyzeFilesWithGemini(fileContents);
    } catch (llmErr) {
      console.error("[import-from-drive] llm:", llmErr);
      return NextResponse.json(
        {
          error: "Error al analizar la carpeta",
          stage: "llm",
          details: llmErr instanceof Error ? llmErr.message : String(llmErr),
        },
        { status: 500 }
      );
    }

    projectStructure.sourceFolderName = folderName;
    projectStructure.totalFilesProcessed = fileContents.length;
    projectStructure.totalFilesInFolder = files.length;

    return NextResponse.json({ success: true, projectStructure });
  } catch (error) {
    console.error("[import-from-drive] general:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Error al importar desde Drive",
        stage: "general",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

// ─── PUT: Create project from analyzed structure ─────────────────────────────

export async function PUT(request: NextRequest) {
  try {
    const userId = await getDefaultUserId();
    const { projectStructure } = await request.json();

    if (!projectStructure) {
      return NextResponse.json(
        { error: "Estructura de proyecto no proporcionada" },
        { status: 400 }
      );
    }

    const project = await prisma.project.create({
      data: {
        userId,
        title: projectStructure.title,
        description: projectStructure.description,
        category: projectStructure.category || "other",
        tags: projectStructure.tags || [],
        status: "idea",
        progress: 20,
        priority: "medium",
        concept: `${projectStructure.concept?.idea || ""}\n\n${projectStructure.concept?.solution || ""}`,
        problemSolved: `${projectStructure.concept?.problem || ""}\n\nPropuesta de valor: ${projectStructure.concept?.value || ""}`,
        targetMarket: `${projectStructure.market?.target || ""}\n\nTamaño: ${projectStructure.market?.size || ""}`,
        marketValidation: `Tendencias: ${projectStructure.market?.trends || ""}\n\nCompetidores: ${projectStructure.market?.competitors || ""}`,
        businessModel: `Ingresos: ${projectStructure.model?.revenue || ""}\n\nCostos: ${projectStructure.model?.costs || ""}`,
        valueProposition: `Canales: ${projectStructure.model?.channels || ""}\n\nRecursos clave: ${projectStructure.model?.resources || ""}`,
        actionPlan: projectStructure.action?.tasks || "",
        milestones: `${projectStructure.action?.milestones || ""}\n\nTimeline: ${projectStructure.action?.timeline || ""}`,
        resources: `Equipo: ${projectStructure.resourcesPlan?.team || ""}\n\nHerramientas: ${projectStructure.resourcesPlan?.tools || ""}\n\nPresupuesto: ${projectStructure.resourcesPlan?.budget || ""}`,
        metrics: `${projectStructure.action?.metrics || ""}\n\nPartners: ${projectStructure.resourcesPlan?.partners || ""}`,
        currentStep: 5,
      },
    });

    // Create extracted notes
    if (projectStructure.extractedNotes?.length > 0) {
      await Promise.all(
        projectStructure.extractedNotes.map((note: { title: string; content: string }) =>
          prisma.note.create({
            data: {
              userId,
              projectId: project.id,
              title: note.title,
              content: note.content,
              tags: [],
            },
          })
        )
      );
    }

    // Create extracted links
    if (projectStructure.extractedLinks?.length > 0) {
      await Promise.all(
        projectStructure.extractedLinks.map((link: { url: string; title: string; description: string }) =>
          prisma.link.create({
            data: {
              userId,
              projectId: project.id,
              url: link.url,
              title: link.title,
              description: link.description,
              tags: [],
            },
          })
        )
      );
    }

    return NextResponse.json({ success: true, project });
  } catch (error) {
    console.error("[import-from-drive] create:", error);
    return NextResponse.json(
      { error: "Error al crear el proyecto" },
      { status: 500 }
    );
  }
}
