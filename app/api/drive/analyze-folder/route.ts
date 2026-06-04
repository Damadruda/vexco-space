import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { callLLM, callGeminiMultimodal } from "@/lib/clients/llm";
import { classifyProjectSector } from "@/lib/firm-insights/sector-classifier";
import {
  CONFIG,
  detectProjectType,
  filterAndPrioritizeFiles,
  scanFolderRecursively,
  processFilesInBatches,
  inferFileType,
} from "@/lib/services/drive-import-helpers";
import { extractFileContent } from "@/lib/services/corpus-importer";
import { processDriveDocNarrative } from "@/lib/drive-summary/process-doc-narrative";

export const dynamic = "force-dynamic";
export const maxDuration = 500;

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

    // 10. GUARDAR DriveDocSummary — pipeline narrativo Stage A + B (Sprint Convergencia Fase 1)
    const classificationByName = new Map(
      documentsClassified.map(d => [d.fileName, d])
    );

    const NARRATIVE_BATCH_SIZE = 3;
    let narrativeSuccess = 0;
    let narrativeFailed = 0;

    for (let i = 0; i < textFiles.length; i += NARRATIVE_BATCH_SIZE) {
      const batch = textFiles.slice(i, i + NARRATIVE_BATCH_SIZE);

      const batchResults = await Promise.all(
        batch.map(async (file) => {
          const classification = classificationByName.get(file.name);
          let rawContent = "";
          let extractionError: string | null = null;

          try {
            rawContent = await extractFileContent(
              {
                id: file.id,
                name: file.name,
                mimeType: file.mimeType,
                modifiedTime: new Date().toISOString(),
              },
              accessToken
            );
          } catch (err) {
            extractionError = err instanceof Error ? err.message : String(err);
            console.warn(`[DRIVE_NARRATIVE] Extract failed ${file.name}: ${extractionError}`);
          }

          const narrative = extractionError
            ? {
                category: null,
                language: null,
                hasStructuredData: false,
                wordCount: 0,
                summary: null,
                keyInsights: [] as string[],
                processingError: `Extraction failed: ${extractionError.slice(0, 400)}`,
              }
            : await processDriveDocNarrative(file.name, rawContent);

          // Fallback: si no hubo summary narrativo pero existe visualDescription, usar este para summary
          const finalSummary =
            narrative.summary ??
            (classification?.visualDescription ?? `Documento importado: ${file.name}`);

          try {
            await prisma.driveDocSummary.upsert({
              where: {
                projectId_driveFileId: {
                  projectId: project.id,
                  driveFileId: file.id,
                },
              },
              update: {
                fileName: file.name,
                summary: finalSummary,
                keyInsights: narrative.keyInsights,
                category: narrative.category,
                wordCount: narrative.wordCount,
                language: narrative.language,
                hasStructuredData: narrative.hasStructuredData,
                processingError: narrative.processingError,
                lastNarrativeProcessedAt: narrative.processingError ? null : new Date(),
                ...(classification?.assetRole ? { assetRole: classification.assetRole } : {}),
                ...(classification?.visualDescription ? { visualDescription: classification.visualDescription } : {}),
              },
              create: {
                projectId: project.id,
                driveFileId: file.id,
                fileName: file.name,
                fileType: inferFileType(file.name, file.mimeType),
                summary: finalSummary,
                keyInsights: narrative.keyInsights,
                category: narrative.category,
                wordCount: narrative.wordCount,
                language: narrative.language,
                hasStructuredData: narrative.hasStructuredData,
                processingError: narrative.processingError,
                lastNarrativeProcessedAt: narrative.processingError ? null : new Date(),
                assetRole: classification?.assetRole ?? null,
                visualDescription: classification?.visualDescription ?? null,
              },
            });

            if (narrative.processingError) {
              narrativeFailed++;
            } else {
              narrativeSuccess++;
            }
            return { ok: true, fileName: file.name };
          } catch (upsertErr) {
            const msg = upsertErr instanceof Error ? upsertErr.message : String(upsertErr);
            console.warn(`[DRIVE_IMPORT] Upsert failed ${file.name}: ${msg}`);
            return { ok: false, fileName: file.name, error: msg };
          }
        })
      );

      const batchOk = batchResults.filter((r) => r.ok).length;
      console.log(
        `[DRIVE_NARRATIVE] Batch ${Math.floor(i / NARRATIVE_BATCH_SIZE) + 1}: ${batchOk}/${batch.length} ok`
      );

      // Small delay between batches to avoid rate limits
      if (i + NARRATIVE_BATCH_SIZE < textFiles.length) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    const docsSaved = narrativeSuccess + narrativeFailed;
    console.log(
      `[DRIVE_NARRATIVE] Total: ${narrativeSuccess} narrative ok, ${narrativeFailed} narrative failed`
    );

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
