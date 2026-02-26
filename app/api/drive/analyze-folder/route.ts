import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Sin sesión" }, { status: 401 });

    const account = await prisma.account.findFirst({
      where: { userId: session.user.id, provider: "google" },
    });

    if (!account?.access_token) return NextResponse.json({ error: "Falta token" }, { status: 401 });

    const { folderId, folderName } = await request.json();

    // 1. Obtener archivos (Máximo 3 para asegurar velocidad)
    const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false`, {
      headers: { Authorization: `Bearer ${account.access_token}` }
    });
    const listData = await listRes.json();
    const files = (listData.files || []).slice(0, 3);

    // 2. Extraer texto de los archivos
    const contents = await Promise.all(files.map(async (file: any) => {
      try {
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=text/plain`, {
          headers: { Authorization: `Bearer ${account.access_token}` }
        });
        return res.ok ? await res.text() : "";
      } catch { return ""; }
    }));

    // 3. IA - Modelo corregido para evitar Error 404
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
    const prompt = `Analiza estos textos y resume el proyecto "${folderName}" en una frase. Contenido: ${contents.join(" ").substring(0, 2000)}`;
    const result = await model.generateContent(prompt);
    const summary = result.response.text();

    // 4. Guardado en Neon (Campos básicos)
    const project = await prisma.project.create({
      data: {
        title: folderName,
        description: summary.substring(0, 200) || "Proyecto analizado con éxito",
        status: "active",
        userId: session.user.id,
      }
    });

    return NextResponse.json({ success: true, project });
  } catch (error: any) {
    console.error("ERROR EN PRODUCCIÓN:", error.message);
    return NextResponse.json({ 
      error: "Fallo en el servidor", 
      details: error.message 
    }, { status: 500 });
  }
}
