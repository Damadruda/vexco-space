import { NextRequest, NextResponse } from "next/server";
import { getDefaultUserId } from "@/lib/get-default-user";
import { getAgentConfig } from "@/lib/engine/agents";
import { callLLM } from "@/lib/clients/llm";
import { loadProjectMemory } from "@/lib/engine/supervisor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const userId = await getDefaultUserId();

    const body = await request.json();
    const { agentId, message, projectId } = body as {
      agentId: string;
      message: string;
      projectId?: string;
    };

    if (!agentId || !message) {
      return NextResponse.json(
        { error: "agentId and message are required" },
        { status: 400 }
      );
    }

    const agentConfig = getAgentConfig(agentId);
    if (!agentConfig) {
      return NextResponse.json(
        { error: `Unknown agentId: ${agentId}` },
        { status: 400 }
      );
    }

    // Load project context if projectId provided
    let projectContext = "";
    if (projectId) {
      try {
        const memory = await loadProjectMemory(projectId, userId);
        if (memory) {
          const project = memory.project as Record<string, unknown>;
          projectContext = `
PROJECT CONTEXT:
- Title: ${project.title ?? "Untitled"}
- Description: ${project.description ?? "No description"}
- Status: ${project.status ?? "Unknown"}
- Concept: ${(project as any).concept ?? "Not defined"}
- Target Market: ${(project as any).targetMarket ?? "Not defined"}
- Business Model: ${(project as any).businessModel ?? "Not defined"}`;
        }
      } catch {
        // If project load fails, continue without context
      }
    }

    const systemPrompt = [
      agentConfig.consultingDNA,
      agentConfig.geographicContext,
      agentConfig.domainInstructions,
      "",
      "TONE RULES (Anti-IA filter — mandatory):",
      "Write with short, impactful sentences. Use active voice. Remove jargon and filler words.",
      "No buzzwords like 'revolutionary', 'crucial', 'discover', 'dive into', 'tapestry'.",
      "C-Level tone. Direct. Plain text only — no markdown, no bullet symbols, no headers.",
      "Maximum 4 concise paragraphs.",
    ]
      .filter(Boolean)
      .join("\n");

    const userPrompt = projectContext
      ? `${projectContext}\n\nUSER MESSAGE:\n${message}`
      : message;

    const llmResponse = await callLLM({
      model: agentConfig.preferredLLM,
      systemPrompt,
      userPrompt,
      jsonMode: false,
      temperature: 0.7,
      maxTokens: 8192, // gemini-2.5-pro needs room for thinking budget + response
    });

    console.log("[AGENT_CHAT] agentId:", agentId, "llmResponse:", JSON.stringify(llmResponse).substring(0, 500));

    return NextResponse.json({
      response: llmResponse.content,
      agentId: agentConfig.id,
      agentName: agentConfig.name,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "No autenticado") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[AGENTS/CHAT] Error:", error);
    return NextResponse.json(
      { error: "LLM error. Try again." },
      { status: 500 }
    );
  }
}
