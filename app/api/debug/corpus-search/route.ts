import { NextRequest, NextResponse } from "next/server";
import { searchCorpus } from "@/lib/corpus/search";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { query, corpusId, industry, topK } = body as {
    query?: string; corpusId?: string; industry?: string; topK?: number;
  };
  if (!query) return NextResponse.json({ error: "falta query" }, { status: 400 });

  const hits = await searchCorpus({
    query, corpusId, industry, topK: topK ?? 8, consumer: "corpus-search-debug",
  });
  return NextResponse.json({ count: hits.length, hits });
}
