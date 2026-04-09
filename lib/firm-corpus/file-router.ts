// =============================================================================
// FILE ROUTER — Gate initial: narrative vs operational
// =============================================================================

import type { OperationalSourceKind } from "@prisma/client";

export type FileRouting =
  | { kind: "narrative"; extension: string }
  | { kind: "operational"; detectedKind: OperationalSourceKind };

const TABULAR_EXTENSIONS = new Set(["xlsx", "xls", "csv", "tsv"]);

export function routeFile(fileName: string, mimeType: string): FileRouting {
  const ext = (fileName.toLowerCase().match(/\.([^.]+)$/)?.[1] || "").toLowerCase();

  // Google Sheets also count as operational
  if (TABULAR_EXTENSIONS.has(ext) || mimeType === "application/vnd.google-apps.spreadsheet") {
    return { kind: "operational", detectedKind: detectOperationalKind(fileName) };
  }

  return { kind: "narrative", extension: ext };
}

export function detectOperationalKind(fileName: string): OperationalSourceKind {
  const name = fileName.toLowerCase();
  // Order matters: "Campana Partners" -> CAMPAIGN_DATA first
  if (/campa[ñn]|campaign|outreach/i.test(name)) return "CAMPAIGN_DATA";
  if (/partner/i.test(name)) return "PARTNER_LIST";
  if (/contacto|contact|rrhh|hr|email/i.test(name)) return "CONTACT_LIST";
  if (/empresa|company|companies|listado|ranking/i.test(name)) return "COMPANY_LIST";
  return "UNKNOWN_TABULAR";
}
