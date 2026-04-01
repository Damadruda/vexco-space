// =============================================================================
// VEX&CO DESIGN SYSTEM — Single Source of Truth
// =============================================================================

// --- Types ---

export interface DocumentSection {
  title: string;
  content?: string;
  bullets?: string[];
  layout?: "full" | "split" | "highlight" | "title" | "content" | "section" | "closing";
}

export interface DocumentRequest {
  title: string;
  subtitle?: string;
  sections: DocumentSection[];
  format: DocumentFormat;
  projectId?: string;
  styleVariantId?: string;
  author?: string;
}

export type DocumentFormat = "pptx" | "docx" | "pdf";

// --- Style Override System ---

export interface StyleConfig {
  colors: {
    background: string;
    text: string;
    textSecondary: string;
    accent: string;
    border: string;
    muted: string;
  };
  fonts: {
    heading: string;
    body: string;
    headingFallback: string;
    bodyFallback: string;
    headingWeight: string;
    bodyWeight: string;
    headingGoogleImport: string;
    bodyGoogleImport: string;
  };
  spacing: {
    pageMarginTopMm: number;
    pageMarginSideMm: number;
    pageMarginBottomMm: number;
    sectionGapPx: number;
    paragraphGapPx: number;
  };
  layout: {
    accentBorderWidth: string;
    separatorWeight: string;
    bulletStyle: "dot" | "dash" | "square";
    titleSizePt: number;
    headingSizePt: number;
    bodySizePt: number;
    footerSizePt: number;
  };
}

// --- Quiet Luxury: Standard Corporativo Vex&Co ---

export const QUIET_LUXURY: StyleConfig = {
  colors: {
    background: "#FAFAF8",
    text: "#1A1A1A",
    textSecondary: "#6B6B6B",
    accent: "#B8860B",
    border: "#E8E4DE",
    muted: "#999999",
  },
  fonts: {
    heading: "Cormorant Garamond",
    body: "Inter",
    headingFallback: "Georgia, serif",
    bodyFallback: "-apple-system, BlinkMacSystemFont, sans-serif",
    headingWeight: "600",
    bodyWeight: "400",
    headingGoogleImport:
      "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap",
    bodyGoogleImport:
      "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap",
  },
  spacing: {
    pageMarginTopMm: 35,
    pageMarginSideMm: 30,
    pageMarginBottomMm: 25,
    sectionGapPx: 28,
    paragraphGapPx: 12,
  },
  layout: {
    accentBorderWidth: "2px",
    separatorWeight: "0.5px",
    bulletStyle: "dot",
    titleSizePt: 28,
    headingSizePt: 16,
    bodySizePt: 10.5,
    footerSizePt: 7.5,
  },
};

// Legacy export alias (para compatibilidad con código existente)
export const VEXCO_STYLE = {
  name: "Vex&Co Quiet Luxury",
  colors: {
    primary: QUIET_LUXURY.colors.text,
    secondary: QUIET_LUXURY.colors.textSecondary,
    accent: QUIET_LUXURY.colors.accent,
    background: QUIET_LUXURY.colors.background,
    white: "#ffffff",
    border: QUIET_LUXURY.colors.border,
  },
  fonts: {
    title: QUIET_LUXURY.fonts.heading,
    body: QUIET_LUXURY.fonts.body,
  },
  // Hex without # for pptxgenjs
  pptx: {
    primary: QUIET_LUXURY.colors.text.replace("#", ""),
    secondary: QUIET_LUXURY.colors.textSecondary.replace("#", ""),
    accent: QUIET_LUXURY.colors.accent.replace("#", ""),
    background: QUIET_LUXURY.colors.background.replace("#", ""),
  },
};

// --- Style Merge Utility ---

export function mergeStyle(overrides: Partial<StyleConfig>): StyleConfig {
  return {
    colors: { ...QUIET_LUXURY.colors, ...(overrides.colors || {}) },
    fonts: { ...QUIET_LUXURY.fonts, ...(overrides.fonts || {}) },
    spacing: { ...QUIET_LUXURY.spacing, ...(overrides.spacing || {}) },
    layout: { ...QUIET_LUXURY.layout, ...(overrides.layout || {}) },
  };
}
