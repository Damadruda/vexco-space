import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";

// Listar archivos de Google Drive
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ 
        error: "Inicia sesión con Google para acceder a tus archivos de Drive",
        needsGoogleAuth: true 
      }, { status: 401 });
    }
    
    const accessToken = (session.user as any).accessToken;
    
    if (!accessToken) {
      return NextResponse.json({ 
        error: "Conecta tu cuenta de Google para acceder a Drive",
        needsGoogleAuth: true 
      }, { status: 401 });
    }
    
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get("query") || "";
    const pageToken = searchParams.get("pageToken") || "";
    const mimeType = searchParams.get("mimeType") || "";
    const parentId = searchParams.get("parentId") || "";
    
    // Construir query para Google Drive API - sanitize inputs to prevent injection
    const sanitize = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    let driveQuery = "trashed=false";
    
    // Filtrar por carpeta padre si se especifica
    if (parentId) {
      driveQuery += ` and '${sanitize(parentId)}' in parents`;
    }
    
    if (query) {
      driveQuery += ` and name contains '${sanitize(query)}'`;
    }
    if (mimeType) {
      driveQuery += ` and mimeType='${sanitize(mimeType)}'`;
    }
    
    const params = new URLSearchParams({
      q: driveQuery,
      fields: "nextPageToken,files(id,name,mimeType,iconLink,thumbnailLink,webViewLink,webContentLink,modifiedTime,size)",
      pageSize: "20",
      orderBy: "modifiedTime desc"
    });
    
    if (pageToken) {
      params.append("pageToken", pageToken);
    }
    
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );
    
    if (!response.ok) {
      const error = await response.json();
      console.error("Google Drive API error:", error);
      
      if (response.status === 401) {
        return NextResponse.json({ 
          error: "Token de Google expirado. Por favor, vuelve a iniciar sesión.",
          needsGoogleAuth: true 
        }, { status: 401 });
      }
      
      return NextResponse.json({ error: "Error al acceder a Google Drive" }, { status: 500 });
    }
    
    const data = await response.json();
    
    return NextResponse.json({
      files: data.files || [],
      nextPageToken: data.nextPageToken
    });
    
  } catch (error) {
    console.error("Error fetching Google Drive files:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
