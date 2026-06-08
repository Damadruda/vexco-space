import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const now = Date.now();
  const d7 = new Date(now - 7 * 864e5);
  const d14 = new Date(now - 14 * 864e5);

  const last7 = await prisma.retrievalQueryLog.findMany({ where: { createdAt: { gte: d7 } } });
  const prev7 = await prisma.retrievalQueryLog.findMany({ where: { createdAt: { gte: d14, lt: d7 } } });

  const totalChunks = await prisma.corpusChunk.count();

  const gapRate = last7.length
    ? last7.filter((q) => q.topScore < 0.5).length / last7.length
    : 0;
  const meanTop1Last = last7.length ? avg(last7.map((q) => q.topScore)) : 0;
  const meanTop1Prev = prev7.length ? avg(prev7.map((q) => q.topScore)) : 0;
  const p95Latency = last7.length ? percentile(last7.map((q) => q.latencyMs), 95) : 0;

  const signals = {
    coverageGapRate: round(gapRate),
    coverageGapBreached: gapRate > 0.3 && last7.length >= 20,
    meanTop1Last7: round(meanTop1Last),
    meanTop1Prev7: round(meanTop1Prev),
    meanTop1Declining: prev7.length >= 20 && meanTop1Last < meanTop1Prev - 0.05,
    p95LatencyMs: p95Latency,
    latencyBreached: p95Latency > 500,
    totalChunks,
    chunkVolumeBreached: totalChunks > 50000,
    sampleSize: last7.length,
  };

  const recommendations: string[] = [];
  if (signals.coverageGapBreached)
    recommendations.push("Gap de cobertura >30%: evaluar busqueda hibrida BM25+vector (keyword captura codigos/nombres/terminos exactos).");
  if (signals.meanTop1Declining)
    recommendations.push("Similitud top-1 cayendo: revisar chunking o agregar reranking.");
  if (signals.latencyBreached)
    recommendations.push("p95 latencia >500ms: tunear HNSW (ef_search) o particionar.");
  if (signals.chunkVolumeBreached)
    recommendations.push("Volumen >50k chunks: revisar params HNSW / particion por corpus.");

  return NextResponse.json({ signals, recommendations });
}

function avg(xs: number[]) { return xs.reduce((s, x) => s + x, 0) / xs.length; }
function round(x: number) { return Math.round(x * 1000) / 1000; }
function percentile(xs: number[], p: number) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] ?? 0;
}
