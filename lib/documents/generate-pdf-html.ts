import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { DocumentSection, QUIET_LUXURY, StyleConfig } from "./vexco-style";

// =============================================================================
// HTML TEMPLATE ENGINE — Parametrizado por StyleConfig
// =============================================================================

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "<br>");
}

function buildHtmlDocument(
  title: string,
  subtitle: string | undefined,
  sections: DocumentSection[],
  style: StyleConfig,
  documentType: "report" | "brief" | "one-pager" = "report"
): string {
  const s = style;
  const date = new Date().toLocaleDateString("es-ES", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const bulletChar =
    s.layout.bulletStyle === "dash"
      ? "—"
      : s.layout.bulletStyle === "square"
        ? "▪"
        : "";

  const sectionsHtml = sections
    .map(
      (section, index) => `
    <div class="section ${index > 0 ? "section-break" : "first-section"}">
      <h2>${escapeHtml(section.title)}</h2>
      ${section.content ? `<p class="content">${escapeHtml(section.content)}</p>` : ""}
      ${
        section.bullets && section.bullets.length > 0
          ? `<ul>${section.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>`
          : ""
      }
    </div>
  `
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <link href="${s.fonts.headingGoogleImport}" rel="stylesheet">
  <link href="${s.fonts.bodyGoogleImport}" rel="stylesheet">
  <style>
    @page { size: A4; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: '${s.fonts.body}', ${s.fonts.bodyFallback};
      font-size: ${s.layout.bodySizePt}pt;
      font-weight: ${s.fonts.bodyWeight};
      line-height: 1.7;
      color: ${s.colors.text};
      background: ${s.colors.background};
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .page {
      width: 210mm;
      min-height: 297mm;
      padding: ${s.spacing.pageMarginTopMm}mm ${s.spacing.pageMarginSideMm}mm
               ${s.spacing.pageMarginBottomMm}mm ${s.spacing.pageMarginSideMm}mm;
      position: relative;
    }

    /* HEADER */
    .document-header {
      margin-bottom: 40px;
      padding-bottom: 24px;
      border-bottom: ${s.layout.separatorWeight} solid ${s.colors.border};
    }
    .brand-mark {
      font-family: '${s.fonts.heading}', ${s.fonts.headingFallback};
      font-size: 11pt;
      font-weight: 500;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: ${s.colors.accent};
      margin-bottom: 32px;
    }
    .document-title {
      font-family: '${s.fonts.heading}', ${s.fonts.headingFallback};
      font-size: ${s.layout.titleSizePt}pt;
      font-weight: ${s.fonts.headingWeight};
      line-height: 1.15;
      color: ${s.colors.text};
      margin-bottom: 8px;
      letter-spacing: -0.01em;
    }
    .document-subtitle {
      font-family: '${s.fonts.body}', ${s.fonts.bodyFallback};
      font-size: 12pt;
      font-weight: 300;
      color: ${s.colors.textSecondary};
      margin-bottom: 16px;
    }
    .document-meta {
      font-size: 8.5pt;
      color: ${s.colors.muted};
      letter-spacing: 0.03em;
    }

    /* SECTIONS */
    .section {
      margin-bottom: ${s.spacing.sectionGapPx}px;
    }
    .section-break {
      padding-top: 20px;
    }
    .section h2 {
      font-family: '${s.fonts.heading}', ${s.fonts.headingFallback};
      font-size: ${s.layout.headingSizePt}pt;
      font-weight: ${s.fonts.headingWeight};
      color: ${s.colors.text};
      margin-bottom: ${s.spacing.paragraphGapPx}px;
    }
    .section .content {
      font-size: ${s.layout.bodySizePt}pt;
      line-height: 1.75;
      color: ${s.colors.text}DD;
      margin-bottom: ${s.spacing.paragraphGapPx}px;
      text-align: justify;
      hyphens: auto;
    }
    .section ul {
      list-style: none;
      padding-left: 0;
      margin-top: 8px;
    }
    .section ul li {
      position: relative;
      padding-left: 16px;
      margin-bottom: 6px;
      font-size: ${s.layout.bodySizePt}pt;
      line-height: 1.65;
      color: ${s.colors.text}DD;
    }
    .section ul li::before {
      content: '${bulletChar}';
      position: absolute;
      left: 0;
      top: ${s.layout.bulletStyle === "dot" ? "9px" : "0"};
      ${
        s.layout.bulletStyle === "dot"
          ? `width: 4px; height: 4px; background: ${s.colors.accent}; border-radius: 50%; content: '';`
          : `color: ${s.colors.accent}; font-size: 10pt;`
      }
    }

    /* ACCENT BORDER on first section */
    .first-section {
      border-left: ${s.layout.accentBorderWidth} solid ${s.colors.accent};
      padding-left: 20px;
    }

    /* FOOTER */
    .document-footer {
      position: fixed;
      bottom: 15mm;
      left: ${s.spacing.pageMarginSideMm}mm;
      right: ${s.spacing.pageMarginSideMm}mm;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 12px;
      border-top: ${s.layout.separatorWeight} solid ${s.colors.border};
      font-size: ${s.layout.footerSizePt}pt;
      color: ${s.colors.muted};
    }
    .footer-brand {
      font-family: '${s.fonts.heading}', ${s.fonts.headingFallback};
      font-weight: 500;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      font-size: 8pt;
      color: ${s.colors.accent};
    }
    .confidential {
      font-size: 7pt;
      color: #CCC;
      text-transform: uppercase;
      letter-spacing: 0.15em;
    }

    /* ONE-PAGER overrides */
    ${
      documentType === "one-pager"
        ? `
    .document-header { margin-bottom: 24px; padding-bottom: 16px; }
    .section { margin-bottom: 16px; }
    .section h2 { font-size: 13pt; margin-bottom: 6px; }
    .section .content { font-size: 9.5pt; line-height: 1.55; }
    .section ul li { font-size: 9.5pt; margin-bottom: 3px; }
    `
        : ""
    }

    /* BRIEF overrides */
    ${documentType === "brief" ? `.document-title { font-size: 22pt; }` : ""}
  </style>
</head>
<body>
  <div class="page">
    <div class="document-header">
      <div class="brand-mark">Vex & Co</div>
      <h1 class="document-title">${escapeHtml(title)}</h1>
      ${subtitle ? `<p class="document-subtitle">${escapeHtml(subtitle)}</p>` : ""}
      <div class="document-meta">${date} · Confidencial</div>
    </div>
    ${sectionsHtml}
    <div class="document-footer">
      <span class="footer-brand">Vex & Co</span>
      <span class="confidential">Documento confidencial</span>
    </div>
  </div>
</body>
</html>`;
}

// =============================================================================
// PDF GENERATION
// =============================================================================

export async function generatePdfFromHtml(
  title: string,
  subtitle: string | undefined,
  sections: DocumentSection[],
  style: StyleConfig = QUIET_LUXURY
): Promise<Buffer> {
  let documentType: "report" | "brief" | "one-pager" = "report";
  if (sections.length <= 3) documentType = "one-pager";
  else if (sections.length <= 5) documentType = "brief";

  const html = buildHtmlDocument(title, subtitle, sections, style, documentType);

  const isLocal = process.env.NODE_ENV === "development";
  let browser;

  try {
    if (isLocal) {
      browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
        executablePath:
          process.platform === "darwin"
            ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
            : "/usr/bin/google-chrome",
      });
    } else {
      browser = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
      });
    }

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 30000 });
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: `
        <div style="width:100%;text-align:center;font-size:8px;
                    font-family:Inter,sans-serif;color:#CCC;padding-bottom:5mm;">
          <span class="pageNumber"></span> / <span class="totalPages"></span>
        </div>`,
    });

    return Buffer.from(pdfBuffer);
  } finally {
    if (browser) await browser.close();
  }
}

export function detectDocumentType(
  sectionCount: number
): "report" | "brief" | "one-pager" {
  if (sectionCount <= 3) return "one-pager";
  if (sectionCount <= 5) return "brief";
  return "report";
}
