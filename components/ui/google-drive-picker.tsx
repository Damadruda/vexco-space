"use client";

import { useState, useEffect } from "react";
import { X, Search, FileText, Image as ImageIcon, Film, Music, FileSpreadsheet, Folder, Check, Loader2, CloudOff, LogIn } from "lucide-react";
import { signIn, useSession } from "next-auth/react";

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  iconLink?: string;
  thumbnailLink?: string;
  webViewLink?: string;
  modifiedTime?: string;
  size?: string;
}

interface GoogleDrivePickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (files: DriveFile[]) => void;
  projectId?: string;
  multiple?: boolean;
}

export function GoogleDrivePicker({ isOpen, onClose, onSelect, projectId, multiple = true }: GoogleDrivePickerProps) {
  const { data: session } = useSession();
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<DriveFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [needsGoogleAuth, setNeedsGoogleAuth] = useState(false);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  
  useEffect(() => {
    if (isOpen) {
      fetchFiles();
    }
  }, [isOpen]);
  
  useEffect(() => {
    if (isOpen && searchQuery !== undefined) {
      const timer = setTimeout(() => {
        fetchFiles();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [searchQuery]);
  
  const fetchFiles = async (pageToken?: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.append("query", searchQuery);
      if (pageToken) params.append("pageToken", pageToken);
      
      const response = await fetch(`/api/drive?${params.toString()}`);
      const data = await response.json();
      
      if (!response.ok) {
        // Si hay cualquier error 401, asumimos que necesita autenticación con Google
        if (response.status === 401 || data.needsGoogleAuth) {
          setNeedsGoogleAuth(true);
          setError(data.error || "Conecta tu cuenta de Google para acceder a Drive");
        } else {
          setError(data.error || "Error al cargar archivos");
        }
        setFiles([]);
        return;
      }
      
      setNeedsGoogleAuth(false);
      if (pageToken) {
        setFiles(prev => [...prev, ...data.files]);
      } else {
        setFiles(data.files);
      }
      setNextPageToken(data.nextPageToken);
      
    } catch (err) {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  };
  
  const toggleFileSelection = (file: DriveFile) => {
    if (multiple) {
      setSelectedFiles(prev => {
        const isSelected = prev.some(f => f.id === file.id);
        if (isSelected) {
          return prev.filter(f => f.id !== file.id);
        }
        return [...prev, file];
      });
    } else {
      setSelectedFiles([file]);
    }
  };
  
  const handleImport = async () => {
    if (selectedFiles.length === 0) return;
    
    setImporting(true);
    
    try {
      for (const file of selectedFiles) {
        await fetch("/api/drive/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileId: file.id,
            fileName: file.name,
            mimeType: file.mimeType,
            projectId
          })
        });
      }
      
      onSelect(selectedFiles);
      setSelectedFiles([]);
      onClose();
      
    } catch (err) {
      setError("Error al importar archivos");
    } finally {
      setImporting(false);
    }
  };
  
  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith("image/")) return <ImageIcon className="h-5 w-5 text-green-600" />;
    if (mimeType.startsWith("video/")) return <Film className="h-5 w-5 text-purple-600" />;
    if (mimeType.startsWith("audio/")) return <Music className="h-5 w-5 text-pink-600" />;
    if (mimeType.includes("spreadsheet")) return <FileSpreadsheet className="h-5 w-5 text-emerald-600" />;
    if (mimeType.includes("folder")) return <Folder className="h-5 w-5 text-yellow-600" />;
    return <FileText className="h-5 w-5 text-blue-600" />;
  };
  
  const handleGoogleSignIn = () => {
    signIn("google", { callbackUrl: "/idea-vault" });
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h2 className="font-serif text-lg font-medium text-gray-900">Google Drive</h2>
            <p className="text-sm text-gray-500">Selecciona archivos para importar</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
            <X className="h-5 w-5" />
          </button>
        </div>
        
        {/* Search */}
        <div className="p-4 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar en Google Drive..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900/20"
            />
          </div>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {needsGoogleAuth ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <CloudOff className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="font-serif text-lg font-medium text-gray-900 mb-2">Conectar Google Drive</h3>
              <p className="text-gray-500 mb-6 max-w-sm">
                Para importar archivos desde Google Drive, necesitas iniciar sesión con tu cuenta de Google (@vexandco.com)
              </p>
              <button
                onClick={handleGoogleSignIn}
                className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white rounded-md hover:bg-gray-800 transition-colors"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Conectar con Google
              </button>
            </div>
          ) : loading && files.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : error ? (
            <div className="text-center py-12 text-red-600">{error}</div>
          ) : files.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No se encontraron archivos
            </div>
          ) : (
            <>
              <div className="space-y-1">
                {files.map((file) => {
                  const isSelected = selectedFiles.some(f => f.id === file.id);
                  return (
                    <div
                      key={file.id}
                      onClick={() => toggleFileSelection(file)}
                      className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                        isSelected ? "bg-gray-100 ring-2 ring-gray-900" : "hover:bg-gray-50"
                      }`}
                    >
                      <div className="flex-shrink-0">
                        {file.thumbnailLink ? (
                          <img src={file.thumbnailLink} alt="" className="h-10 w-10 rounded object-cover" />
                        ) : (
                          getFileIcon(file.mimeType)
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                        <p className="text-xs text-gray-500">
                          {file.modifiedTime && new Date(file.modifiedTime).toLocaleDateString("es-ES")}
                          {file.size && ` • ${(parseInt(file.size) / 1024 / 1024).toFixed(2)} MB`}
                        </p>
                      </div>
                      {isSelected && (
                        <Check className="h-5 w-5 text-gray-900 flex-shrink-0" />
                      )}
                    </div>
                  );
                })}
              </div>
              
              {nextPageToken && (
                <button
                  onClick={() => fetchFiles(nextPageToken)}
                  disabled={loading}
                  className="w-full mt-4 py-2 text-sm text-gray-600 hover:text-gray-900"
                >
                  {loading ? "Cargando..." : "Cargar más"}
                </button>
              )}
            </>
          )}
        </div>
        
        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t bg-gray-50">
          <p className="text-sm text-gray-500">
            {selectedFiles.length} archivo{selectedFiles.length !== 1 ? "s" : ""} seleccionado{selectedFiles.length !== 1 ? "s" : ""}
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
            >
              Cancelar
            </button>
            <button
              onClick={handleImport}
              disabled={selectedFiles.length === 0 || importing}
              className="px-4 py-2 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {importing && <Loader2 className="h-4 w-4 animate-spin" />}
              Importar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
