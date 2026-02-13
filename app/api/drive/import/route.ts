import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { generatePresignedUploadUrl } from "@/lib/s3";

// Importar archivo desde Google Drive
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    
    const accessToken = (session.user as any).accessToken;
    const userId = (session.user as any).id;
    
    if (!accessToken) {
      return NextResponse.json({ 
        error: "No hay token de Google Drive",
        needsGoogleAuth: true 
      }, { status: 401 });
    }
    
    const { fileId, fileName, mimeType, projectId, category, tags } = await request.json();
    
    if (!fileId || !fileName) {
      return NextResponse.json({ error: "fileId y fileName son requeridos" }, { status: 400 });
    }
    
    // Descargar archivo de Google Drive
    const downloadResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );
    
    if (!downloadResponse.ok) {
      console.error("Error downloading file from Drive:", await downloadResponse.text());
      return NextResponse.json({ error: "Error al descargar archivo de Google Drive" }, { status: 500 });
    }
    
    const fileBuffer = await downloadResponse.arrayBuffer();
    
    // Determinar si es una imagen
    const isImage = mimeType?.startsWith("image/");
    const contentType = mimeType || "application/octet-stream";
    
    // Generar URL presignada y subir a S3
    const { uploadUrl, cloud_storage_path } = await generatePresignedUploadUrl(
      fileName,
      contentType,
      false // No público por defecto
    );
    
    // Subir a S3
    const uploadResponse = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": contentType
      },
      body: fileBuffer
    });
    
    if (!uploadResponse.ok) {
      console.error("Error uploading to S3:", await uploadResponse.text());
      return NextResponse.json({ error: "Error al subir archivo" }, { status: 500 });
    }
    
    // Guardar en la base de datos
    if (isImage) {
      const image = await prisma.image.create({
        data: {
          title: fileName,
          cloudStoragePath: cloud_storage_path,
          isPublic: false,
          category: category || "Google Drive",
          tags: tags || ["importado", "google-drive"],
          userId,
          projectId: projectId || null
        }
      });
      
      return NextResponse.json({
        success: true,
        type: "image",
        item: image
      });
    } else {
      // Para otros archivos, guardar como link con referencia al archivo
      const link = await prisma.link.create({
        data: {
          url: `drive://${cloud_storage_path}`,
          title: fileName,
          description: `Archivo importado desde Google Drive (${mimeType})`,
          category: category || "Google Drive",
          tags: tags || ["importado", "google-drive"],
          userId,
          projectId: projectId || null
        }
      });
      
      return NextResponse.json({
        success: true,
        type: "link",
        item: link
      });
    }
    
  } catch (error) {
    console.error("Error importing from Google Drive:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
