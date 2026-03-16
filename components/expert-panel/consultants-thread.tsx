"use client";

import { useState, useRef, useEffect } from "react";
import {
  Send, Play, BookmarkPlus, X,
  Lightbulb, FileText, CheckSquare, Check, ArrowRight,
} from "lucide-react";
import { EXPERTS, Expert } from "./experts-data";
import { ExpertAvatar } from "./expert-avatar";

// ─── Types ───────────────────────────────────────────────────────────────────

interface DebateMessage {
  id: string;
  expertId: string;
  content: string;
  loading: boolean;
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

const PHASE_LABELS: Record<string, string> = {
  A: "Fase A · Debate",
  B: "Fase B · Perspectiva",
  C: "Fase C · Stress-Test",
};

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

  useEffect(() => {
    if (isCheckpoint) {
      setTimeout(() => supervisorInputRef.current?.focus(), 80);
    }
  }, [isCheckpoint]);

  // ── Core: call individual agent via /api/agents/chat ──────────────────────
  const callAgent = async (
    expert: Expert,
    prompt: string,
    msgId: string,
    phase?: "A" | "B" | "C"
  ): Promise<string> => {
    try {
      const res = await fetch("/api/agents/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: expert.id,
          message: prompt,
          ...(projectId ? { projectId } : {}),
        }),
      });

      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      const content: string = data.response ?? "Sin respuesta.";

      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId && "expertId" in m
            ? { ...m, content, loading: false }
            : m
        )
      );
      return content;
    } catch {
      const errText = "Error al obtener respuesta. Intenta de nuevo.";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId && "expertId" in m
            ? { ...m, content: errText, loading: false }
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
      { id: msgId, expertId: expert.id, content: "", loading: true, phase },
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
    const expert = activeExpert ?? EXPERTS[0];
    setDebatePhase("running");
    setRunningLabel(`${expert.name} analizando…`);
    const msgId = addExpertPlaceholder(expert);
    await callAgent(expert, prompt, msgId);
    setDebatePhase("idle");
    setRunningLabel("");
  };

  // ── MODE 2: Full Debate ────────────────────────────────────────────────────
  const runFullDebate = async (prompt: string) => {
    if (!projectId) return;
    setDebatePhase("running");

    // Phase A — experts 0..4
    for (const expert of EXPERTS.slice(0, 5)) {
      setRunningLabel(`${expert.name} · Fase A`);
      const msgId = addExpertPlaceholder(expert, "A");
      await callAgent(expert, prompt, msgId, "A");
    }

    // Checkpoint A→B
    addCheckpointMessage(
      "Fase A completada",
      "5 expertos han analizado el reto. ¿Quieres guiar al Supervisor antes de la Fase B?"
    );
    setDebatePhase("checkpoint-AB");
    setRunningLabel("");
    const guidanceAB = await waitForSupervisor();

    // Phase B — experts 5..6
    setDebatePhase("running");
    const promptB = guidanceAB
      ? `${prompt}\n\n[DIRECTRIZ DEL SUPERVISOR]: ${guidanceAB}`
      : prompt;

    for (const expert of [EXPERTS[5], EXPERTS[6]]) {
      setRunningLabel(`${expert.name} · Fase B`);
      const msgId = addExpertPlaceholder(expert, "B");
      await callAgent(expert, promptB, msgId, "B");
    }

    // Checkpoint B→C
    addCheckpointMessage(
      "Fase B completada",
      "El panel ha concluido. ¿Algún foco específico para el Stress-Test?"
    );
    setDebatePhase("checkpoint-BC");
    setRunningLabel("");
    const guidanceBC = await waitForSupervisor();

    // Phase C — redteam
    setDebatePhase("running");
    const redTeam = EXPERTS[7];
    setRunningLabel(`${redTeam.name} · Stress-Test final`);
    const promptC = guidanceBC
      ? `Main topic: "${prompt}".\n[SUPERVISOR DIRECTIVE]: ${guidanceBC}\nRun the final Stress-Test: the 3 most critical failures with a concrete workaround for each. Be surgical.`
      : `You have reviewed the panel analysis on: "${prompt}". Run your final Stress-Test: list the 3 most critical failures and immediately propose a concrete workaround for each. Be brief and surgical.`;
    const msgId = addExpertPlaceholder(redTeam, "C");
    await callAgent(redTeam, promptC, msgId, "C");

    setDebatePhase("complete");
    setRunningLabel("");
  };

  // ── Route incoming messages ───────────────────────────────────────────────
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isCheckpoint) {
      handleSupervisorContinue();
      return;
    }

    const prompt = input.trim();
    if (!prompt || isRunning) return;

    setInput("");
    setMessages((prev) => [...prev, { id: `user-${Date.now()}`, role: "user", content: prompt }]);

    await runIndividual(prompt);
  };

  const handleInitAnalysis = async () => {
    if (isDebating) return;
    if (!projectId) return;
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
        <div className="flex items-center justify-between px-6 py-4 border-b border-ql-sand/20">
          <div>
            <h2 className="ql-h3 leading-tight">{projectTitle}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              {isRunning ? (
                <>
                  <span className="ql-status-thinking" />
                  <span className="ql-caption normal-case tracking-normal italic">{runningLabel}</span>
                </>
              ) : isCheckpoint ? (
                <>
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-ql-accent" />
                  <span className="ql-caption normal-case tracking-normal">Esperando Supervisor</span>
                </>
              ) : (
                <>
                  <span className="ql-status-active" />
                  <span className="ql-caption">8 agentes en línea</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center gap-1.5 border border-ql-sand/30 px-3 py-1 text-xs text-ql-muted">
              <ExpertAvatar expert={activeExpert} size="sm" />
              {activeExpert.name}
            </span>

            <button
              onClick={handleInitAnalysis}
              disabled={isDebating || !projectId}
              title={!projectId ? "Selecciona un proyecto para iniciar el análisis" : undefined}
              className="ql-btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Play className="h-4 w-4" />
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
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-ql-cream ring-2 ring-white text-xs font-medium text-ql-muted">
                  +3
                </div>
              </div>
              <h3 className="ql-h3 mb-2">{activeExpert.name} en línea</h3>
              <p className="ql-body max-w-sm">
                Escríbele directamente a <strong>{activeExpert.name}</strong> o pulsa{" "}
                <strong>Iniciar Análisis</strong> para el debate secuencial de los 8 expertos.
              </p>
              {!projectId && (
                <p className="mt-3 ql-caption normal-case tracking-normal text-ql-warning max-w-xs">
                  Selecciona un proyecto para que los expertos tengan contexto y para activar el análisis completo.
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
                  <div className="flex-1 h-px bg-ql-sand/30" />
                  <div className="text-center">
                    <p className="ql-label">{cp.label}</p>
                    <p className="ql-caption normal-case tracking-normal mt-0.5">{cp.hint}</p>
                  </div>
                  <div className="flex-1 h-px bg-ql-sand/30" />
                </div>
              );
            }

            // ── User message ──────────────────────────────────────────────
            if ("role" in msg && msg.role === "user") {
              const isSupervisor = msg.content.startsWith("[Supervisor]");
              return (
                <div key={msg.id} className="flex justify-end">
                  <div className={`max-w-[70%] px-4 py-3 rounded-lg rounded-tr-sm ${
                    isSupervisor
                      ? "bg-ql-cream border border-ql-sand/30 text-ql-slate"
                      : "bg-ql-charcoal text-white"
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
                    {dm.phase && (
                      <span className="ql-caption">{PHASE_LABELS[dm.phase]}</span>
                    )}
                  </div>
                  <div className="bg-white border border-ql-sand/20 rounded-lg rounded-tl-sm px-4 py-3">
                    {dm.loading ? (
                      <div className="flex items-center gap-2">
                        <span className="ql-status-thinking" />
                        <span className="ql-loading">Analizando…</span>
                      </div>
                    ) : (
                      <p className="text-sm text-ql-slate leading-relaxed whitespace-pre-wrap">
                        {dm.content}
                      </p>
                    )}
                  </div>
                  {!dm.loading && dm.content && hoveredId === dm.id && (
                    <button
                      onClick={() => { setSaveModal({ content: dm.content }); setSaveTitle(""); setSavedType(null); }}
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

        {/* ── Bottom input — adapts to debate state ── */}
        {isCheckpoint ? (
          <div className="border-t border-ql-sand/20 bg-ql-cream/40 px-6 py-4">
            <p className="ql-label mb-2">Supervisor · Human-in-the-Loop</p>
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
                className="flex-1 ql-input text-sm"
              />
              <button
                type="submit"
                className="ql-btn-primary"
              >
                <ArrowRight className="h-4 w-4" />
                Continuar
              </button>
            </form>
            <p className="mt-2 ql-caption normal-case tracking-normal">
              Deja vacío para continuar sin guía adicional.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSend} className="border-t border-ql-sand/20 px-6 py-4">
            <div className="flex gap-3">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  isRunning
                    ? "Agentes debatiendo…"
                    : `Pregúntale a ${activeExpert.name}…`
                }
                disabled={isRunning}
                className="flex-1 ql-input text-sm disabled:opacity-40 disabled:cursor-not-allowed"
              />
              <button
                type="submit"
                disabled={(!input.trim() && !isCheckpoint) || isRunning}
                className="flex h-10 w-10 items-center justify-center bg-ql-charcoal text-white hover:bg-ql-slate disabled:bg-ql-cream disabled:cursor-not-allowed transition-colors"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2 ql-caption normal-case tracking-normal">
              Mensaje directo → responde{" "}
              <span className="font-medium text-ql-slate">{activeExpert.name}</span>
              {" "}· "Iniciar Análisis" → debate secuencial con pausas de Supervisor
              {!projectId && (
                <span className="text-ql-warning"> · Selecciona un proyecto para activar el análisis completo</span>
              )}
            </p>
          </form>
        )}
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
              <button onClick={() => setSaveModal(null)} className="text-ql-muted hover:text-ql-slate transition-colors">
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
                  placeholder="Debate del War Room"
                  className="ql-input w-full text-sm"
                />
              </div>
              {projectId
                ? <p className="ql-caption normal-case tracking-normal">Se guardará en <strong>{projectTitle}</strong>.</p>
                : <p className="ql-caption normal-case tracking-normal text-ql-warning">Sin proyecto — se guardará en biblioteca general.</p>
              }
              <div>
                <p className="ql-label mb-2">¿Cómo guardarlo?</p>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.entries(SAVE_CONFIG) as [SaveType, typeof SAVE_CONFIG[SaveType]][]).map(([type, cfg]) => {
                    const Icon = cfg.icon;
                    const done = savedType === type;
                    return (
                      <button key={type} onClick={() => handleSave(type)} disabled={saving}
                        className="flex flex-col items-center gap-1.5 border border-ql-sand/30 px-3 py-3 text-xs font-medium text-ql-slate hover:bg-ql-cream transition-colors disabled:opacity-50"
                      >
                        {done ? <Check className="h-4 w-4 text-ql-success" /> : <Icon className="h-4 w-4" />}
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
