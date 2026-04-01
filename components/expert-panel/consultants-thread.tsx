"use client";

import { useState, useRef, useEffect } from "react";
import { Send, BookmarkPlus, X, Lightbulb, FileText, CheckSquare, Check, Zap, Copy, FileDown } from "lucide-react";
import type { DocumentSection } from "@/lib/documents/vexco-style";
import ReactMarkdown from "react-markdown";
import { EXPERTS, Expert } from "./experts-data";
import { ExpertAvatar } from "./expert-avatar";

// ─── Types ───────────────────────────────────────────────────────────────────

interface AssignedAgent {
  agentId: string;
  mission: string;
  suggestedQuestion: string;
  priority: number;
}

interface ExpertMessage {
  id: string;
  expertId: string;
  content: string;
  loading: boolean;
  streaming?: boolean;
  assignedAgents?: AssignedAgent[];
}

interface UserMessage {
  id: string;
  role: "user";
  content: string;
}

type ThreadMessage = ExpertMessage | UserMessage;
type SaveType = "idea" | "nota" | "tarea";

interface SaveModal { content: string }

interface ConsultantsThreadProps {
  activeExpert: Expert;
  projectId?: string;
  projectTitle?: string;
  onActivateAgent?: (agentId: string, question: string) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseAgentsFromContent(content: string): AssignedAgent[] {
  const agents: AssignedAgent[] = [];
  const EXPERT_IDS: Record<string, string> = {
    "revenue & growth": "revenue",
    "revenue": "revenue",
    "product & tech": "infrastructure",
    "product": "infrastructure",
    "challenger": "redteam",
    "strategist": "strategist",
  };

  const regex = /\*?\*?([\w\s&]+?)\*?\*?\s*—\s*Misión:\s*([^\n]+?)\.?\s*Pregunta inicial:\s*"([^"]+)"\s*(?:Prioridad:\s*(\d+))?/gi;
  let match;
  let priority = 1;

  while ((match = regex.exec(content)) !== null) {
    const name = match[1].trim().toLowerCase();
    const agentId = EXPERT_IDS[name];
    if (agentId && agentId !== "strategist") {
      agents.push({
        agentId,
        mission: match[2].trim(),
        suggestedQuestion: match[3].trim(),
        priority: match[4] ? parseInt(match[4]) : priority,
      });
      priority++;
    }
  }

  return agents;
}

// ─── @mention helpers ───────────────────────────────────────────────────────

const AGENT_ALIASES: Record<string, string> = {
  strategist: "strategist",
  revenue: "revenue",
  infrastructure: "infrastructure",
  redteam: "redteam",
  design: "design",
  challenger: "redteam",
  product: "infrastructure",
  tech: "infrastructure",
  growth: "revenue",
};

function resolveMention(text: string): Expert | null {
  const match = text.match(/@(\w+)/);
  if (!match) return null;
  const resolved = AGENT_ALIASES[match[1].toLowerCase()];
  if (!resolved) return null;
  return EXPERTS.find(e => e.id === resolved) || null;
}

// ─── Document generation helpers ────────────────────────────────────────────

