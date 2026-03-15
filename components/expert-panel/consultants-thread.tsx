"use client";

import { useState, useRef, useEffect } from "react";
import {
  Send, Loader2, Play, BookmarkPlus, X,
  Lightbulb, FileText, CheckSquare, Check, ArrowRight,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { EXPERTS, Expert } from "./experts-data";
import { ExpertAvatar } from "./expert-avatar";

// ─── Types ───────────────────────────────────────────────────────────────────

interface DebateMessage {
  id: string;
  expertId: string;
  content: string;
  streaming: boolean;
  phase?: "A" | "B" | "C";
}

interface UserMessage {
  id: string;
  role: "user";
  content: string;
}

interface CheckpointMessage {
  id: string;
  role: "checkpoint";
  label: string;
  hint: string;
}

type ThreadMessage = DebateMessage | UserMessage | CheckpointMessage;
type SaveType = "idea" | "nota" | "tarea";
type DebatePhase = "idle" | "running" | "checkpoint-AB" | "checkpoint-BC" | "complete";

interface SaveModal { content: string }

interface ConsultantsThreadProps {
  activeExpert: Expert;
  projectId?: string;
  projectTitle?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DIRECTOR = EXPERTS.find((e) => e.id === "innovation")!;

const PHASE_LABELS: Record<string, string> = {
  A: "Fase A · Debate",
  B: "Fase B · Perspectiva",
  C: "Fase C · Stress-Test",
};

const SAVE_CONFIG: Record<SaveType, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  idea: { label: "Idea", icon: Lightbulb, color: "text-amber-700", bg: "bg-amber-50 border-amber-300 hover:bg-amber-100" },
  nota: { label: "Nota", icon: FileText, color: "text-blue-700", bg: "bg-blue-50 border-blue-300 hover:bg-blue-100" },
  tarea: { label: "Tarea", icon: CheckSquare, color: "text-green-700", bg: "bg-green-50 border-green-300 hover:bg-green-100" },
};

// ─── Helper ──────────────────────────────────────────────────────────────────

function buildProjectContext(projectId?: string, projectTitle?: string): string {
  if (!projectId || !projectTitle || projectTitle === "Sin proyecto activo") {
    return "No hay un proyecto activo seleccionado. NO inventes ni menciones ningún proyecto específico. Responde en términos generales sobre lo que se te pregunte.";
  }
  return `Proyecto activo: "${projectTitle}" (ID: ${projectId}). Todas tus respuestas deben estar contextualizadas a este proyecto.`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ConsultantsThread({
  activeExpert,
  projectId,
  projectTitle = "Sin proyecto activo",
}: ConsultantsThreadProps) {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [input, setInput] = useState("");
  const [supervisorInput, setSupervisorInput] = useState("");
  const [debatePhase, setDebatePhase] = useState<DebatePhase>("idle");
  const [runningLabel, setRunningLabel] = useState("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [saveModal, setSaveModal] = useState<SaveModal | null>(null);
  const [saveTitle, setSaveTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedType, setSavedType] = useState<SaveType | null>(null);

  const threadEndRef = useRef<HTMLDivElement>(null);
  const supervisorResolveRef = useRef<((guidance: string) => void) | null>(null);
  const supervisorInputRef = useRef<HTMLInputElement>(null);

  const isRunning = debatePhase === "running";
  const isCheckpoint = debatePhase === "checkpoint-AB" || debatePhase === "checkpoint-BC";
  const isDebating = debatePhase !== "idle" && debatePhase !== "complete";

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus the supervisor input when a checkpoint appears
  useEffect(() => {
    if (isCheckpoint) {
      setTimeout(() => supervisorInputRef.current?.focus(), 80);
    }
  }, [isCheckpoint]);

  // ── Core: stream one expert response ──────────────────────────────────────
  const streamExpert = async (
    expert: Expert,
    prompt: string,
    msgId: string,
    phase?: "A" | "B" | "C"
  ): Promise<string> => {
    const projectContext = buildProjectContext(projectId, projectTitle);
    const fullContext = `${expert.persona}\n\n[CONTEXTO DE PROYECTO]\n${projectContext}`;

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt, context: fullContext }),
      });
      if (!res.ok) throw new Error("API error");

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let full = "";

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value).split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") continue;
          try {
            const text = JSON.parse(data).choices?.[0]?.delta?.content ?? "";
            full += text;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === msgId && "expertId" in m
                  ? { ...m, content: full, streaming: true }
                  : m
              )
            );
          } catch {}
        }
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId && "expertId" in m
            ? { ...m, content: full, streaming: false }
            : m
        )
      );
      return full;
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId && "expertId" in m
            ? { ...m, content: "Error al obtener respuesta.", streaming: false }
            : m
        )
      );
      return "";
    }
  };

  const addExpertPlaceholder = (expert: Expert, phase?: "A" | "B" | "C"): string => {
    const msgId = `${expert.id}-${Date.now()}-${Math.random()}`;
    setMessages((prev) => [
      ...prev,
      { id: msgId, expertId: expert.id, content: "", streaming: true, phase },
    ]);
    return msgId;
  };

  const addCheckpointMessage = (label: string, hint: string) => {
    const id = `checkpoint-${Date.now()}`;
    setMessages((prev) => [...prev, { id, role: "checkpoint", label, hint }]);
  };

  // ── Supervisor: wait for human input between phases ───────────────────────
  const waitForSupervisor = (): Promise<string> =>
    new Promise((resolve) => { supervisorResolveRef.current = resolve; });

  const handleSupervisorContinue = () => {
    if (!supervisorResolveRef.current) return;
    const guidance = supervisorInput.trim();
    if (guidance) {
      setMessages((prev) => [
        ...prev,
        { id: `supervisor-${Date.now()}`, role: "user", content: `[Supervisor] ${guidance}` },
      ]);
    }
    supervisorResolveRef.current(guidance);
    supervisorResolveRef.current = null;
    setSupervisorInput("");
  };

  // ── MODE 1: Individual ────────────────────────────────────────────────────
  const runIndividual = async (prompt: string) => {
    setDebatePhase("running");
    setRunningLabel(`${activeExpert.name} analizando…`);
    const msgId = addExpertPlaceholder(activeExpert);
    await streamExpert(activeExpert, prompt, msgId);
    setDebatePhase("idle");
    setRunningLabel("");
  };

  // ── MODE 2: Director ──────────────────────────────────────────────────────
  const runDirector = async (prompt: string) => {
    setDebatePhase("running");
    setRunningLabel("Director en línea…");

    const directorPrompt = `El usuario ha enviado este mensaje abierto al War Room: "${prompt}".
Como Innovation Architect y director del panel, responde brevemente dando la bienvenida y preguntando qué área quieren trabajar hoy.
Menciona que el panel incluye expertos en estrategia, revenue, internacionalización, tecnología, flujos, narrativa y stress-test.
Sugiere 2-3 ángulos concretos según el proyecto activo.`;

    const msgId = addExpertPlaceholder(DIRECTOR);
    await streamExpert(DIRECTOR, directorPrompt, msgId);
    setDebatePhase("idle");
    setRunningLabel("");
  };

  // ── MODE 3: Full Debate — Sinfonía Asíncrona ──────────────────────────────
  // Sequential. Pauses at each phase boundary for human validation.
  const runFullDebate = async (prompt: string) => {
    setDebatePhase("running");

    // ── Phase A ────────────────────────────────────────────────────────────
    for (const expert of EXPERTS.slice(0, 5)) {
      setRunningLabel(`${expert.name} · Fase A`);
      const msgId = addExpertPlaceholder(expert, "A");
      await streamExpert(expert, prompt, msgId, "A");
    }

    // ── Checkpoint A→B ─────────────────────────────────────────────────────
    addCheckpointMessage(
      "Fase A completada",
      "5 expertos han analizado el reto. ¿Quieres guiar al Supervisor antes de la Fase B?"
    );
    setDebatePhase("checkpoint-AB");
    setRunningLabel("");
    const guidanceAB = await waitForSupervisor();

    // ── Phase B ────────────────────────────────────────────────────────────
    setDebatePhase("running");
    const promptB = guidanceAB
      ? `${prompt}\n\n[DIRECTRIZ DEL SUPERVISOR]: ${guidanceAB}`
      : prompt;

    for (const expert of [EXPERTS[5], EXPERTS[6]]) {
      setRunningLabel(`${expert.name} · Fase B`);
      const msgId = addExpertPlaceholder(expert, "B");
      await streamExpert(expert, promptB, msgId, "B");
    }

    // ── Checkpoint B→C ─────────────────────────────────────────────────────
    addCheckpointMessage(
      "Fase B completada",
      "El panel ha concluido. ¿Algún foco específico para el Stress-Test?"
    );
    setDebatePhase("checkpoint-BC");
    setRunningLabel("");
    const guidanceBC = await waitForSupervisor();

    // ── Phase C ────────────────────────────────────────────────────────────
    setDebatePhase("running");
    const redTeam = EXPERTS[7];
    setRunningLabel(`${redTeam.name} · Stress-Test final`);
    const promptC = guidanceBC
      ? `Tema central: "${prompt}".\n[DIRECTRIZ DEL SUPERVISOR]: ${guidanceBC}\nRealiza el Stress-Test final: los 3 fallos más críticos con workaround concreto para cada uno. Sé quirúrgico.`
      : `Has revisado los análisis del panel sobre: "${prompt}". Realiza tu Stress-Test final: lista los 3 fallos más críticos e inmediatamente propón un workaround concreto para cada uno. Sé breve y quirúrgico.`;
    const msgId = addExpertPlaceholder(redTeam, "C");
    await streamExpert(redTeam, promptC, msgId, "C");

    setDebatePhase("complete");
    setRunningLabel("");
  };

  // ── Route incoming messages ───────────────────────────────────────────────
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();

    // If we're at a checkpoint, submit supervisor guidance instead
    if (isCheckpoint) {
      handleSupervisorContinue();
      return;
    }

    const prompt = input.trim();
    if (!prompt || isRunning) return;

    setInput("");
    setMessages((prev) => [...prev, { id: `user-${Date.now()}`, role: "user", content: prompt }]);

    const isAmbiguous =
      prompt.split(" ").length <= 4 &&
      /^(hola|hi|buenos|buenas|hey|qué|que|cómo|como|ayuda|help)/i.test(prompt);

    if (isAmbiguous) {
      await runDirector(prompt);
    } else {
      await runIndividual(prompt);
    }
  };

  const handleInitAnalysis = async () => {
    if (isDebating) return;
    const prompt =
      input.trim() ||
      "Analiza el estado del proyecto activo desde tu área de expertise y dame tus 3 recomendaciones más urgentes.";
    setInput("");
    setMessages((prev) => [...prev, { id: `user-${Date.now()}`, role: "user", content: prompt }]);
    await runFullDebate(prompt);
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
          title: saveTitle.trim() || "Debate del War Room",
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

  const checkpointLabel = debatePhase === "checkpoint-AB"
    ? "Fase A completada · ¿Guías al Supervisor antes de Fase B?"
    : "Fase B completada · ¿Foco específico para el Stress-Test?";

  return (
    <>
      <div className="flex flex-col h-full bg-white">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-serif text-lg text-gray-900 leading-tight">{projectTitle}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              {isRunning ? (
                <>
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                  <span className="text-xs text-gray-400 italic">{runningLabel}</span>
                </>
              ) : isCheckpoint ? (
                <>
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-400" />
                  <span className="text-xs text-blue-400">Esperando Supervisor</span>
                </>
              ) : (
                <>
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  <span className="text-xs text-gray-400">8 agentes en línea</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-400">
              <ExpertAvatar expert={activeExpert} size="sm" />
              {activeExpert.name}
            </span>

            <button
              onClick={handleInitAnalysis}
              disabled={isDebating}
              className="inline-flex items-center gap-2 bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {isRunning
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Play className="h-4 w-4" />
              }
              {isRunning ? "Debatiendo…" : "Iniciar Análisis"}
            </button>
          </div>
        </div>

        {/* Thread */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center py-16">
              <div className="flex -space-x-2 mb-6">
                {EXPERTS.slice(0, 5).map((e) => (
                  <ExpertAvatar key={e.id} expert={e} size="lg" showRing />
                ))}
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 ring-2 ring-white text-xs font-semibold text-gray-400">
                  +3
                </div>
              </div>
              <h3 className="font-serif text-xl text-gray-900 mb-2">
                {activeExpert.name} en línea
              </h3>
              <p className="text-sm text-gray-400 max-w-sm">
                Escríbele directamente a <strong>{activeExpert.name}</strong> o pulsa{" "}
                <strong>Iniciar Análisis</strong> para el debate secuencial de los 8 expertos.
              </p>
              {!projectId && (
                <p className="mt-3 text-xs text-amber-500 max-w-xs">
                  Selecciona un proyecto para que los expertos tengan contexto.
                </p>
              )}
            </div>
          )}

          {messages.map((msg) => {
            // ── Checkpoint separator ──────────────────────────────────────
            if ("role" in msg && msg.role === "checkpoint") {
              const cp = msg as CheckpointMessage;
              return (
                <div key={cp.id} className="flex items-center gap-3 py-2">
                  <div className="flex-1 h-px bg-gray-100" />
                  <div className="text-center">
                    <p className="text-xs font-semibold tracking-widest uppercase text-gray-300">
                      {cp.label}
                    </p>
                    <p className="text-xs text-gray-300 mt-0.5">{cp.hint}</p>
                  </div>
                  <div className="flex-1 h-px bg-gray-100" />
                </div>
              );
            }

            // ── User message ──────────────────────────────────────────────
            if ("role" in msg && msg.role === "user") {
              const isSupervisor = msg.content.startsWith("[Supervisor]");
              return (
                <div key={msg.id} className="flex justify-end">
                  <div className={`max-w-[70%] px-4 py-3 rounded-2xl rounded-tr-sm ${
                    isSupervisor
                      ? "bg-blue-50 border border-blue-100 text-blue-800"
                      : "bg-gray-900 text-white"
                  }`}>
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  </div>
                </div>
              );
            }

            // ── Expert message ────────────────────────────────────────────
            const dm = msg as DebateMessage;
            const expert = EXPERTS.find((e) => e.id === dm.expertId);
            if (!expert) return null;
            const isEmpty = dm.streaming && !dm.content;

            return (
              <div
                key={dm.id}
                className="flex gap-3"
                onMouseEnter={() => !dm.streaming && setHoveredId(dm.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <ExpertAvatar expert={expert} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`text-sm font-semibold ${expert.textColor}`}>{expert.name}</span>
                    {dm.phase && (
                      <span className="text-xs text-gray-300">{PHASE_LABELS[dm.phase]}</span>
                    )}
                  </div>
                  <div className="bg-gray-50 rounded-2xl rounded-tl-sm px-4 py-3">
                    {isEmpty ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-300" />
                        <span className="text-sm text-gray-300">Analizando…</span>
                      </div>
                    ) : (
                      <div className="prose prose-sm max-w-none
                        prose-headings:font-serif prose-headings:font-semibold prose-headings:text-gray-900 prose-headings:mb-1 prose-headings:mt-3
                        prose-h1:text-base prose-h2:text-sm prose-h3:text-xs prose-h3:uppercase prose-h3:tracking-widest prose-h3:text-gray-400
                        prose-p:text-gray-800 prose-p:leading-relaxed prose-p:my-1.5 prose-p:text-sm
                        prose-strong:text-gray-900 prose-strong:font-semibold
                        prose-li:text-gray-800 prose-li:text-sm prose-li:my-0.5
                        prose-ul:my-2 prose-ol:my-2 prose-ul:pl-4 prose-ol:pl-4
                        prose-blockquote:border-gray-300 prose-blockquote:text-gray-500 prose-blockquote:text-sm
                        prose-hr:border-gray-200 prose-hr:my-3
                        first:prose-p:mt-0 last:prose-p:mb-0
                      ">
                        <ReactMarkdown>{dm.content}</ReactMarkdown>
                        {dm.streaming && (
                          <span className="inline-block w-1.5 h-[0.9em] bg-gray-400 animate-pulse ml-1 align-middle rounded-sm" />
                        )}
                      </div>
                    )}
                  </div>
                  {!dm.streaming && dm.content && hoveredId === dm.id && (
                    <button
                      onClick={() => { setSaveModal({ content: dm.content }); setSaveTitle(""); setSavedType(null); }}
                      className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
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

        {/* ── Bottom input — adapts to debate state ── */}
        {isCheckpoint ? (
          // Supervisor checkpoint input
          <div className="border-t border-blue-100 bg-blue-50/40 px-6 py-4">
            <p className="text-xs font-medium tracking-[0.1em] uppercase text-blue-400 mb-2">
              Supervisor · Human-in-the-loop
            </p>
            <form
              onSubmit={(e) => { e.preventDefault(); handleSupervisorContinue(); }}
              className="flex gap-3"
            >
              <input
                ref={supervisorInputRef}
                type="text"
                value={supervisorInput}
                onChange={(e) => setSupervisorInput(e.target.value)}
                placeholder={checkpointLabel}
                className="flex-1 rounded-xl border border-blue-200 bg-white px-4 py-2.5 text-sm placeholder:text-blue-300 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-100"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              >
                <ArrowRight className="h-4 w-4" />
                Continuar
              </button>
            </form>
            <p className="mt-2 text-xs text-blue-300">
              Deja vacío para continuar sin guía adicional.
            </p>
          </div>
        ) : (
          // Normal chat input
          <form onSubmit={handleSend} className="border-t border-gray-100 px-6 py-4">
            <div className="flex gap-3">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  isRunning
                    ? "Agentes debatiendo…"
                    : `Pregúntale a ${activeExpert.name}… (o pulsa Iniciar Análisis para el panel completo)`
                }
                disabled={isRunning}
                className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm placeholder:text-gray-300 focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
              />
              <button
                type="submit"
                disabled={(!input.trim() && !isCheckpoint) || isRunning}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-900 text-white hover:bg-gray-800 disabled:bg-gray-200 disabled:cursor-not-allowed transition-colors"
              >
                {isRunning
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Send className="h-4 w-4" />
                }
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-300">
              Mensaje directo → solo responde{" "}
              <span className="font-medium text-gray-400">{activeExpert.name}</span>{" "}
              · "Iniciar Análisis" → debate secuencial con pausas de Supervisor
            </p>
          </form>
        )}
      </div>

      {/* Save Modal */}
      {saveModal && (
        <div className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center p-4 bg-black/40">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-gray-100">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <BookmarkPlus className="h-4 w-4 text-gray-500" />
                <h3 className="font-semibold text-gray-800 text-sm">Guardar en Proyecto</h3>
              </div>
              <button onClick={() => setSaveModal(null)} className="text-gray-300 hover:text-gray-500">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="rounded-xl bg-gray-50 border border-gray-100 px-3 py-2 text-xs text-gray-400 line-clamp-3">
                {saveModal.content}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Título (opcional)</label>
                <input
                  type="text"
                  value={saveTitle}
                  onChange={(e) => setSaveTitle(e.target.value)}
                  placeholder="Debate del War Room"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none"
                />
              </div>
              {projectId
                ? <p className="text-xs text-gray-300">Se guardará en <strong>{projectTitle}</strong>.</p>
                : <p className="text-xs text-amber-500">Sin proyecto — se guardará en biblioteca general.</p>
              }
              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">¿Cómo guardarlo?</p>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.entries(SAVE_CONFIG) as [SaveType, typeof SAVE_CONFIG[SaveType]][]).map(([type, cfg]) => {
                    const Icon = cfg.icon;
                    const done = savedType === type;
                    return (
                      <button key={type} onClick={() => handleSave(type)} disabled={saving}
                        className={`flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-xs font-medium transition-colors disabled:opacity-50 ${cfg.bg} ${cfg.color}`}
                      >
                        {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
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
