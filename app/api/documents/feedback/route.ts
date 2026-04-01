import { NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { recordFeedback } from "@/lib/documents/style-engine";

export async function POST(request: Request) {
  try {
    await getDefaultUserId();

    const { documentId, rating, comment } = await request.json();

    if (!documentId || !rating || rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: "documentId y rating (1-5) son requeridos" },
        { status: 400 }
      );
    }

    await recordFeedback(documentId, rating, comment);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Feedback error:", error);
    return NextResponse.json(
      { error: error.message || "Error saving feedback" },
      { status: 500 }
    );
  }
}
