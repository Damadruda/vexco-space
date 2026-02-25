import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

    const account = await prisma.account.findFirst({
      where: { userId: session.user.id, provider: "google" },
    });

    if (!account?.access_token) return NextResponse.json({ error: "Reconecta Google" }, { status: 401 });

    const { folderId, folderName } = await request.json();

    // 1. Listar archivos
    const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false`, {
      headers: { Authorization: `Bearer ${account.access_token}` }
    });
    const listData = await listRes.json();
    const files = listData.files || [];

    // 2. Extraer contenido en PARALELO (Más rápido para evitar Error 504)
    const contents = await Promise.all(files.slice(0, 10).map(async (file: any) => {
      try {
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=text/plain`, {
          headers: { Authorization: `Bearer ${account.access_token}` }
        });
        return res.ok ? { name: file.name, text: await res.text() } : null;
      } catch { return null; }
    }));

    const filteredContent = contents.filter(c => c !== null);

    // 3. IA con Gemini 1.5 Flash (Corregido el error 404)
    const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = `Analiza estos archivos del proyecto "${folderName}" y devuelve un JSON con: title, description, projectType (tech_product, service, commerce, content), currentPhase (idea, active, operational, completed), overallProgress (0-100) y milestones (un array con name, order y status). Contenido: ${JSON.stringify(filteredContent)}`;

    const result = await model.generateContent(prompt);
    const analysis = JSON.parse(result.response.text());

    // 4. Guardar en Base de Datos (Neon)
    const project = await prisma.project.create({
      data: {
        title: analysis.title || folderName,
        description: analysis.description,
        status: analysis.currentPhase,
        projectType: analysis.projectType,
        overallProgress: analysis.overallProgress,
        userId: session.user.id,
      }
    });

    return NextResponse.json({ success: true, project });
  } catch (error: any) {
    return NextResponse.json({ error: "Error", details: error.message }, { status: 500 });
  }
}
