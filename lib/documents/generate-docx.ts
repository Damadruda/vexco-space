import {
  Document, Packer, Paragraph, TextRun,
  AlignmentType, BorderStyle, Header, Footer,
} from "docx";
import { QUIET_LUXURY, DocumentSection, StyleConfig } from "./vexco-style";

export async function generateDocxBuffer(
  title: string,
  subtitle: string | undefined,
  sections: DocumentSection[],
  style?: StyleConfig
): Promise<Buffer> {
  const s = style || QUIET_LUXURY;
  const c = (hex: string) => hex.replace("#", "");
  const children: Paragraph[] = [];

  // Title
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: title,
          font: s.fonts.heading,
          size: s.layout.titleSizePt * 2, // docx uses half-points
          color: c(s.colors.text),
          bold: true,
        }),
      ],
      spacing: { after: 200 },
    })
  );

  // Subtitle
  if (subtitle) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: subtitle,
            font: s.fonts.body,
            size: 28,
            color: c(s.colors.textSecondary),
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
          color: c(s.colors.accent),
        },
      },
      spacing: { after: 400 },
    })
  );

  // Sections
  for (const section of sections) {
    if (section.layout === "title") continue;

    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: section.title,
            font: s.fonts.heading,
            size: s.layout.headingSizePt * 2.5,
            color: c(s.colors.text),
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
              font: s.fonts.body,
              size: s.layout.bodySizePt * 2,
              color: c(s.colors.text),
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
                font: s.fonts.body,
                size: s.layout.bodySizePt * 2,
                color: c(s.colors.text),
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
    creator: "Vex&Co Lab",
    description: title,
    title: title,
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
                    text: "VEX & CO",
                    font: s.fonts.heading,
                    size: 16,
                    color: c(s.colors.accent),
                    characterSpacing: 60,
                  }),
                ],
                alignment: AlignmentType.RIGHT,
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: "Vex & Co · Confidencial",
                    font: s.fonts.body,
                    size: 14,
                    color: c(s.colors.muted),
                  }),
                ],
                alignment: AlignmentType.CENTER,
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
