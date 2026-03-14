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
      <div className="px-4 py-4 border-b border-gray-100">
        <p className="text-xs font-medium tracking-[0.12em] uppercase text-gray-400">Panel de Expertos</p>
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
                w-full flex items-center gap-3 px-4 py-3 text-left transition-colors
                ${isActive
                  ? "bg-gray-100"
                  : "hover:bg-gray-50"
                }
              `}
            >
              <ExpertAvatar expert={expert} size="md" showRing={isActive} />

              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold leading-tight truncate ${isActive ? "text-gray-900" : "text-gray-800"}`}>
                  {expert.name}
                </p>
                <p className="text-xs text-gray-400 leading-snug truncate mt-0.5">
                  {expert.role}
                </p>
              </div>

              {/* Status dot */}
              <div className={`shrink-0 h-2 w-2 rounded-full ${isOnline ? "bg-emerald-400" : "bg-gray-300"}`} />
            </button>
          );
        })}
      </div>

      <div className="px-4 py-3 border-t border-gray-100">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-emerald-400" />
          <span className="text-xs text-gray-400">8 agentes en línea</span>
        </div>
      </div>
    </div>
  );
}
