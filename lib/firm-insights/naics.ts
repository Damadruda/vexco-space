// =============================================================================
// NAICS 2-digit sectoral vocabulary for Vex&Co Lab.
// Used as cross-project matching axis between Project and FirmInsight.
// 20 cerrados + null. Labels en español.
// =============================================================================

export const NAICS_SECTORS = [
  { code: "11", label: "Agricultura, Silvicultura y Pesca" },
  { code: "21", label: "Mineria y Extractivas" },
  { code: "22", label: "Servicios Publicos (Utilities)" },
  { code: "23", label: "Construccion" },
  { code: "31", label: "Manufactura" },
  { code: "42", label: "Comercio Mayorista" },
  { code: "44", label: "Comercio Minorista" },
  { code: "48", label: "Transporte y Logistica" },
  { code: "51", label: "Informacion y Medios" },
  { code: "52", label: "Servicios Financieros" },
  { code: "53", label: "Inmobiliario y Alquileres" },
  { code: "54", label: "Servicios Profesionales y Consultoria" },
  { code: "55", label: "Gestion Empresarial" },
  { code: "56", label: "Servicios Administrativos y de Apoyo" },
  { code: "61", label: "Educacion" },
  { code: "62", label: "Salud y Asistencia Social" },
  { code: "71", label: "Arte, Entretenimiento y Recreacion" },
  { code: "72", label: "Hosteleria y Restauracion" },
  { code: "81", label: "Otros Servicios" },
  { code: "92", label: "Administracion Publica" },
] as const;

export const NAICS_CODES: readonly string[] = NAICS_SECTORS.map((s) => s.code);

export function getNaicsLabel(code: string | null | undefined): string {
  if (!code) return "Sin sector";
  return NAICS_SECTORS.find((s) => s.code === code)?.label ?? `NAICS ${code}`;
}

// Politica hibrida del matcher: ¿este sector es "confiable" para el AND estricto?
export function isSectorTrusted(
  naicsSector: string | null | undefined,
  confidence: number | null | undefined,
  reviewed: boolean | null | undefined
): boolean {
  if (!naicsSector) return false;
  if (reviewed === true) return true;
  return (confidence ?? 0) >= 0.7;
}
