import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "No session" }, { status: 401 });

    const account = await prisma.account.findFirst({
      where: { userId: session.user.id, provider: "google" },
    });

    if (!account?.access_token) return NextResponse.json({ error: "No token" }, { status: 401 });

    const { folderId, folderName } = await request.json();
    const accessToken = account.access_token;

    // 1. ESCANEO RECURSIVO (Sin límites de profundidad por ser Pro)
    async function scanRecursive(id: string): Promise<any[]> {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?q='${id}'+in+parents+and+trashed=false&fields=files(id,name,mimeType)`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await res.json();
      const files = data.files || [];
      
      let allFound: any[] = [];
      for (const file of files) {
        if (file.mimeType === 'application/vnd.google-apps.folder') {
          allFound = allFound.concat(await scanRecursive(file.id));
        } else {
          allFound.push(file);
        }
      }
      return allFound;
    }

    const inventory = await scanRecursive(folderId);

    // 2. PROCESAMIENTO MULTIMODAL
    const promptsParts = await Promise.all(inventory.map(async (file) => {
      try {
        if (file.mimeType.startsWith('image/')) {
          const res = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
            headers: { Authorization: `Bearer ${accessToken}` }
          });
          const buffer = await res.arrayBuffer();
          return {
            inlineData: {
              data: Buffer.from(buffer).toString("base64"),
              mimeType: file.mimeType
            }
          };
        } 
        else if (file.mimeType.includes('document') || file.mimeType.includes('text') || file.mimeType.includes('pdf')) {
          const exportUrl = file.mimeType.includes('google-apps') 
            ? `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=text/plain`
            : `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;
          
          const res = await fetch(exportUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
          const text = await res.text();
          return { text: `Contenido del archivo ${file.name}: ${text.substring(0, 5000)}` };
        }
      } catch (e) { return null; }
    }));

    const finalParts = promptsParts.filter(p => p != null);

    // 3. IA - MODELO CORREGIDO (gemini-1.5-flash es el alias estable)
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const mainPrompt = `Analiza profundamente el proyecto "${folderName}" con todos los archivos adjuntos. Identifica objetivos, tendencias (si hay datos de redes sociales), y el progreso actual. Resume todo en un formato profesional para un Dashboard.`;

    const result = await model.generateContent([mainPrompt, ...finalParts as any]);
    const responseText = result.response.text();

    // 4. GUARDADO EN NEON
    const project = await prisma.project.create({
      data: {
        title: folderName,
        description: responseText || "Análisis completado.",
        status: "active",
        userId: session.user.id,
      }
    });

    return NextResponse.json({ success: true, project });

  } catch (error: any) {
    console.error("Fallo final:", error.message);
    return NextResponse.json({ error: "Error en el procesamiento", details: error.message }, { status: 500 });
  }
}
