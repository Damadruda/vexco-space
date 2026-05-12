"use client";

import { useState, useMemo } from "react";
import { X, RefreshCw } from "lucide-react";

interface DriveDoc {
  id: string;
  driveFileId: string;
  fileName: string;
  fileType: string;
  category: string | null;
  corpusStatus: "not_promoted" | "pending_review" | "reviewed" | "archived";
}

interface Props {
  projectId: string;
  driveDocs: DriveDoc[];
  onClose: () => void;
  onComplete: () => void;
}

interface RowState {
  unlink: boolean;
  promote: boolean;
}

const VEXCO_RE = /vex.?&?co/i;

export function ReimportDriveModal({ projectId, driveDocs, onClose, onComplete }: Props) {
  const [rows, setRows] = useState<Record<string, RowState>>(() => {
    const init: Record<string, RowState> = {};
    for (const d of driveDocs) {
      const isVexco = VEXCO_RE.test(d.fileName);
      init[d.driveFileId] = { unlink: isVexco, promote: false };
    }
    return init;
  });
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<null | { success: boolean; stats?: unknown; error?: string }>(null);

  const counts = useMemo(() => {
    let unlink = 0, promote = 0;
    for (const r of Object.values(rows)) {
      if (r.unlink) unlink++;
      if (r.promote) promote++;
    }
    return { unlink, promote, reprocess: driveDocs.length - unlink };
  }, [rows, driveDocs.length]);

  const toggle = (driveFileId: string, key: "unlink" | "promote") => {
    setRows((prev) => {
      const current = prev[driveFileId];
      const next = { ...current, [key]: !current[key] };
      // promote sólo es válido si unlink también está marcado
      if (key === "unlink" && !next.unlink) next.promote = false;
      if (key === "promote" && next.promote) next.unlink = true;
      return { ...prev, [driveFileId]: next };
    });
  };

  const run = async () => {
    setRunning(true);
    setResult(null);
    try {
      const unlinkDriveFileIds = Object.entries(rows)
        .filter(([, r]) => r.unlink)
        .map(([id]) => id);
      const promoteToCorpusDriveFileIds = Object.entries(rows)
        .filter(([, r]) => r.promote)
        .map(([id]) => id);

      const res = await fetch(`/api/projects/${projectId}/reimport-drive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unlinkDriveFileIds, promoteToCorpusDriveFileIds }),
      });
      const data = await res.json();
      setResult(data);
      if (data.success) {
        setTimeout(() => {
          onComplete();
          onClose();
        }, 2500);
      }
    } catch (err) {
      setResult({ success: false, error: err instanceof Error ? err.message : String(err) });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-[#1A1A1A]/40">
      <div className="w-full max-w-3xl bg-white border border-[#E8E4DE] rounded-lg shadow-xl flex flex-col max-h-[90vh]">
        <div className="px-5 py-4 border-b border-[#E8E4DE] flex items-center justify-between">
          <div>
            <h3 className="text-base font-medium text-[#1A1A1A]">Re-procesar import de Drive</h3>
            <p className="text-xs text-[#5E5E5E] mt-1">
              Re-corre el flow de Convergencia v2 sobre todos los archivos. Opcionalmente desvinculá o promové al Firm Corpus archivos individuales antes del re-procesamiento.
            </p>
          </div>
          <button onClick={onClose} className="text-[#5E5E5E] hover:text-[#1A1A1A]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-3 bg-[#FBF8F3]/40 border-b border-[#E8E4DE] text-xs text-[#5E5E5E]">
          <span className="font-medium text-[#1A1A1A]">{counts.reprocess}</span> a re-procesar
          {" · "}
          <span className="font-medium text-[#1A1A1A]">{counts.unlink}</span> a desvincular
          {" · "}
          <span className="font-medium text-[#B8860B]">{counts.promote}</span> a promover al Firm Corpus
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-2">
          {driveDocs.map((d) => {
            const r = rows[d.driveFileId];
            const isVexco = VEXCO_RE.test(d.fileName);
            return (
              <div
                key={d.id}
                className={`border rounded p-3 ${r.unlink ? "border-[#C5A572] bg-[#FBF8F3]/50" : "border-[#E8E4DE] bg-white"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#1A1A1A] truncate">{d.fileName}</p>
                    <p className="text-xs text-[#5E5E5E] mt-0.5">
                      {d.fileType}
                      {d.category ? ` · ${d.category}` : ""}
                      {d.corpusStatus !== "not_promoted" ? ` · ya en corpus (${d.corpusStatus})` : ""}
                      {isVexco ? " · sugerido VEXCO_OPERATING" : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={r.unlink}
                        onChange={() => toggle(d.driveFileId, "unlink")}
                        className="w-3.5 h-3.5"
                      />
                      <span className="text-[#1A1A1A]">desvincular</span>
                    </label>
                    <label className={`flex items-center gap-1.5 text-xs ${r.unlink ? "cursor-pointer" : "cursor-not-allowed opacity-40"}`}>
                      <input
                        type="checkbox"
                        checked={r.promote}
                        disabled={!r.unlink || d.corpusStatus !== "not_promoted"}
                        onChange={() => toggle(d.driveFileId, "promote")}
                        className="w-3.5 h-3.5"
                      />
                      <span className="text-[#B8860B]">promover al Firm Corpus</span>
                    </label>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {result && (
          <div className={`mx-5 mb-3 p-3 rounded text-xs ${result.success ? "bg-green-50 border border-green-200 text-green-800" : "bg-red-50 border border-red-200 text-red-800"}`}>
            <pre className="whitespace-pre-wrap break-all">{JSON.stringify(result, null, 2)}</pre>
          </div>
        )}

        <div className="px-5 py-4 border-t border-[#E8E4DE] flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            disabled={running}
            className="text-xs px-4 py-2 text-[#5E5E5E] hover:text-[#1A1A1A]"
          >
            Cancelar
          </button>
          <button
            onClick={run}
            disabled={running}
            className="text-xs font-medium px-4 py-2 bg-[#1A1A1A] text-white rounded hover:bg-[#000] disabled:opacity-50 flex items-center gap-2"
          >
            {running ? (<><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Re-procesando…</>) : ("Re-procesar")}
          </button>
        </div>
      </div>
    </div>
  );
}
