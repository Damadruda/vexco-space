import { NextRequest, NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { prisma } from "@/lib/db";
import { getFileUrl } from "@/lib/s3";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const userId = await getDefaultUserId();
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.toLowerCase() || "";
    const type = searchParams.get("type");

    if (!query) {
      return NextResponse.json({ results: [] });
    }

    const results: any[] = [];

    // Search Projects
    if (!type || type === "projects") {
      const projects = await prisma.project.findMany({
        where: {
          userId,
          OR: [
            { title: { contains: query, mode: "insensitive" } },
            { description: { contains: query, mode: "insensitive" } },
            { category: { contains: query, mode: "insensitive" } },
            { tags: { has: query } }
          ]
        },
        take: 10
      });
      results.push(
        ...projects.map((p) => ({
          ...p,
          type: "project",
          matchField: "project"
        }))
      );
    }

    // Search Notes
    if (!type || type === "notes") {
      const notes = await prisma.note.findMany({
        where: {
          userId,
          OR: [
            { title: { contains: query, mode: "insensitive" } },
            { content: { contains: query, mode: "insensitive" } },
            { category: { contains: query, mode: "insensitive" } },
            { tags: { has: query } }
          ]
        },
        take: 10
      });
      results.push(
        ...notes.map((n) => ({
          ...n,
          type: "note",
          matchField: "note"
        }))
      );
    }

    // Search Links
    if (!type || type === "links") {
      const links = await prisma.link.findMany({
        where: {
          userId,
          OR: [
            { title: { contains: query, mode: "insensitive" } },
            { description: { contains: query, mode: "insensitive" } },
            { url: { contains: query, mode: "insensitive" } },
            { category: { contains: query, mode: "insensitive" } },
            { tags: { has: query } }
          ]
        },
        take: 10
      });
      results.push(
        ...links.map((l) => ({
          ...l,
          type: "link",
          matchField: "link"
        }))
      );
    }

    // Search Images
    if (!type || type === "images") {
      const images = await prisma.image.findMany({
        where: {
          userId,
          OR: [
            { title: { contains: query, mode: "insensitive" } },
            { description: { contains: query, mode: "insensitive" } },
            { category: { contains: query, mode: "insensitive" } },
            { tags: { has: query } }
          ]
        },
        take: 10
      });
      
      const imagesWithUrls = await Promise.all(
        images.map(async (img) => ({
          ...img,
          imageUrl: await getFileUrl(img.cloudStoragePath, img.isPublic),
          type: "image",
          matchField: "image"
        }))
      );
      results.push(...imagesWithUrls);
    }

    // Sort by date
    results.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return NextResponse.json({ results: results.slice(0, 30) });
  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    console.error("Search error:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
