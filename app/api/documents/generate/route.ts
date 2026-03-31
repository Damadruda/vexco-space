import { NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { generatePptxBuffer } from "@/lib/documents/generate-pptx";
import { generateDocxBuffer } from "@/lib/documents/generate-docx";
import { generatePdfBuffer } from "@/lib/documents/generate-pdf";
import type { DocumentFormat, DocumentRequest } from "@/lib/documents/vexco-style";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MIME_TYPES: Record<DocumentFormat, string> = {
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
};

const EXTENSIONS: Record<DocumentFormat, string> = {
  pptx: ".pptx",
  docx: ".docx",
  pdf: ".pdf",
};

export async function POST(request: Request) {
  try {
    await getDefaultUserId(); // auth check

    const body = await request.json();
    const { title, subtitle, sections, format } = body as DocumentRequest;

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

    const req: DocumentRequest = {
      title,
      subtitle,
      sections,
      format,
      author: "Vex&Co Lab",
    };

    let buffer: Buffer;

    switch (format) {
      case "pptx":
        buffer = await generatePptxBuffer(req);
        break;
      case "docx":
        buffer = await generateDocxBuffer(req);
        break;
      case "pdf":
        buffer = await generatePdfBuffer(req);
        break;
      default:
        return NextResponse.json({ error: "Formato no soportado" }, { status: 400 });
    }

    const safeName = title
      .replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ ]/g, "")
      .replace(/\s+/g, "_")
      .slice(0, 60);
    const filename = `${safeName}${EXTENSIONS[format]}`;

    return new Response(buffer, {
      headers: {
        "Content-Type": MIME_TYPES[format],
        "Content-Disposition": `attachment; filename="${filename}"`,
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
