// =============================================================================
// VEXCO-LAB — DOCUMENT STYLE: Vex&Co Quiet Luxury
// Single corporate style. Future: dynamic styles from Raindrop trends.
// =============================================================================

export const VEXCO_STYLE = {
  name: "Vex&Co Quiet Luxury",
  colors: {
    primary: "#1a1a1a",
    secondary: "#6b6b6b",
    accent: "#8b7355",
    background: "#fafaf8",
    white: "#ffffff",
    border: "#e5e5e0",
  },
  fonts: {
    title: "Garamond",
    body: "Helvetica Neue",
  },
  // Hex without # for pptxgenjs
  pptx: {
    primary: "1a1a1a",
    secondary: "6b6b6b",
    accent: "8b7355",
    background: "fafaf8",
  },
};

export type DocumentFormat = "pptx" | "docx" | "pdf";

export interface DocumentSection {
  title: string;
  content?: string;
  bullets?: string[];
  layout: "title" | "content" | "section" | "closing";
}

export interface DocumentRequest {
  title: string;
  subtitle?: string;
  sections: DocumentSection[];
  format: DocumentFormat;
  author?: string;
}
