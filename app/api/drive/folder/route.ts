import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";

// Listar archivos de una carpeta recursivamente
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
    const folderId = searchParams.get("folderId") || "root";
    
    // Función recursiva para obtener todos los archivos
    const getAllFiles = async (folderId: string, path: string = "") => {
      const files: any[] = [];
      let pageToken: string | null = null;
      
      do {
        const params = new URLSearchParams({
          q: `'${folderId.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}' in parents and trashed=false`,
          fields: "nextPageToken,files(id,name,mimeType,iconLink,thumbnailLink,webViewLink,webContentLink,modifiedTime,size,parents)",
          pageSize: "100",
          orderBy: "folder,name"
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
          if (response.status === 401) {
            throw new Error("Token expirado");
          }
          throw new Error("Error al acceder a Google Drive");
        }
        
        const data = await response.json();
        
        for (const file of data.files || []) {
          const filePath = path ? `${path}/${file.name}` : file.name;
          
          if (file.mimeType === "application/vnd.google-apps.folder") {
            // Es una carpeta, obtener archivos recursivamente
            file.path = filePath;
            file.children = await getAllFiles(file.id, filePath);
            files.push(file);
          } else {
            // Es un archivo
            file.path = filePath;
            files.push(file);
          }
        }
        
        pageToken = data.nextPageToken;
      } while (pageToken);
      
      return files;
    };
    
    const files = await getAllFiles(folderId);
    
    // Contar archivos por tipo
    const stats = {
      totalFiles: 0,
      totalFolders: 0,
      documents: 0,
      spreadsheets: 0,
      presentations: 0,
      images: 0,
      pdfs: 0,
      other: 0
    };
    
    const countFiles = (files: any[]) => {
      for (const file of files) {
        if (file.mimeType === "application/vnd.google-apps.folder") {
          stats.totalFolders++;
          if (file.children) {
            countFiles(file.children);
          }
        } else {
          stats.totalFiles++;
          
          if (file.mimeType.includes("document")) stats.documents++;
          else if (file.mimeType.includes("spreadsheet")) stats.spreadsheets++;
          else if (file.mimeType.includes("presentation")) stats.presentations++;
          else if (file.mimeType.startsWith("image/")) stats.images++;
          else if (file.mimeType === "application/pdf") stats.pdfs++;
          else stats.other++;
        }
      }
    };
    
    countFiles(files);
    
    return NextResponse.json({
      files,
      stats
    });
    
  } catch (error) {
    console.error("Error fetching folder contents:", error);
    
    if (error instanceof Error && error.message === "Token expirado") {
      return NextResponse.json({ 
        error: "Token de Google expirado. Por favor, vuelve a iniciar sesión.",
        needsGoogleAuth: true 
      }, { status: 401 });
    }
    
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
