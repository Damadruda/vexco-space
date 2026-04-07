"use client";

import { useState, KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, Inbox, FolderKanban, MessageSquare, ArrowRight } from "lucide-react";

type Action = "project" | "inbox" | "ask";

interface ActionConfig {
  id: Action;
  label: string;
  icon: typeof Plus;
  hint: string;
  handler: (text: string, router: ReturnType<typeof useRouter>) => void;
}

const ACTIONS: ActionConfig[] = [
  {
    id: "project",
    label: "Nuevo proyecto",
    icon: FolderKanban,
    hint: "Crear un nuevo proyecto con este título",
    handler: (text, router) => {
      router.push(`/project-builder/new?title=${encodeURIComponent(text)}`);
    },
  },
  {
    id: "inbox",
    label: "Capturar en Inbox",
    icon: Inbox,
    hint: "Guardar como item del Inbox para procesar después",
    handler: async (text, router) => {
      await fetch("/api/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawContent: text, type: "text", sourceTitle: text.slice(0, 100) }),
      });
      router.push("/inbox");
    },
  },
  {
    id: "ask",
    label: "Preguntar al Strategist",
    icon: MessageSquare,
    hint: "Iniciar consulta directa con el agente Strategist",
    handler: (text, router) => {
      router.push(`/project-builder?q=${encodeURIComponent(text)}`);
    },
  },
];

export function CommandBar() {
  const [text, setText] = useState("");
  const [showActions, setShowActions] = useState(false);
  const router = useRouter();

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setText("");
      setShowActions(false);
    }
  };

  const handleAction = (action: ActionConfig) => {
    if (!text.trim()) return;
    action.handler(text, router);
    setText("");
    setShowActions(false);
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-3 rounded-xl border border-[#E8E4DE] bg-white px-5 py-4 transition-all focus-within:border-[#C5A572] focus-within:shadow-sm">
        <Plus className="h-4 w-4 text-[#5E5E5E]/60" />
        <input
          type="text"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setShowActions(e.target.value.length > 0);
          }}
          onFocus={() => text.length > 0 && setShowActions(true)}
          onKeyDown={handleKeyDown}
          placeholder="Captura una idea, crea un proyecto, pregunta al Strategist..."
          className="flex-1 bg-transparent text-sm text-[#1A1A1A] placeholder:text-[#5E5E5E]/50 focus:outline-none"
        />
        {text.length === 0 && (
          <span className="text-[10px] text-[#5E5E5E]/40 font-mono">⌘K</span>
        )}
      </div>

      {showActions && text.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-2 z-10 rounded-xl border border-[#E8E4DE] bg-white shadow-lg overflow-hidden">
          {ACTIONS.map((action) => (
            <button
              key={action.id}
              onClick={() => handleAction(action)}
              className="w-full flex items-center gap-3 px-5 py-3 hover:bg-[#FBF8F3] transition-colors text-left group"
            >
              <action.icon className="h-4 w-4 text-[#5E5E5E] group-hover:text-[#C5A572]" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[#1A1A1A] font-medium">{action.label}</p>
                <p className="text-xs text-[#5E5E5E]/70 truncate">{action.hint}</p>
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-[#C5A572]/40 group-hover:text-[#C5A572]" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
