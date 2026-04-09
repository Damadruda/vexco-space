// =============================================================================
// /api/firm-corpus/documents — Paginated document listing with filters
// GET: ?documentType=&industry=&outcome=&search=&page=&pageSize=
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getCorpusDocuments } from "@/lib/services/firm-corpus";
import type { CorpusDocumentType } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const params = request.nextUrl.searchParams;
    const documentType = params.get("documentType") as CorpusDocumentType | null;
    const industry = params.get("industry") || undefined;
    const outcome = params.get("outcome") || undefined;
    const provenance = params.get("provenance") || undefined;
    const archived = params.get("archived") === "true";
    const search = params.get("search") || undefined;
    const page = parseInt(params.get("page") || "1", 10);
    const pageSize = Math.min(parseInt(params.get("pageSize") || "50", 10), 100);

    const result = await getCorpusDocuments({
      documentType: documentType || undefined,
      industry,
      outcome,
      provenance,
      archived,
      search,
      page,
      pageSize,
    });

    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
