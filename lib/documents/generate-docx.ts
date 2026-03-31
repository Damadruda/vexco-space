import {
  Document, Packer, Paragraph, TextRun,
  AlignmentType, BorderStyle, Header,
} from "docx";
import { VEXCO_STYLE, DocumentRequest } from "./vexco-style";

export async function generateDocxBuffer(req: DocumentRequest): Promise<Buffer> {
  const c = (hex: string) => hex.replace("#", "");
  const children: Paragraph[] = [];

  // Title
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: req.title,
          font: "Garamond",
          size: 56,
          color: c(VEXCO_STYLE.colors.primary),
          bold: true,
        }),
      ],
      spacing: { after: 200 },
    })
  );

  // Subtitle
  if (req.subtitle) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: req.subtitle,
            font: "Helvetica Neue",
            size: 28,
            color: c(VEXCO_STYLE.colors.secondary),
          }),
        ],
        spacing: { after: 600 },
      })
    );
  }

  // Separator
  children.push(
    new Paragraph({
      border: {
        bottom: {
          style: BorderStyle.SINGLE,
          size: 1,
          color: c(VEXCO_STYLE.colors.accent),
        },
      },
      spacing: { after: 400 },
    })
  );

  // Sections
  for (const section of req.sections) {
    if (section.layout === "title") continue;

    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: section.title,
            font: "Garamond",
            size: 40,
            color: c(VEXCO_STYLE.colors.primary),
            bold: true,
          }),
        ],
        spacing: { before: 400, after: 200 },
      })
    );

    if (section.content) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: section.content,
              font: "Helvetica Neue",
              size: 22,
              color: c(VEXCO_STYLE.colors.primary),
            }),
          ],
          spacing: { after: 200 },
        })
      );
    }

    if (section.bullets && section.bullets.length > 0) {
      for (const bullet of section.bullets) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: bullet,
                font: "Helvetica Neue",
                size: 22,
                color: c(VEXCO_STYLE.colors.primary),
              }),
            ],
            bullet: { level: 0 },
            spacing: { after: 100 },
          })
        );
      }
    }
  }

  const doc = new Document({
    creator: req.author || "Vex&Co Lab",
    description: req.title,
    title: req.title,
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: "Vex&Co",
                    font: "Helvetica Neue",
                    size: 16,
                    color: c(VEXCO_STYLE.colors.accent),
                  }),
                ],
                alignment: AlignmentType.RIGHT,
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  return await Packer.toBuffer(doc);
}
