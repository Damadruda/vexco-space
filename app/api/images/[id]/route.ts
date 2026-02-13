import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { deleteFile } from "@/lib/s3";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const image = await prisma.image.update({
      where: { id: params.id },
      data: body
    });

    return NextResponse.json({ image });
  } catch (error) {
    console.error("Error updating image:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const image = await prisma.image.findUnique({ where: { id: params.id } });
    if (image?.cloudStoragePath) {
      try {
        await deleteFile(image.cloudStoragePath);
      } catch (e) {
        console.error("Error deleting file from S3:", e);
      }
    }

    await prisma.image.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting image:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
