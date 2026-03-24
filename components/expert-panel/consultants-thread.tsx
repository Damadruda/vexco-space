"use client";

import { useState, useRef, useEffect } from "react";
import { Send, BookmarkPlus, X, Lightbulb, FileText, CheckSquare, Check, Zap } from "lucide-react";
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
            return {
              id: m.id,
              expertId: m.agentId ?? activeExpert.id,
              content: m.content,
              loading: false,
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

  // ── Core: call individual agent via /api/agents/chat ──────────────────────
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
      const data = await res.json();
      const content: string = data.response ?? "Sin respuesta.";
      const assignedAgents: AssignedAgent[] = data.assignedAgents ?? [];

      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId && "expertId" in m
            ? { ...m, content, loading: false, assignedAgents }
            : m
        )
      );

      // 4C: Persist agent response
      persistMessage("assistant", content, expert.id, expert.name);
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId && "expertId" in m
            ? { ...m, content: "Error al obtener respuesta. Intenta de nuevo.", loading: false }
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

  // ── Send message → active expert ──────────────────────────────────────────
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

    const expert = activeExpert ?? EXPERTS[0];
    const msgId = addExpertPlaceholder(expert);
    await callAgent(expert, prompt, msgId);
    setIsLoading(false);
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
                    {activeExpert.name} analizando…
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
                  </div>
                  <div className="bg-white border border-ql-sand/20 rounded-lg rounded-tl-sm px-4 py-3">
                    {dm.loading ? (
                      <div className="flex items-center gap-2">
                        <span className="ql-status-thinking" />
                        <span className="ql-loading">Analizando…</span>
                      </div>
                    ) : (
                      <div className="prose prose-sm prose-neutral max-w-none text-ql-slate
                        prose-headings:font-medium prose-headings:text-ql-charcoal prose-headings:text-sm prose-headings:mt-4 prose-headings:mb-1
                        prose-p:leading-relaxed prose-p:my-1
                        prose-li:my-0.5 prose-ul:my-1 prose-strong:text-ql-charcoal
                        prose-hr:border-ql-sand/30">
                        <ReactMarkdown>{dm.content}</ReactMarkdown>
                      </div>
                    )}
                  </div>

                  {/* ── Assigned agents panel (strategist only) ─────────── */}
                  {!dm.loading && dm.assignedAgents && dm.assignedAgents.length > 0 && (
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

                  {!dm.loading && dm.content && hoveredId === dm.id && (
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
                  ? `${activeExpert.name} analizando…`
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
            Análisis con Supervisor →{" "}
            <span className="font-medium text-ql-slate">Estrategia</span>. Debate completo →{" "}
            <span className="font-medium text-ql-slate">Debate</span>.
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
