// =============================================================================
// FRAMEWORK STATS — Validation endpoint for reprocess results
// =============================================================================

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const active = await prisma.framework.findMany({
    where: { status: "ACTIVE" },
    select: {
      name: true,
      slug: true,
      lifecycleStage: true,
      originSource: true,
    },
    orderBy: { name: "asc" },
  });

  const deprecated = await prisma.framework.count({
    where: { status: "DEPRECATED" },
  });

  // Validation checks for known frameworks
  const fullFunnel = active.find((f) =>
    f.name.toLowerCase().includes("full-funnel") ||
    f.name.toLowerCase().includes("full funnel")
  );
  const campanas = active.find((f) =>
    f.name.toLowerCase().includes("campañas") ||
    f.name.toLowerCase().includes("campanas")
  );
  const sapMercado = active.find((f) =>
    f.name.toLowerCase().includes("mercado sap") ||
    f.name.toLowerCase().includes("sap")
  );

  return NextResponse.json({
    activeCount: active.length,
    deprecatedCount: deprecated,
    activeFrameworks: active,
    validations: {
      fullFunnelIsExternal:
        fullFunnel?.lifecycleStage === "EXTERNAL" ||
        fullFunnel?.lifecycleStage === "ADOPTED"
          ? `OK (${fullFunnel.lifecycleStage})`
          : `FAIL ${fullFunnel?.lifecycleStage ?? "no detectado"}`,
      campanasIsOwn:
        campanas?.lifecycleStage === "OWN"
          ? "OK"
          : `FAIL ${campanas?.lifecycleStage ?? "no detectado"}`,
      sapMercadoIsOwn:
        sapMercado?.lifecycleStage === "OWN"
          ? "OK"
          : `FAIL ${sapMercado?.lifecycleStage ?? "no detectado"}`,
      countInRange:
        active.length >= 8 && active.length <= 12
          ? "OK"
          : `FAIL ${active.length}`,
    },
  });
}
