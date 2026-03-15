"use client";

import { Expert, EXPERTS } from "./experts-data";
import { ExpertAvatar } from "./expert-avatar";

interface ExpertListProps {
  activeExpertId?: string;
  onlineIds?: string[];
  onSelect: (expert: Expert) => void;
}

export function ExpertList({ activeExpertId, onlineIds = [], onSelect }: ExpertListProps) {
  const allOnline = onlineIds.length === 0;

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-4 border-b border-ql-sand/20">
        <p className="ql-label">Panel de Expertos</p>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {EXPERTS.map((expert) => {
          const isActive = activeExpertId === expert.id;
          const isOnline = allOnline || onlineIds.includes(expert.id);

          return (
            <button
              key={expert.id}
              onClick={() => onSelect(expert)}
              className={`
                w-full flex items-center gap-3 px-4 py-3 text-left transition-all duration-150
                ${isActive
                  ? "bg-ql-cream border-l-2 border-ql-accent pl-[14px]"
                  : "hover:bg-ql-offwhite"
                }
              `}
            >
              <ExpertAvatar expert={expert} size="md" showRing={isActive} />

              <div className="flex-1 min-w-0">
                <p className={`text-sm leading-tight truncate ${isActive ? "font-medium text-ql-charcoal" : "font-light text-ql-slate"}`}>
                  {expert.name}
                </p>
                <p className="ql-caption leading-snug truncate mt-0.5">
                  {expert.role}
                </p>
              </div>

              {/* Status dot */}
              <div
                className={`shrink-0 h-1.5 w-1.5 rounded-full ${
                  isOnline ? "bg-ql-success" : "bg-ql-muted"
                }`}
              />
            </button>
          );
        })}
      </div>

      <div className="px-4 py-3 border-t border-ql-sand/20">
        <div className="flex items-center gap-2">
          <span className="ql-status-active" />
          <span className="ql-caption">8 agentes en línea</span>
        </div>
      </div>
    </div>
  );
}