function hasStructuredContent(content: string): boolean {
  // ## headings
  if ((content.match(/^## /gm) || []).length >= 3) return true;
  // Slide N: pattern
  const slides = (content.match(/Slide\s*\d+[.:]/gi) || []).length;
  if (slides >= 3) return true;
  // Numbered bold sections: 1. **Title**
  if ((content.match(/^\d+\.\s+\*\*/gm) || []).length >= 3) return true;
  // Keywords + some slides
  if (slides >= 2 && /pitch deck|presentación/i.test(content)) return true;
  // ### headings (level 3)
  if ((content.match(/^### /gm) || []).length >= 3) return true;
  // **1. or **1) at start of line
  if ((content.match(/^\*\*\d+[\.\)]/gm) || []).length >= 3) return true;
  // Any markdown heading (any level)
  if ((content.match(/^#+\s+/gm) || []).length >= 3) return true;
  // Bold bullets (more exigent: 5+ matches)
  if ((content.match(/^[-•]\s+\*\*/gm) || []).length >= 5) return true;
  // Sección N: / Section N:
  if ((content.match(/^(?:Sección|Section)\s*\d+/gim) || []).length >= 3) return true;
  return false;
}

function parseMessageToSections(content: string): DocumentSection[] {
  const sections: DocumentSection[] = [];

  // Try splitting by ## first
  let parts = content.split(/^## /gm).filter(Boolean);

  // If not enough ##, try ### headings
  if (parts.length < 3) {
    parts = content.split(/^### /gm).filter(Boolean);
  }

  // If not enough ###, try "Slide N:"
  if (parts.length < 3) {
    parts = content.split(/(?=Slide\s*\d+[.:])/gi).filter(Boolean);
  }

  // Try **N. Title** or **N) Title**
  if (parts.length < 3) {
    parts = content.split(/(?=\*\*\d+[\.\)]\s*)/).filter(Boolean);
  }

  // Try numbered bold sections: 1. **Title**
  if (parts.length < 3) {
    parts = content.split(/(?=\d+\.\s+\*\*)/).filter(Boolean);
  }

  // Try Sección N: / Section N:
  if (parts.length < 3) {
    parts = content.split(/(?=(?:Sección|Section)\s*\d+[.:])/gi).filter(Boolean);
  }

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();
    const lines = part.split("\n").filter((l) => l.trim());
    if (lines.length === 0) continue;

    const title = lines[0]
      .replace(/^Slide\s*\d+[.:]\s*/i, "")
      .replace(/^(?:Sección|Section)\s*\d+[.:]\s*/i, "")
      .replace(/^\*\*\d+[\.\)]\s*/, "")
      .replace(/^\d+\.\s+/, "")
      .replace(/\*\*/g, "")
      .replace(/^#+\s*/, "")
      .trim();

    if (!title) continue;

    const bodyLines = lines.slice(1);
    const bullets = bodyLines
      .filter((l) => /^[-•*]\s/.test(l.trim()) || /^\*\*/.test(l.trim()))
      .map((l) =>
        l.trim().replace(/^[-•*]\s*/, "").replace(/\*\*/g, "").trim()
      )
      .filter((l) => l.length > 0);

    const contentText = bodyLines
      .filter((l) => !/^[-•*]\s/.test(l.trim()) && !/^\*\*/.test(l.trim()))
      .map((l) => l.replace(/\*\*/g, "").trim())
      .join(" ")
      .trim();

    let layout: DocumentSection["layout"] = "content";
    if (i === 0) layout = "title";
    else if (
      i === parts.length - 1 &&
      /cierre|contacto|siguiente|next|call to action|cta/i.test(title)
    )
      layout = "closing";
    else if (bullets.length === 0 && !contentText) layout = "section";

    sections.push({
      title,
      content: contentText || (layout === "title" ? bullets[0] : undefined),
      bullets: layout !== "title" ? bullets : bullets.slice(1),
      layout,
    });
  }

  return sections;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SAVE_CONFIG: Record<SaveType, { label: string; icon: React.ElementType }> = {
  idea: { label: "Idea", icon: Lightbulb },
  nota: { label: "Nota", icon: FileText },
  tarea: { label: "Tarea", icon: CheckSquare },
};

// ─── Component ───────────────────────────────────────────────────────────────

export function ConsultantsThread({
  activeExpert,
  projectId,
  projectTitle = "Sin proyecto activo",
  onActivateAgent,
}: ConsultantsThreadProps) {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [saveModal, setSaveModal] = useState<SaveModal | null>(null);
  const [saveTitle, setSaveTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedType, setSavedType] = useState<SaveType | null>(null);
  const [convertedMsgIds, setConvertedMsgIds] = useState<Set<string>>(new Set());
  const [converting, setConverting] = useState(false);
  const [copiedPromptId, setCopiedPromptId] = useState<string | null>(null);
  const [showFormatPicker, setShowFormatPicker] = useState<string | null>(null);
  const [generatingDoc, setGeneratingDoc] = useState(false);
  const [availableStyles, setAvailableStyles] = useState<any[]>([]);
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
  const [styleSuggestion, setStyleSuggestion] = useState<any>(null);
  const [lastDocumentId, setLastDocumentId] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);

  const threadEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── 4A: Load persisted messages on mount ──────────────────────────────────
  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/projects/${projectId}/messages`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data?.messages || data.messages.length === 0) return;
        const loaded: ThreadMessage[] = data.messages.map(
          (m: { id: string; role: string; content: string; agentId?: string; agentName?: string }) => {
            if (m.role === "user") {
              return { id: m.id, role: "user" as const, content: m.content };
            }

            let assignedAgents: AssignedAgent[] = [];
            if (m.agentId === "strategist" && m.content) {
              assignedAgents = parseAgentsFromContent(m.content);
            }

            return {
              id: m.id,
              expertId: m.agentId ?? activeExpert.id,
              content: m.content,
              loading: false,
              assignedAgents,
            } as ExpertMessage;
          }
        );
        setMessages(loaded);
      })
      .catch(() => {/* silently ignore */});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // ── 4B: Persist a single message to the DB ────────────────────────────────
  const persistMessage = async (
    role: string,
    content: string,
    agentId?: string,
    agentName?: string
  ): Promise<void> => {
    if (!projectId) return;
    try {
      await fetch(`/api/projects/${projectId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, content, agentId, agentName }),
      });
    } catch {
      /* fire-and-forget — do not block UI */
    }
  };

  // ── Core: call individual agent via /api/agents/chat (streaming SSE) ──────
  const callAgent = async (
    expert: Expert,
    prompt: string,
    msgId: string
  ): Promise<void> => {
    try {
      // Build conversationHistory from current messages (4D)
      const conversationHistory = messages
        .filter((m) => !("loading" in m && (m as ExpertMessage).loading))
        .map((m) => {
          if ("role" in m && m.role === "user") {
            return { role: "user", content: m.content };
          }
          const em = m as ExpertMessage;
          return { role: "assistant", content: em.content, agentId: em.expertId };
        });

      const res = await fetch("/api/agents/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: expert.id,
          message: prompt,
          ...(projectId ? { projectId } : {}),
          ...(conversationHistory.length > 0 ? { conversationHistory } : {}),
        }),
      });

      if (!res.ok) throw new Error(`API error ${res.status}`);

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No readable stream");

      const decoder = new TextDecoder();
      let accumulated = "";
      let respondingAgentId = expert.id;
      let respondingAgentName = expert.name;
      let buffer = "";

      // Switch from loading to streaming state
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId && "expertId" in m
            ? { ...m, loading: false, streaming: true, content: "" }
            : m
        )
      );

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || ""; // keep incomplete chunk in buffer

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          let data: Record<string, unknown>;
          try {
            data = JSON.parse(line.slice(6));
          } catch {
            continue;
          }

          if (data.error) {
            throw new Error(data.error as string);
          }

          if (data.agentId) {
            respondingAgentId = data.agentId as string;
          }

          if (data.done) {
            // Stream complete — finalize message
            const finalText = (data.fullText as string) || accumulated;
            const assignedAgents = (data.assignedAgents as AssignedAgent[]) || [];
            respondingAgentName = (data.agentName as string) || expert.name;

            setMessages((prev) =>
              prev.map((m) =>
                m.id === msgId && "expertId" in m
                  ? {
                      ...m,
                      expertId: respondingAgentId,
                      content: finalText,
                      loading: false,
                      streaming: false,
                      assignedAgents,
                    }
                  : m
              )
            );

            // 4C: Persist agent response
            persistMessage("assistant", finalText, respondingAgentId, respondingAgentName);
            return;
          }

          if (data.text) {
            accumulated += data.text as string;
            const currentText = accumulated;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === msgId && "expertId" in m
                  ? { ...m, expertId: respondingAgentId, content: currentText }
                  : m
              )
            );
          }
        }
      }

      // If we exited the loop without a done event, finalize with what we have
      if (accumulated) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId && "expertId" in m
              ? { ...m, content: accumulated, loading: false, streaming: false }
              : m
          )
        );
        persistMessage("assistant", accumulated, respondingAgentId, respondingAgentName);
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId && "expertId" in m
            ? { ...m, content: "Error al obtener respuesta. Intenta de nuevo.", loading: false, streaming: false }
            : m
        )
      );
    }
  };

  const addExpertPlaceholder = (expert: Expert): string => {
    const msgId = `${expert.id}-${Date.now()}-${Math.random()}`;
    setMessages((prev) => [
      ...prev,
      { id: msgId, expertId: expert.id, content: "", loading: true },
    ]);
    return msgId;
  };

  // ── Activate agent from panel + auto-send suggested question ─────────────
  const handleActivateAgent = async (agentId: string, question: string) => {
    if (onActivateAgent) {
      onActivateAgent(agentId, question);
    }

    await new Promise(r => setTimeout(r, 100));

    const userMsgId = `user-${Date.now()}`;
    setMessages(prev => [...prev, { id: userMsgId, role: "user" as const, content: question }]);

    persistMessage("user", question);

    const newExpert = EXPERTS.find(e => e.id === agentId) || EXPERTS[0];
    const msgId = `${agentId}-${Date.now()}-${Math.random()}`;
    setMessages(prev => [...prev, { id: msgId, expertId: agentId, content: "", loading: true }]);
    setIsLoading(true);

    await callAgent(newExpert, question, msgId);
    setIsLoading(false);
  };

  // ── Send message → active expert (or @mentioned agent) ─────────────────
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const prompt = input.trim();
    if (!prompt || isLoading) return;

    setInput("");
    setIsLoading(true);
    setMessages((prev) => [
      ...prev,
      { id: `user-${Date.now()}`, role: "user", content: prompt },
    ]);

    // 4C: Persist user message
    persistMessage("user", prompt);

    // Detect @mention → route to mentioned agent, keep activeExpert unchanged
    const mentionedExpert = resolveMention(prompt);
    const targetExpert = mentionedExpert ?? activeExpert ?? EXPERTS[0];
    const msgId = addExpertPlaceholder(targetExpert);
    await callAgent(targetExpert, prompt, msgId);
    setIsLoading(false);
  };

  // ── Convert Sprint 0 tasks → Agile Board ─────────────────────────────────
  const convertToTasks = async (msgId: string, content: string) => {
    if (!projectId || converting) return;
    setConverting(true);
    try {
      const sprint0Match = content.match(/SPRINT 0[^\n]*\n([\s\S]*?)(?=\n##|\n<!-- |$)/i);
      if (!sprint0Match) return;

      const lines = sprint0Match[1].split("\n").filter(l => l.trim());
      const tasks: Array<{ title: string; description: string; priority: string }> = [];

      for (const line of lines) {
        const cleanLine = line.replace(/^\s*\d+[\.\)]\s*/, "").trim();
        if (!cleanLine || cleanLine.length < 5) continue;

        const title = cleanLine
          .replace(/\*\*/g, "")
          .replace(/→.*$/, "")
          .replace(/Owner:.*$/i, "")
          .replace(/\.\s*$/, "")
          .trim();

        if (title.length < 3) continue;

        const ownerMatch = cleanLine.match(/(?:Owner|owner)[:\s]+(.+?)(?:\.|$)/);
        const description = ownerMatch
          ? `Owner sugerido: ${ownerMatch[1].trim()}`
          : "";

        tasks.push({
          title,
          description,
          priority: tasks.length === 0 ? "high" : "medium",
        });
      }

      if (tasks.length === 0) return;

      const res = await fetch("/api/agile/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tasks: tasks.map(t => ({
            ...t,
            projectId,
            labels: ["sprint-0", "strategist"],
            sprint: "Sprint 0",
          })),
        }),
      });

      if (res.ok) {
        setConvertedMsgIds(prev => new Set([...prev, msgId]));
      }
    } catch (err) {
      console.error("Error converting tasks:", err);
    } finally {
      setConverting(false);
    }
  };

  // ── Save to project ───────────────────────────────────────────────────────
  const handleSave = async (type: SaveType) => {
    if (!saveModal) return;
    setSaving(true);
    try {
      await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: saveTitle.trim() || "Análisis del War Room",
          content: saveModal.content,
          category: type,
          ...(projectId ? { projectId } : {}),
        }),
      });
      setSavedType(type);
      setTimeout(() => { setSaveModal(null); setSavedType(null); }, 1200);
    } catch {}
    finally { setSaving(false); }
  };

  // ── Load available styles ───────────────────────────────────────────────
  const loadStyles = async () => {
    try {
      const res = await fetch(`/api/documents/styles?projectId=${projectId || ""}`);
      const data = await res.json();
      setAvailableStyles(data.styles || []);
      setStyleSuggestion(data.suggestion || null);
    } catch {
      setAvailableStyles([{
        id: null, name: "Quiet Luxury",
        description: "Estándar corporativo Vex&Co",
        isDefault: true,
      }]);
    }
  };

  // ── Generate document (PPTX/DOCX/PDF) ──────────────────────────────────
  const handleGenerateDocument = async (
    content: string,
    format: "pptx" | "docx" | "pdf"
  ) => {
    setGeneratingDoc(true);
    setShowFormatPicker(null);
    try {
      const sections = parseMessageToSections(content);
      const res = await fetch("/api/documents/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: projectTitle || "Documento Vex&Co",
          subtitle: "Preparado por Vex&Co Lab",
          sections,
          format,
          projectId,
          styleVariantId: selectedStyle,
        }),
      });
      if (!res.ok) throw new Error("Error al generar");

      const docId = res.headers.get("X-Document-Id");
      if (docId) setLastDocumentId(docId);

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(projectTitle || "documento").replace(/\s+/g, "_")}_VexCo.${format}`;
      a.click();
      URL.revokeObjectURL(url);

      if (docId) {
        setTimeout(() => setShowFeedback(true), 2000);
      }
    } catch (err) {
      console.error("Error generating document:", err);
    } finally {
      setGeneratingDoc(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      <div className="flex flex-col h-full bg-white">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-ql-sand/20">
          <div>
            <h2 className="ql-h3 leading-tight">{projectTitle}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              {isLoading ? (
                <>
                  <span className="ql-status-thinking" />
                  <span className="ql-caption normal-case tracking-normal italic">
                    {activeExpert.name} respondiendo…
                  </span>
                </>
              ) : (
                <>
                  <span className="ql-status-active" />
                  <span className="ql-caption">{activeExpert.name} en línea</span>
                </>
              )}
            </div>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1.5 border border-ql-sand/30 px-3 py-1 text-xs text-ql-muted">
            <ExpertAvatar expert={activeExpert} size="sm" />
            {activeExpert.name}
          </span>
        </div>

        {/* Thread */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center py-16">
              <div className="flex -space-x-2 mb-6">
                {EXPERTS.map((e) => (
                  <ExpertAvatar key={e.id} expert={e} size="lg" showRing />
                ))}
              </div>
              <h3 className="ql-h3 mb-2">{activeExpert.name} en línea</h3>
              <p className="ql-body max-w-sm">
                Consulta directa con{" "}
                <strong>{activeExpert.name}</strong>. Solo responde este agente.
                Para análisis con Supervisor usa <strong>Estrategia</strong>.
              </p>
              {!projectId && (
                <p className="mt-3 ql-caption normal-case tracking-normal text-ql-warning max-w-xs">
                  Sin proyecto activo. Los agentes no tendrán contexto de historial.
                </p>
              )}
            </div>
          )}

          {messages.map((msg) => {
            // ── User message ──────────────────────────────────────────────
            if ("role" in msg && msg.role === "user") {
              return (
                <div key={msg.id} className="flex justify-end">
                  <div className="max-w-[70%] px-4 py-3 rounded-lg rounded-tr-sm bg-ql-charcoal text-white">
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  </div>
                </div>
              );
            }

            // ── Expert message ────────────────────────────────────────────
            const dm = msg as ExpertMessage;
            const expert = EXPERTS.find((e) => e.id === dm.expertId) || {
              id: dm.expertId,
              name: dm.expertId,
              role: "Agente anterior",
              initials: dm.expertId.substring(0, 2).toUpperCase(),
              bgColor: "bg-ql-charcoal",
              textColor: "text-ql-charcoal",
              ringColor: "ring-ql-sand/40",
              focus: "",
              persona: "",
            };

            return (
              <div
                key={dm.id}
                className="flex gap-3"
                onMouseEnter={() => !dm.loading && setHoveredId(dm.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <ExpertAvatar expert={expert} size="md" hasResponse={!dm.loading && !!dm.content} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-sm font-medium text-ql-charcoal">{expert.name}</span>
                    <span className="ql-caption">{expert.role}</span>
                    {dm.expertId !== activeExpert.id && !dm.loading && !dm.streaming && (
                      <span className="text-[10px] text-ql-muted bg-ql-cream px-1.5 py-0.5 border border-ql-sand/30">
                        vía @mention
                      </span>
                    )}
                  </div>
                  <div className="bg-white border border-ql-sand/20 rounded-lg rounded-tl-sm px-4 py-3">
                    {dm.loading ? (
                      <div className="flex items-center gap-2">
                        <span className="ql-status-thinking" />
                        <span className="ql-loading">Conectando…</span>
                      </div>
                    ) : (
                      <div className="prose prose-sm prose-neutral max-w-none text-ql-slate
                        prose-headings:font-medium prose-headings:text-ql-charcoal prose-headings:text-sm prose-headings:mt-4 prose-headings:mb-1
                        prose-p:leading-relaxed prose-p:my-1
                        prose-li:my-0.5 prose-ul:my-1 prose-strong:text-ql-charcoal
                        prose-hr:border-ql-sand/30">
                        <ReactMarkdown>{dm.content}</ReactMarkdown>
                        {dm.streaming && (
                          <span className="inline-block w-1.5 h-4 bg-ql-charcoal/60 animate-pulse ml-0.5 -mb-0.5" />
                        )}
                      </div>
                    )}
                  </div>

                  {/* ── Perplexity prompt block ──────────────────────────── */}
                  {!dm.loading && !dm.streaming && dm.content && /prompt para perplexity/i.test(dm.content) && (() => {
                    // Extract everything after "Prompt para Perplexity:" until next ## heading or end
                    const blockMatch = dm.content.match(
                      /Prompt para Perplexity[:\s]*\n+([\s\S]*?)(?=\n##|\n---|\n\n\n|$)/i
                    );
                    // Fallback: single-line with quotes
                    const inlineMatch = dm.content.match(
                      /Prompt para Perplexity[:\s]*"([^"]+)"/i
                    );
                    const rawPrompt = blockMatch?.[1]?.trim() || inlineMatch?.[1]?.trim();
                    if (!rawPrompt) return null;
                    // Clean version for clipboard: strip markdown formatting
                    const clipboardText = rawPrompt
                      .replace(/^\s*>\s*/gm, "")
                      .replace(/\*\*/g, "")
                      .replace(/^[""]|[""]$/g, "")
                      .trim();
                    const isCopied = copiedPromptId === dm.id;
                    return (
                      <div className="mt-3 p-3 bg-ql-offwhite border border-ql-sand/30 rounded-md">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-ql-slate">Prompt para Perplexity Pro</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              navigator.clipboard.writeText(clipboardText).then(() => {
                                setCopiedPromptId(dm.id);
                                setTimeout(() => setCopiedPromptId(null), 2000);
                              });
                            }}
                            className="inline-flex items-center gap-1 text-xs border border-ql-charcoal/20 px-2 py-1 text-ql-slate hover:bg-ql-charcoal hover:text-white transition-colors"
                          >
                            {isCopied ? (
                              <>
                                <Check className="h-3 w-3" />
                                Copiado
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3" />
                                Copiar prompt
                              </>
                            )}
                          </button>
                        </div>
                        <div className="text-sm text-ql-charcoal bg-white/50 p-2 rounded border border-ql-sand/20
                          prose prose-sm prose-neutral max-w-none
                          prose-p:my-1 prose-p:leading-relaxed
                          prose-blockquote:border-ql-sand/40 prose-blockquote:text-ql-slate prose-blockquote:my-1
                          prose-strong:text-ql-charcoal">
                          <ReactMarkdown>{rawPrompt}</ReactMarkdown>
                        </div>
                      </div>
                    );
                  })()}

                  {/* ── Assigned agents panel (strategist only) ─────────── */}
                  {!dm.loading && !dm.streaming && dm.assignedAgents && dm.assignedAgents.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <p className="ql-label text-[10px]">Equipo asignado · activa por orden de prioridad</p>
                      {[...dm.assignedAgents]
                        .sort((a, b) => a.priority - b.priority)
                        .map((agent) => {
                          const expert = EXPERTS.find((e) => e.id === agent.agentId);
                          if (!expert) return null;
                          return (
                            <div
                              key={agent.agentId}
                              className="border border-ql-sand/30 bg-ql-offwhite px-4 py-3 space-y-1"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-0.5">
                                    <span className="text-xs font-medium text-ql-charcoal">
                                      {agent.priority}. {expert.name}
                                    </span>
                                    <span className="ql-caption text-[10px]">{expert.role}</span>
                                  </div>
                                  <p className="text-xs text-ql-slate leading-snug">{agent.mission}</p>
                                  <p className="text-xs text-ql-muted italic mt-1">
                                    &ldquo;{agent.suggestedQuestion}&rdquo;
                                  </p>
                                </div>
                                {onActivateAgent && (
                                  <button
                                    onClick={() =>
                                      handleActivateAgent(agent.agentId, agent.suggestedQuestion)
                                    }
                                    className="shrink-0 inline-flex items-center gap-1 text-[11px] border border-ql-charcoal/20 px-2.5 py-1 text-ql-slate hover:bg-ql-charcoal hover:text-white hover:border-ql-charcoal transition-colors"
                                  >
                                    <Zap className="h-3 w-3" />
                                    Activar
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}

                  {!dm.loading && !dm.streaming && dm.content && dm.expertId === "strategist" &&
                   dm.content.toUpperCase().includes("SPRINT 0") && (
                    <div className="mt-2">
                      {convertedMsgIds.has(dm.id) ? (
                        <a
                          href={`/project-builder/${projectId}/agile`}
                          className="inline-flex items-center gap-1.5 text-xs text-ql-slate hover:text-ql-charcoal underline underline-offset-2 transition-colors"
                        >
                          <Check className="h-3.5 w-3.5" />
                          Tareas creadas — Ver en Agile Board →
                        </a>
                      ) : (
                        <button
                          onClick={() => convertToTasks(dm.id, dm.content)}
                          disabled={converting}
                          className="inline-flex items-center gap-1.5 text-xs border border-ql-charcoal/20 px-3 py-1.5 text-ql-slate hover:bg-ql-charcoal hover:text-white transition-colors disabled:opacity-50"
                        >
                          <CheckSquare className="h-3.5 w-3.5" />
                          {converting ? "Creando tareas..." : "Convertir Sprint 0 en tareas"}
                        </button>
                      )}
                    </div>
                  )}

                  {/* ── Generate document button ──────────────────────── */}
                  {!dm.loading && !dm.streaming && dm.content && hasStructuredContent(dm.content) && (
                    <div className="mt-3">
                      {showFormatPicker === dm.id ? (
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[10px] text-ql-muted mr-1">Formato:</span>
                            {([
                              ["pptx", "Presentación"],
                              ["docx", "Documento"],
                              ["pdf", "PDF"],
                            ] as const).map(([fmt, label]) => (
                              <button
                                key={fmt}
                                onClick={() => handleGenerateDocument(dm.content, fmt)}
                                disabled={generatingDoc}
                                className="inline-flex items-center gap-1 text-[11px] border border-ql-charcoal/20 px-2.5 py-1 text-ql-slate hover:bg-ql-charcoal hover:text-white transition-colors disabled:opacity-50"
                              >
                                {label} (.{fmt})
                              </button>
                            ))}
                            <button
                              onClick={() => setShowFormatPicker(null)}
                              className="text-[10px] text-ql-muted hover:text-ql-slate ml-1"
                            >
                              Cancelar
                            </button>
                            {generatingDoc && (
                              <span className="text-[10px] text-ql-muted italic ml-1">Generando...</span>
                            )}
                          </div>

                          {/* Style Picker */}
                          {availableStyles.length > 1 && (
                            <div className="space-y-2">
                              <p className="text-xs text-[#6B6B6B] font-medium tracking-wide uppercase">
                                Estilo visual
                              </p>
                              <div className="space-y-1.5">
                                {availableStyles.map((s: any) => (
                                  <button
                                    key={s.id || "default"}
                                    onClick={() => setSelectedStyle(s.id)}
                                    className={`w-full text-left px-3 py-2 rounded-md border text-sm
                                      transition-all duration-200
                                      ${(selectedStyle === s.id || (selectedStyle === null && s.isDefault))
                                        ? "border-[#B8860B] bg-[#B8860B]/5"
                                        : "border-[#E8E4DE] hover:border-[#B8860B]/40"
                                      }`}
                                  >
                                    <span className="font-medium text-[#1A1A1A]">{s.name}</span>
                                    {s.isDefault && (
                                      <span className="ml-2 text-[10px] text-[#B8860B] uppercase tracking-wider">
                                        estándar
                                      </span>
                                    )}
                                    {s.avgRating && (
                                      <span className="ml-2 text-[10px] text-[#6B6B6B]">
                                        {s.avgRating.toFixed(1)}/5
                                      </span>
                                    )}
                                    {s.description && (
                                      <p className="text-xs text-[#6B6B6B] mt-0.5">{s.description}</p>
                                    )}
                                  </button>
                                ))}
                              </div>
                              {styleSuggestion?.reason && (
                                <p className="text-[10px] text-[#999] italic mt-1">
                                  Recomendación: {styleSuggestion.reason}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={() => { setShowFormatPicker(dm.id); loadStyles(); }}
                          className="inline-flex items-center gap-1.5 text-xs border border-ql-charcoal/20 px-3 py-1.5 text-ql-slate hover:bg-ql-charcoal hover:text-white transition-colors"
                        >
                          <FileDown className="h-3.5 w-3.5" />
                          Generar Documento
                        </button>
                      )}
                    </div>
                  )}

                  {/* ── Feedback widget ─────────────────────────────── */}
                  {showFeedback && lastDocumentId && (
                    <div className="mt-3 p-3 border border-[#E8E4DE] rounded-md bg-[#FAFAF8]">
                      <p className="text-xs text-[#6B6B6B] mb-2">
                        ¿Cómo quedó el documento?
                      </p>
                      <div className="flex gap-1.5">
                        {[1, 2, 3, 4, 5].map((rating) => (
                          <button
                            key={rating}
                            onClick={async () => {
                              try {
                                await fetch("/api/documents/feedback", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    documentId: lastDocumentId,
                                    rating,
                                  }),
                                });
                                setShowFeedback(false);
                                setLastDocumentId(null);
                              } catch {}
                            }}
                            className="w-8 h-8 rounded border border-[#E8E4DE]
                              hover:border-[#B8860B] hover:bg-[#B8860B]/5
                              text-xs text-[#6B6B6B] hover:text-[#B8860B]
                              transition-all duration-200"
                          >
                            {rating}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() => { setShowFeedback(false); setLastDocumentId(null); }}
                        className="text-[10px] text-[#999] mt-1.5 hover:text-[#6B6B6B]"
                      >
                        Saltar
                      </button>
                    </div>
                  )}

                  {!dm.loading && !dm.streaming && dm.content && hoveredId === dm.id && (
                    <button
                      onClick={() => {
                        setSaveModal({ content: dm.content });
                        setSaveTitle("");
                        setSavedType(null);
                      }}
                      className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-ql-muted hover:text-ql-slate transition-colors"
                    >
                      <BookmarkPlus className="h-3.5 w-3.5" />
                      Guardar en proyecto
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={threadEndRef} />
        </div>

        {/* Input */}
        <form onSubmit={handleSend} className="border-t border-ql-sand/20 px-6 py-4">
          <div className="flex gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                isLoading
                  ? `${activeExpert.name} respondiendo…`
                  : `Pregúntale a ${activeExpert.name}…`
              }
              disabled={isLoading}
              className="flex-1 ql-input text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="flex h-10 w-10 items-center justify-center bg-ql-charcoal text-white hover:bg-ql-slate disabled:bg-ql-cream disabled:cursor-not-allowed transition-colors"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-2 ql-caption normal-case tracking-normal">
            Consulta directa con{" "}
            <span className="font-medium text-ql-slate">{activeExpert.name}</span>.
            Usa <span className="font-medium text-ql-slate">@agente</span> para invocar otro.
            Estrategia → Supervisor. Debate → multi-agente.
          </p>
        </form>
      </div>

      {/* Save Modal */}
      {saveModal && (
        <div className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center p-4 bg-ql-charcoal/40">
          <div className="w-full max-w-md bg-white border border-ql-sand/20">
            <div className="flex items-center justify-between px-5 py-4 border-b border-ql-sand/20">
              <div className="flex items-center gap-2">
                <BookmarkPlus className="h-4 w-4 text-ql-muted" />
                <h3 className="text-sm font-medium text-ql-charcoal">Guardar en Proyecto</h3>
              </div>
              <button
                onClick={() => setSaveModal(null)}
                className="text-ql-muted hover:text-ql-slate transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-ql-cream border border-ql-sand/20 px-3 py-2 text-xs text-ql-muted line-clamp-3">
                {saveModal.content}
              </div>
              <div>
                <label className="ql-label block mb-1">Título (opcional)</label>
                <input
                  type="text"
                  value={saveTitle}
                  onChange={(e) => setSaveTitle(e.target.value)}
                  placeholder="Análisis del War Room"
                  className="ql-input w-full text-sm"
                />
              </div>
              {projectId ? (
                <p className="ql-caption normal-case tracking-normal">
                  Se guardará en <strong>{projectTitle}</strong>.
                </p>
              ) : (
                <p className="ql-caption normal-case tracking-normal text-ql-warning">
                  Sin proyecto — se guardará en biblioteca general.
                </p>
              )}
              <div>
                <p className="ql-label mb-2">¿Cómo guardarlo?</p>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    Object.entries(SAVE_CONFIG) as [
                      SaveType,
                      (typeof SAVE_CONFIG)[SaveType]
                    ][]
                  ).map(([type, cfg]) => {
                    const Icon = cfg.icon;
                    const done = savedType === type;
                    return (
                      <button
                        key={type}
                        onClick={() => handleSave(type)}
                        disabled={saving}
                        className="flex flex-col items-center gap-1.5 border border-ql-sand/30 px-3 py-3 text-xs font-medium text-ql-slate hover:bg-ql-cream transition-colors disabled:opacity-50"
                      >
                        {done ? (
                          <Check className="h-4 w-4 text-ql-success" />
                        ) : (
                          <Icon className="h-4 w-4" />
                        )}
                        {done ? "¡Guardado!" : cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
