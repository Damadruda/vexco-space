import { NextRequest, NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { matchInsightsForProject } from "@/lib/firm-insights/matcher";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const userId = await getDefaultUserId();
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");

    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required" },
        { status: 400 }
      );
    }

    const insights = await matchInsightsForProject({
      projectId,
      userId,
      topN: 10,
    });

    return NextResponse.json({ insights });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[FIRM_INSIGHTS RELEVANT]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
