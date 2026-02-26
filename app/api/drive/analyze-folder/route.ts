import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options"; // Verificado por Antigravity
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

    // 1. ESCANEO RECURSIVO TOTAL (Sin límites de profundidad agresivos)
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

    // 2. PROCESAMIENTO MULTIMODAL (Filtramos solo lo útil: Imágenes y Documentos)
    const promptsParts = await Promise.all(inventory.map(async (file) => {
      try {
        // Imágenes: Las pasamos como datos binarios (Base64)
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
        // Documentos: Extraemos el texto
        else if (file.mimeType.includes('document') || file.mimeType.includes('text')) {
          const exportUrl = file.mimeType.includes('google-apps') 
            ? `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=text/plain`
            : `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;
          
          const res = await fetch(exportUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
          return { text: `Archivo [${file.name}]: ${await res.text()}` };
        }
      } catch (e) { return null; }
    }));

    const finalParts = promptsParts.filter(p => p != null);

    // 3. IA - GEMINI 1.5 FLASH (Capacidad de 1M de tokens)
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
    const mainPrompt = `Analiza INTEGRALMENTE el proyecto "${folderName}" basándote en todos estos documentos e imágenes. 
    Busca tendencias (especialmente si hay datos de redes sociales como X), insights técnicos y el estado de avance.
    Devuelve una descripción profesional detallada y estructurada para el Dashboard.`;

    const result = await model.generateContent([mainPrompt, ...finalParts as any]);
    const responseText = result.response.text();

    // 4. GUARDADO EN NEON
    const project = await prisma.project.create({
      data: {
        title: folderName,
        description: responseText,
        status: "active",
        userId: session.user.id,
      }
    });

    return NextResponse.json({ success: true, project });

  } catch (error: any) {
    console.error("Pro Error:", error);
    return NextResponse.json({ error: "Fallo en el servidor", details: error.message }, { status: 500 });
  }
}
