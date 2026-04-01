import { NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { generatePptxBuffer } from "@/lib/documents/generate-pptx";
import { generateDocxBuffer } from "@/lib/documents/generate-docx";
import { generatePdfFromHtml, detectDocumentType } from "@/lib/documents/generate-pdf-html";
import { resolveStyle, recordGeneration } from "@/lib/documents/style-engine";
import type { DocumentFormat, DocumentRequest } from "@/lib/documents/vexco-style";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MIME_TYPES: Record<DocumentFormat, string> = {
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
};

export async function POST(request: Request) {
  try {
    const userId = await getDefaultUserId();

    const body = await request.json();
    const { title, subtitle, sections, format, projectId, styleVariantId } =
      body as DocumentRequest;

    if (!sections || !title || !format) {
      return NextResponse.json(
        { error: "title, sections, y format son requeridos" },
        { status: 400 }
      );
    }

    if (!["pptx", "docx", "pdf"].includes(format)) {
      return NextResponse.json(
        { error: "Formato debe ser pptx, docx, o pdf" },
        { status: 400 }
      );
    }

    // Resolver estilo (Quiet Luxury si no hay variant)
    const { style, variantName, variantId } = await resolveStyle(styleVariantId);

    let buffer: Buffer;

    switch (format) {
      case "pdf":
        buffer = await generatePdfFromHtml(title, subtitle, sections, style);
        break;
      case "docx":
        buffer = await generateDocxBuffer(title, subtitle, sections, style);
        break;
      case "pptx":
        buffer = await generatePptxBuffer({
          title,
          subtitle,
          sections,
          format,
          author: "Vex&Co Lab",
        });
        break;
      default:
        return NextResponse.json({ error: "Formato no soportado" }, { status: 400 });
    }

    // Registrar generación en DB
    const docType = detectDocumentType(sections.length);
    const generationId = await recordGeneration({
      projectId,
      title,
      format,
      documentType: docType,
      styleVariantId: variantId,
      sectionCount: sections.length,
      generatedBy: userId,
    }).catch(() => null);

    const safeName = title
      .replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ ]/g, "")
      .replace(/\s+/g, "_")
      .slice(0, 60);
    const filename = `${safeName}_VexCo.${format}`;

    return new Response(buffer, {
      headers: {
        "Content-Type": MIME_TYPES[format],
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Document-Id": generationId || "",
        "X-Style-Variant": variantName,
      },
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "No autenticado") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[GENERATE-DOC] Error:", errMsg);
    return NextResponse.json(
      { error: errMsg || "Error al generar documento" },
      { status: 500 }
    );
  }
}
