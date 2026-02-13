import { NextRequest, NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const userId = await getDefaultUserId();
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");

    const where: any = { userId };
    if (projectId) where.projectId = projectId;

    const items = await prisma.link.findMany({
      where,
      orderBy: { createdAt: "desc" }
    });

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Error fetching links:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getDefaultUserId();
    const body = await request.json();

    // Try to fetch metadata from URL
    let title = body.title;
    let description = body.description;

    if (!title && body.url) {
      try {
        const res = await fetch(body.url, { 
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(5000)
        });
        const html = await res.text();
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
        title = titleMatch?.[1]?.trim() || body.url;
        description = descMatch?.[1]?.trim();
      } catch {
        title = body.url;
      }
    }

    const link = await prisma.link.create({
      data: {
        url: body.url,
        title,
        description,
        category: body.category,
        tags: body.tags || [],
        projectId: body.projectId,
        userId
      }
    });

    return NextResponse.json({ link });
  } catch (error) {
    console.error("Error creating link:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
