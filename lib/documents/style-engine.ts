// =============================================================================
// STYLE ENGINE — Gestiona variantes, sugerencias y feedback
// =============================================================================

import { prisma } from "@/lib/db";
import { QUIET_LUXURY, mergeStyle, StyleConfig } from "./vexco-style";

// --- Obtener estilo resuelto para generación ---

export async function resolveStyle(
  styleVariantId?: string | null
): Promise<{ style: StyleConfig; variantName: string; variantId: string | null }> {
  if (!styleVariantId) {
    return { style: QUIET_LUXURY, variantName: "Quiet Luxury", variantId: null };
  }

  try {
    const variant = await prisma.styleVariant.findUnique({
      where: { id: styleVariantId },
    });

    if (!variant || !variant.isActive) {
      return { style: QUIET_LUXURY, variantName: "Quiet Luxury", variantId: null };
    }

    await prisma.styleVariant.update({
      where: { id: variant.id },
      data: { usageCount: { increment: 1 } },
    });

    const overrides = variant.cssOverrides as Partial<StyleConfig>;
    return {
      style: mergeStyle(overrides),
      variantName: variant.name,
      variantId: variant.id,
    };
  } catch {
    return { style: QUIET_LUXURY, variantName: "Quiet Luxury", variantId: null };
  }
}

// --- Obtener variantes disponibles para el selector ---

export async function getAvailableStyles(): Promise<
  Array<{
    id: string | null;
    name: string;
    description: string;
    isDefault: boolean;
    avgRating: number | null;
    usageCount: number;
    source: string;
  }>
> {
  const styles: Array<{
    id: string | null;
    name: string;
    description: string;
    isDefault: boolean;
    avgRating: number | null;
    usageCount: number;
    source: string;
  }> = [
    {
      id: null,
      name: "Quiet Luxury",
      description: "Estándar corporativo Vex&Co — Cormorant Garamond, paleta neutra, acento dorado",
      isDefault: true,
      avgRating: null,
      usageCount: 0,
      source: "corporate",
    },
  ];

  try {
    const variants = await prisma.styleVariant.findMany({
      where: { isActive: true, isDefault: false },
      orderBy: [{ usageCount: "desc" }, { createdAt: "desc" }],
      take: 10,
    });

    for (const v of variants) {
      styles.push({
        id: v.id,
        name: v.name,
        description: v.description || "",
        isDefault: false,
        avgRating: v.ratingCount > 0 ? v.totalRating / v.ratingCount : null,
        usageCount: v.usageCount,
        source: v.source,
      });
    }
  } catch {
    // Si falla DB, al menos devolvemos Quiet Luxury
  }

  return styles;
}

// --- Registrar generación ---

export async function recordGeneration(data: {
  projectId?: string;
  title: string;
  format: string;
  documentType: string;
  styleVariantId?: string | null;
  sectionCount: number;
  generatedBy?: string;
}): Promise<string> {
  const record = await prisma.documentGeneration.create({
    data: {
      projectId: data.projectId || null,
      title: data.title,
      format: data.format,
      documentType: data.documentType,
      styleVariantId: data.styleVariantId || null,
      sectionCount: data.sectionCount,
      generatedBy: data.generatedBy || null,
    },
  });
  return record.id;
}

// --- Registrar feedback ---

export async function recordFeedback(
  documentId: string,
  rating: number,
  comment?: string
): Promise<void> {
  const doc = await prisma.documentGeneration.update({
    where: { id: documentId },
    data: {
      feedbackRating: Math.min(5, Math.max(1, rating)),
      feedbackComment: comment || null,
      feedbackAt: new Date(),
    },
  });

  if (doc.styleVariantId) {
    await prisma.styleVariant.update({
      where: { id: doc.styleVariantId },
      data: {
        totalRating: { increment: Math.min(5, Math.max(1, rating)) },
        ratingCount: { increment: 1 },
      },
    });
  }
}

// --- Sugerir estilo basado en contexto ---

export async function suggestStyle(
  projectId?: string
): Promise<{
  recommended: string | null;
  reason: string;
  alternatives: Array<{ id: string; name: string; reason: string }>;
}> {
  const result: {
    recommended: string | null;
    reason: string;
    alternatives: Array<{ id: string; name: string; reason: string }>;
  } = {
    recommended: null,
    reason: "Estándar corporativo Vex&Co",
    alternatives: [],
  };

  try {
    const goodVariants = await prisma.styleVariant.findMany({
      where: { isActive: true, isDefault: false, ratingCount: { gt: 0 } },
      orderBy: { usageCount: "desc" },
      take: 3,
    });

    for (const v of goodVariants) {
      const avgRating = v.ratingCount > 0 ? v.totalRating / v.ratingCount : 0;
      if (avgRating >= 3.5) {
        result.alternatives.push({
          id: v.id,
          name: v.name,
          reason: `Rating ${avgRating.toFixed(1)}/5 en ${v.usageCount} usos — origen: ${v.source}`,
        });
      }
    }

    const newVariants = await prisma.styleVariant.findMany({
      where: { isActive: true, isDefault: false, ratingCount: 0 },
      orderBy: { createdAt: "desc" },
      take: 2,
    });

    for (const v of newVariants) {
      result.alternatives.push({
        id: v.id,
        name: v.name,
        reason: `Nuevo estilo basado en ${v.source} — sin ratings aún`,
      });
    }
  } catch {
    // Silencioso — Quiet Luxury como fallback
  }

  return result;
}
