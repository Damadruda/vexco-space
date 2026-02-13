import { NextRequest, NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { prisma } from "@/lib/db";
import { getFileUrl } from "@/lib/s3";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const userId = await getDefaultUserId();
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");

    const where: any = { userId };
    if (projectId) where.projectId = projectId;

    const images = await prisma.image.findMany({
      where,
      orderBy: { createdAt: "desc" }
    });

    // Get signed URLs for images
    const items = await Promise.all(
      images.map(async (img) => ({
        ...img,
        imageUrl: await getFileUrl(img.cloudStoragePath, img.isPublic)
      }))
    );

    return NextResponse.json({ items });
  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    console.error("Error fetching images:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getDefaultUserId();
    const body = await request.json();

    if (!body.cloudStoragePath || typeof body.cloudStoragePath !== "string") {
      return NextResponse.json({ error: "cloudStoragePath es requerido" }, { status: 400 });
    }

    const image = await prisma.image.create({
      data: {
        title: body.title,
        description: body.description,
        cloudStoragePath: body.cloudStoragePath,
        isPublic: body.isPublic || false,
        category: body.category,
        tags: body.tags || [],
        projectId: body.projectId,
        userId
      }
    });

    return NextResponse.json({ image });
  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    console.error("Error creating image:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
