import { NextRequest, NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function maskToken(token: string | null | undefined): string | null {
  if (!token) return null;
  return "****" + token.slice(-4);
}

export async function GET() {
  try {
    const userId = await getDefaultUserId();

    let prefs = await prisma.userPreferences.findUnique({
      where: { userId },
    });

    if (!prefs) {
      prefs = await prisma.userPreferences.create({
        data: { userId },
      });
    }

    return NextResponse.json({
      preferences: {
        ...prefs,
        raindropToken: maskToken(prefs.raindropToken),
        jinaApiKey: maskToken(prefs.jinaApiKey),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    console.error("[PREFERENCES] Error fetching:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const userId = await getDefaultUserId();
    const body = await request.json();

    const {
      raindropToken,
      jinaApiKey,
      defaultInboxView,
      aiAnalysisEnabled,
      autoTagging,
      theme,
      timezone,
    } = body;

    const prefs = await prisma.userPreferences.upsert({
      where: { userId },
      create: {
        userId,
        ...(raindropToken !== undefined && { raindropToken }),
        ...(jinaApiKey !== undefined && { jinaApiKey }),
        ...(defaultInboxView !== undefined && { defaultInboxView }),
        ...(aiAnalysisEnabled !== undefined && { aiAnalysisEnabled }),
        ...(autoTagging !== undefined && { autoTagging }),
        ...(theme !== undefined && { theme }),
        ...(timezone !== undefined && { timezone }),
      },
      update: {
        ...(raindropToken !== undefined && { raindropToken }),
        ...(jinaApiKey !== undefined && { jinaApiKey }),
        ...(defaultInboxView !== undefined && { defaultInboxView }),
        ...(aiAnalysisEnabled !== undefined && { aiAnalysisEnabled }),
        ...(autoTagging !== undefined && { autoTagging }),
        ...(theme !== undefined && { theme }),
        ...(timezone !== undefined && { timezone }),
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      preferences: {
        ...prefs,
        raindropToken: maskToken(prefs.raindropToken),
        jinaApiKey: maskToken(prefs.jinaApiKey),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    console.error("[PREFERENCES] Error updating:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
