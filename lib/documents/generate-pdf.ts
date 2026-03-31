import jsPDF from "jspdf";
import { DocumentRequest } from "./vexco-style";

export async function generatePdfBuffer(req: DocumentRequest): Promise<Buffer> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const margin = 25;
  const pageWidth = 210;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const checkPageBreak = (needed: number) => {
    if (y + needed > 280) {
      doc.addPage();
      y = margin;
      addFooter();
    }
  };

  const addFooter = () => {
    doc.setFontSize(8);
    doc.setTextColor(139, 115, 85);
    doc.text("Vex&Co", margin, 290);
  };

  // Accent line at top
  doc.setDrawColor(139, 115, 85);
  doc.setLineWidth(0.5);
  doc.line(0, 3, pageWidth, 3);

  // Title
  doc.setFontSize(28);
  doc.setTextColor(26, 26, 26);
  doc.setFont("helvetica", "bold");
  const titleLines = doc.splitTextToSize(req.title, contentWidth);
  doc.text(titleLines, margin, y);
  y += titleLines.length * 12 + 5;

  // Subtitle
  if (req.subtitle) {
    doc.setFontSize(14);
    doc.setTextColor(107, 107, 107);
    doc.setFont("helvetica", "normal");
    doc.text(req.subtitle, margin, y);
    y += 10;
  }

  // Separator
  y += 5;
  doc.setDrawColor(139, 115, 85);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  y += 15;

  // Sections
  for (const section of req.sections) {
    if (section.layout === "title") continue;

    checkPageBreak(30);

    // Section title
    doc.setFontSize(16);
    doc.setTextColor(26, 26, 26);
    doc.setFont("helvetica", "bold");
    const sectionTitleLines = doc.splitTextToSize(section.title, contentWidth);
    doc.text(sectionTitleLines, margin, y);
    y += sectionTitleLines.length * 7 + 5;

    // Content
    if (section.content) {
      checkPageBreak(20);
      doc.setFontSize(11);
      doc.setTextColor(26, 26, 26);
      doc.setFont("helvetica", "normal");
      const contentLines = doc.splitTextToSize(section.content, contentWidth);
      doc.text(contentLines, margin, y);
      y += contentLines.length * 5 + 8;
    }

    // Bullets
    if (section.bullets && section.bullets.length > 0) {
      for (const bullet of section.bullets) {
        checkPageBreak(15);
        doc.setFontSize(11);
        doc.setTextColor(26, 26, 26);
        doc.setFont("helvetica", "normal");
        const bulletLines = doc.splitTextToSize(`•  ${bullet}`, contentWidth - 5);
        doc.text(bulletLines, margin + 5, y);
        y += bulletLines.length * 5 + 3;
      }
      y += 5;
    }
  }

  addFooter();

  const arrayBuffer = doc.output("arraybuffer");
  return Buffer.from(arrayBuffer);
}
