// =============================================================================
// MIP — /api/market-intelligence/tick
// Disparador del pipeline: evalúa templates activos, respeta schedule + cooldown,
// ejecuta los que corresponden, persiste briefs. Usado por Vercel Cron y por
// disparo manual autenticado (force=true).
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isScheduleDue, isCoolingDown } from "@/lib/market-intelligence/scheduler";
import { executeTemplate } from "@/lib/market-intelligence/executor";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

async function handle(request: NextRequest) {
  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "true";
  const onlyTemplateId = url.searchParams.get("templateId");

  // Auth dual:
  //   - Vercel Cron: header x-vercel-cron=1
  //   - Manual: sesión NextAuth válida
  const isCron = request.headers.get("x-vercel-cron") === "1";
  if (!isCron) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const now = new Date();
  const templates = await prisma.marketIntelligenceTemplate.findMany({
    where: {
      isActive: true,
      ...(onlyTemplateId ? { id: onlyTemplateId } : {}),
    },
  });

  const runs: Array<Record<string, unknown>> = [];

  for (const template of templates) {
    const due = force || isScheduleDue(template.schedule, now);
    const cooling = !force && isCoolingDown(template.lastRunAt, now);

    if (!due) {
      runs.push({
        templateId: template.id,
        name: template.name,
        status: "skipped_not_due",
      });
      continue;
    }
    if (cooling) {
      runs.push({
        templateId: template.id,
        name: template.name,
        status: "skipped_cooldown",
        lastRunAt: template.lastRunAt,
      });
      continue;
    }

    console.log(
      `[MIP tick] executing template ${template.name} (${template.id})`
    );
    const result = await executeTemplate(template);
    runs.push({
      templateId: template.id,
      name: template.name,
      status: "executed",
      result,
    });
  }

  return NextResponse.json({
    ok: true,
    now: now.toISOString(),
    totalTemplates: templates.length,
    runs,
  });
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
