import { NextRequest, NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function isAllowedUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    // Only allow http and https protocols
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return false;
    }
    // Block internal/private network addresses
    const hostname = url.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname.startsWith("10.") ||
      hostname.startsWith("172.") ||
      hostname.startsWith("192.168.") ||
      hostname === "[::1]" ||
      hostname.endsWith(".internal") ||
      hostname.endsWith(".local")
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

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
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    console.error("Error fetching links:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getDefaultUserId();
    const body = await request.json();

    if (!body.url || typeof body.url !== "string") {
      return NextResponse.json({ error: "La URL es requerida" }, { status: 400 });
    }

    if (!isAllowedUrl(body.url)) {
      return NextResponse.json({ error: "URL no permitida" }, { status: 400 });
    }

    // Try to fetch metadata from URL
    let title = body.title;
    let description = body.description;

    if (!title) {
      try {
        const res = await fetch(body.url, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(5000),
          redirect: "manual"
        });
        const html = await res.text();
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
        title = titleMatch?.[1]?.trim() || body.url;
        description = description || descMatch?.[1]?.trim();
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
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    console.error("Error creating link:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
