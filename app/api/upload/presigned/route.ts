import { NextRequest, NextResponse } from "next/server";
import { generatePresignedUploadUrl } from "@/lib/s3";
import { getDefaultUserId } from "@/lib/get-default-user";

export async function POST(request: NextRequest) {
  try {
    await getDefaultUserId();
    const body = await request.json();
    const { fileName, contentType, isPublic = false } = body;

    if (!fileName || !contentType) {
      return NextResponse.json(
        { error: "fileName y contentType son requeridos" },
        { status: 400 }
      );
    }

    const { uploadUrl, cloud_storage_path } = await generatePresignedUploadUrl(
      fileName,
      contentType,
      isPublic
    );

    return NextResponse.json({ uploadUrl, cloud_storage_path });
  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    console.error("Error generating presigned URL:", error);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
