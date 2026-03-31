import PptxGenJS from "pptxgenjs";
import { VEXCO_STYLE, DocumentRequest } from "./vexco-style";

export async function generatePptxBuffer(req: DocumentRequest): Promise<Buffer> {
  const pptx = new PptxGenJS();
  const s = VEXCO_STYLE.pptx;

  pptx.author = req.author || "Vex&Co Lab";
  pptx.company = "Vex&Co";
  pptx.title = req.title;
  pptx.layout = "LAYOUT_WIDE";

  for (const section of req.sections) {
    const slide = pptx.addSlide();
    slide.background = { color: s.background };

    // Accent line at top
    slide.addShape(pptx.ShapeType.rect, {
      x: 0, y: 0, w: "100%", h: 0.04,
      fill: { color: s.accent },
    });

    switch (section.layout) {
      case "title":
        slide.addText(section.title, {
          x: 0.8, y: 2.0, w: 11.5, h: 1.5,
          fontSize: 36, fontFace: "Garamond",
          color: s.primary, bold: true,
        });
        if (section.content) {
          slide.addText(section.content, {
            x: 0.8, y: 3.5, w: 11.5, h: 1.0,
            fontSize: 18, fontFace: "Helvetica Neue",
            color: s.secondary,
          });
        }
        slide.addText("Vex&Co", {
          x: 0.8, y: 6.0, w: 3, h: 0.5,
          fontSize: 12, fontFace: "Helvetica Neue",
          color: s.accent,
        });
        break;

      case "section":
        slide.addText(section.title, {
          x: 0.8, y: 2.5, w: 11.5, h: 1.5,
          fontSize: 30, fontFace: "Garamond",
          color: s.primary, bold: true,
        });
        if (section.content) {
          slide.addText(section.content, {
            x: 0.8, y: 4.0, w: 11.5, h: 1.0,
            fontSize: 16, fontFace: "Helvetica Neue",
            color: s.secondary,
          });
        }
        break;

      case "content":
        slide.addText(section.title, {
          x: 0.8, y: 0.4, w: 11.5, h: 0.8,
          fontSize: 22, fontFace: "Garamond",
          color: s.primary, bold: true,
        });
        slide.addShape(pptx.ShapeType.line, {
          x: 0.8, y: 1.2, w: 11.5, h: 0,
          line: { color: s.accent, width: 1 },
        });
        if (section.bullets && section.bullets.length > 0) {
          const bulletText = section.bullets.map((b) => ({
            text: b,
            options: {
              fontSize: 14,
              fontFace: "Helvetica Neue",
              color: s.primary,
              bullet: { type: "bullet" as const, color: s.accent },
              paraSpaceAfter: 8,
            },
          }));
          slide.addText(bulletText, {
            x: 0.8, y: 1.5, w: 11.5, h: 5.0, valign: "top",
          });
        } else if (section.content) {
          slide.addText(section.content, {
            x: 0.8, y: 1.5, w: 11.5, h: 5.0,
            fontSize: 14, fontFace: "Helvetica Neue",
            color: s.primary, valign: "top",
          });
        }
        // Footer
        slide.addText("Vex&Co", {
          x: 0.5, y: 6.9, w: 3, h: 0.4,
          fontSize: 8, fontFace: "Helvetica Neue",
          color: s.secondary,
        });
        break;

      case "closing":
        slide.addText(section.title, {
          x: 0.8, y: 2.5, w: 11.5, h: 1.5,
          fontSize: 30, fontFace: "Garamond",
          color: s.primary, bold: true, align: "center",
        });
        slide.addText("Vex&Co", {
          x: 0.8, y: 5.5, w: 11.5, h: 0.5,
          fontSize: 14, fontFace: "Helvetica Neue",
          color: s.accent, align: "center",
        });
        break;
    }
  }

  return (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
}
