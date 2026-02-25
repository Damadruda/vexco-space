import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options"; // Corregido por Antigravity
import { prisma } from "@/lib/db";                // Corregido por Antigravity
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const account = await prisma.account.findFirst({
      where: { userId: session.user.id, provider: "google" },
    });

    if (!account?.access_token) return NextResponse.json({ error: "Token de Google no encontrado" }, { status: 401 });

    const { folderId, folderName } = await request.json();

    // 1. Listar archivos (Optimizado)
    const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&fields=files(id,name,mimeType)`, {
      headers: { Authorization: `Bearer ${account.access_token}` }
    });
    const listData = await listRes.json();
    const files = listData.files || [];

    // 2. Extraer contenido en paralelo para evitar Timeout
    const contents = await Promise.all(files.slice(0, 10).map(async (file: any) => {
      try {
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=text/plain`, {
          headers: { Authorization: `Bearer ${account.access_token}` }
        });
        return res.ok ? { name: file.name, text: await res.text() } : null;
      } catch { return null; }
    }));

    const filteredContent = contents.filter(c => c !== null);

    // 3. IA con Limpieza de JSON (Evita el Error 500)
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const prompt = `Analiza estos archivos del proyecto "${folderName}" y devuelve UNICAMENTE un JSON (sin markdown) con: title, description, projectType (tech_product, service, commerce, content), currentPhase (idea, active, operational, completed), overallProgress (0-100). Contenido: ${JSON.stringify(filteredContent)}`;

    const result = await model.generateContent(prompt);
    const rawText = result.response.text();
    
    // Limpiador de etiquetas markdown si la IA las incluye
    const cleanJson = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
    const analysis = JSON.parse(cleanJson);

    // 4. Guardar en Base de Datos
    const project = await prisma.project.create({
      data: {
        title: analysis.title || folderName,
        description: analysis.description || "",
        status: analysis.currentPhase || "idea",
        projectType: analysis.projectType || "tech_product",
        currentPhase: analysis.currentPhase || "idea",
        overallProgress: analysis.overallProgress || 0,
        userId: session.user.id,
      }
    });

    return NextResponse.json({ success: true, project });
  } catch (error: any) {
    console.error("Error en analyze-folder:", error);
    return NextResponse.json({ error: "Error en el servidor", details: error.message }, { status: 500 });
  }
}
