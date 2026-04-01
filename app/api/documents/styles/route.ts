import { NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { getAvailableStyles, suggestStyle } from "@/lib/documents/style-engine";

export async function GET(request: Request) {
  try {
    await getDefaultUserId();

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId") || undefined;

    const [styles, suggestion] = await Promise.all([
      getAvailableStyles(),
      suggestStyle(projectId),
    ]);

    return NextResponse.json({ styles, suggestion });
  } catch (error: any) {
    return NextResponse.json({
      styles: [
        {
          id: null,
          name: "Quiet Luxury",
          description: "Estándar corporativo Vex&Co",
          isDefault: true,
          avgRating: null,
          usageCount: 0,
          source: "corporate",
        },
      ],
      suggestion: {
        recommended: null,
        reason: "Estándar corporativo Vex&Co",
        alternatives: [],
      },
    });
  }
}
