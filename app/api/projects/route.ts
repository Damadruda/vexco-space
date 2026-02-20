import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getDefaultUserId } from "@/lib/get-default-user";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const userId = await getDefaultUserId();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const category = searchParams.get("category");
    const projectType = searchParams.get("projectType");

    const where: any = { userId };
    if (status) where.status = status;
    if (category) where.category = category;
    if (projectType) where.projectType = projectType;

    const projects = await prisma.project.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: {
        _count: {
          select: { ideas: true, notes: true, links: true, images: true, milestoneItems: true }
        },
        milestoneItems: {
          orderBy: { order: "asc" }
        }
      }
    });

    return NextResponse.json({ projects });
  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    console.error("Error fetching projects:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getDefaultUserId();
    const body = await request.json();

    if (!body.title || typeof body.title !== "string") {
      return NextResponse.json({ error: "El título es requerido" }, { status: 400 });
    }

    const validProjectTypes = ["idea", "active", "operational", "completed"];
    const projectType = validProjectTypes.includes(body.projectType) ? body.projectType : "idea";

    const project = await prisma.project.create({
      data: {
        title: body.title,
        description: body.description,
        status: body.status || "idea",
        projectType,
        category: body.category,
        tags: body.tags || [],
        priority: body.priority || "medium",
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        userId
      }
    });

    return NextResponse.json({ project });
  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    console.error("Error creating project:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
