"use client";

import { useState, useEffect } from "react";
import { Users } from "lucide-react";

interface ProspectOption {
  id: string;
  name: string;
  company: string | null;
}

export function ProspectLinker({ projectId }: { projectId: string }) {
  const [options, setOptions] = useState<ProspectOption[]>([]);
  const [currentProspectId, setCurrentProspectId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/prospect`)
      .then((r) => r.json())
      .then((d) => setCurrentProspectId(d.prospectId ?? null))
      .catch(() => {});
    fetch(`/api/prospects`)
      .then((r) => r.json())
      .then((d) => setOptions(d.prospects ?? []))
      .catch(() => {});
  }, [projectId]);

  const handleChange = async (value: string) => {
    const next = value || null;
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/prospect`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospectId: next }),
      });
      if (res.ok) {
        setCurrentProspectId(next);
      }
    } catch {
      // noop
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="inline-flex items-center gap-2">
      <Users className="h-3.5 w-3.5 text-[#5E5E5E]" />
      <span className="ql-label">Cliente</span>
      <select
        value={currentProspectId ?? ""}
        onChange={(e) => handleChange(e.target.value)}
        disabled={saving}
        className="bg-transparent border border-[#E8E4DE] rounded px-2 py-1 text-xs text-[#1A1A1A] outline-none focus:border-[#C5A572] disabled:opacity-50"
      >
        <option value="">— Sin cliente —</option>
        {options.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {p.company ? ` · ${p.company}` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
