"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, FileText, Download, Trash2, X, Loader2 } from "lucide-react";
import {
  PROJECT_FILE_MAX_SIZE,
  isAllowedFileType,
  formatFileSize,
  extensionBadge,
} from "@/lib/constants/upload";

interface ProjectFileUploaderProps {
  projectId: string;
}

interface RemoteFile {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: string;
  downloadUrl: string;
}

interface UploadingFile {
  tempId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  progress: number;
  status: "uploading" | "error";
  error?: string;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "ayer";
  if (days < 7) return `hace ${days}d`;
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

function uploadToS3(
  url: string,
  file: File,
  onProgress: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`S3 PUT failed: ${xhr.status}`));
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.send(file);
  });
}

export function ProjectFileUploader({ projectId }: ProjectFileUploaderProps) {
  const [files, setFiles] = useState<RemoteFile[]>([]);
  const [uploading, setUploading] = useState<UploadingFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/files`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { files: RemoteFile[] };
      setFiles(data.files);
    } catch (err) {
      console.error("[ProjectFileUploader] Error loading files:", err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleUpload = useCallback(
    async (file: File) => {
      const tempId = `${file.name}-${Date.now()}-${Math.random()}`;
      const mimeType = file.type || "application/octet-stream";

      if (!isAllowedFileType(mimeType, file.name)) {
        setUploading((prev) => [
          ...prev,
          {
            tempId,
            fileName: file.name,
            fileSize: file.size,
            mimeType,
            progress: 0,
            status: "error",
            error: "Tipo de archivo no permitido",
          },
        ]);
        return;
      }

      if (file.size <= 0 || file.size > PROJECT_FILE_MAX_SIZE) {
        setUploading((prev) => [
          ...prev,
          {
            tempId,
            fileName: file.name,
            fileSize: file.size,
            mimeType,
            progress: 0,
            status: "error",
            error: `Archivo supera el máximo de ${formatFileSize(PROJECT_FILE_MAX_SIZE)}`,
          },
        ]);
        return;
      }

      setUploading((prev) => [
        ...prev,
        {
          tempId,
          fileName: file.name,
          fileSize: file.size,
          mimeType,
          progress: 0,
          status: "uploading",
        },
      ]);

      try {
        const presignedRes = await fetch(
          `/api/projects/${projectId}/files/presigned`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fileName: file.name,
              fileSize: file.size,
              mimeType,
            }),
          }
        );
        if (!presignedRes.ok) {
          const err = await presignedRes.json().catch(() => ({}));
          throw new Error(err.error || `HTTP ${presignedRes.status}`);
        }
        const { uploadUrl, fileKey } = (await presignedRes.json()) as {
          uploadUrl: string;
          fileKey: string;
        };

        await uploadToS3(uploadUrl, file, (pct) => {
          setUploading((prev) =>
            prev.map((u) => (u.tempId === tempId ? { ...u, progress: pct } : u))
          );
        });

        const registerRes = await fetch(`/api/projects/${projectId}/files`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileKey,
            fileName: file.name,
            fileSize: file.size,
            mimeType,
          }),
        });
        if (!registerRes.ok) {
          const err = await registerRes.json().catch(() => ({}));
          throw new Error(err.error || `HTTP ${registerRes.status}`);
        }

        setUploading((prev) => prev.filter((u) => u.tempId !== tempId));
        await refresh();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setUploading((prev) =>
          prev.map((u) =>
            u.tempId === tempId ? { ...u, status: "error", error: message } : u
          )
        );
      }
    },
    [projectId, refresh]
  );

  const handleFileList = useCallback(
    (list: FileList | null) => {
      if (!list) return;
      Array.from(list).forEach((file) => handleUpload(file));
    },
    [handleUpload]
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      handleFileList(e.dataTransfer.files);
    },
    [handleFileList]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (!window.confirm("¿Eliminar este archivo? Esta acción no se puede deshacer.")) {
        return;
      }
      try {
        const res = await fetch(`/api/projects/${projectId}/files/${id}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await refresh();
      } catch (err) {
        alert(`Error al eliminar: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [projectId, refresh]
  );

  const dismissUploadError = (tempId: string) => {
    setUploading((prev) => prev.filter((u) => u.tempId !== tempId));
  };

  return (
    <div className="space-y-4">
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={`cursor-pointer rounded-lg border border-dashed transition-colors px-6 py-8 text-center ${
          isDragging
            ? "border-[#B8860B] bg-[#FBF8F3]"
            : "border-[#C5A572]/50 bg-[#FAFAF8] hover:bg-[#FBF8F3]/60"
        }`}
      >
        <Upload className="h-5 w-5 text-[#8B7355] mx-auto mb-2" />
        <p className="text-sm text-[#1A1A1A] font-medium">
          Arrastra archivos aquí o haz clic para seleccionar
        </p>
        <p className="text-xs text-[#5E5E5E] mt-1">
          PDF, DOCX, XLSX, PPTX, TXT, MD, HTML, CSV, JSON · máx. {formatFileSize(PROJECT_FILE_MAX_SIZE)}
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            handleFileList(e.target.files);
            if (inputRef.current) inputRef.current.value = "";
          }}
        />
      </div>

      {uploading.length > 0 && (
        <ul className="space-y-2">
          {uploading.map((u) => (
            <li
              key={u.tempId}
              className="flex items-center gap-3 px-3 py-2 border border-[#E8E4DE] rounded bg-white"
            >
              <FileText className="h-4 w-4 text-[#8B7355] shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-[#1A1A1A] truncate">{u.fileName}</span>
                  <span className="text-[10px] text-[#5E5E5E] shrink-0">
                    {formatFileSize(u.fileSize)}
                  </span>
                </div>
                {u.status === "uploading" && (
                  <div className="mt-1 h-1 rounded bg-[#E8E4DE] overflow-hidden">
                    <div
                      className="h-full bg-[#B8860B] transition-all"
                      style={{ width: `${u.progress}%` }}
                    />
                  </div>
                )}
                {u.status === "error" && (
                  <p className="text-xs text-red-600 mt-0.5">{u.error}</p>
                )}
              </div>
              {u.status === "uploading" ? (
                <Loader2 className="h-4 w-4 text-[#8B7355] animate-spin" />
              ) : (
                <button
                  onClick={() => dismissUploadError(u.tempId)}
                  className="text-[#5E5E5E] hover:text-[#1A1A1A] transition-colors"
                  aria-label="Descartar"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {loading ? (
        <p className="text-xs text-[#5E5E5E]">Cargando archivos…</p>
      ) : files.length === 0 ? (
        <p className="text-xs text-[#5E5E5E]">Todavía no hay archivos en este proyecto.</p>
      ) : (
        <ul className="divide-y divide-[#E8E4DE]">
          {files.map((file) => (
            <li
              key={file.id}
              className="flex items-center gap-3 py-2.5 px-2 -mx-2 rounded hover:bg-[#E8E4DE]/40 transition-colors"
            >
              <FileText className="h-4 w-4 text-[#8B7355] shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-[#1A1A1A] truncate">{file.fileName}</span>
                  <span className="text-[10px] font-medium text-[#B8860B] border border-[#C5A572]/40 rounded px-1.5 py-0.5 shrink-0">
                    {extensionBadge(file.fileName, file.mimeType)}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-[11px] text-[#5E5E5E]">
                  <span>{formatFileSize(file.fileSize)}</span>
                  <span>·</span>
                  <span>{relativeTime(file.uploadedAt)}</span>
                </div>
              </div>
              <a
                href={file.downloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#5E5E5E] hover:text-[#1A1A1A] transition-colors p-1"
                title="Descargar"
              >
                <Download className="h-4 w-4" />
              </a>
              <button
                onClick={() => handleDelete(file.id)}
                className="text-[#5E5E5E] hover:text-red-600 transition-colors p-1"
                title="Eliminar"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
