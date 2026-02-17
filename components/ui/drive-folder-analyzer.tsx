"use client";

import { useState, useEffect } from "react";
import { 
  X, Search, Folder, FolderOpen, ChevronRight, ChevronDown, 
  Loader2, CloudOff, Sparkles, FileText, FileSpreadsheet, 
  Image as ImageIcon, FileIcon, Check, AlertCircle
} from "lucide-react";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  path?: string;
  children?: DriveFile[];
  modifiedTime?: string;
}

interface FolderStats {
  totalFiles: number;
  totalFolders: number;
  documents: number;
  spreadsheets: number;
  presentations: number;
  images: number;
  pdfs: number;
  other: number;
}

interface AnalysisResult {
  title: string;
  description: string;
  category: string;
  tags: string[];
  concept: string;
  problemSolved: string;
  targetMarket: string;
  marketValidation: string;
  businessModel: string;
  valueProposition: string;
  actionPlan: string;
  milestones: string;
  resources: string;
  metrics: string;
  insights: string;
}

interface DriveFolderAnalyzerProps {
  isOpen: boolean;
  onClose: () => void;
  onProjectCreated?: (projectId: string) => void;
}

export function DriveFolderAnalyzer({ isOpen, onClose, onProjectCreated }: DriveFolderAnalyzerProps) {
  const { data: session } = useSession();
  const router = useRouter();
  
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFolder, setSelectedFolder] = useState<DriveFile | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [needsGoogleAuth, setNeedsGoogleAuth] = useState(false);
  const [folderStats, setFolderStats] = useState<FolderStats | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [analysisStep, setAnalysisStep] = useState<string>("");
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  
  useEffect(() => {
    if (isOpen) {
      fetchRootFiles();
      // Reset state
      setSelectedFolder(null);
      setFolderStats(null);
      setAnalysisResult(null);
      setCreatedProjectId(null);
    }
  }, [isOpen]);
  
  const fetchRootFiles = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Fetch only folders at root level
      const params = new URLSearchParams({
        mimeType: "application/vnd.google-apps.folder"
      });
      
      const response = await fetch(`/api/drive?${params.toString()}`);
      const data = await response.json();
      
      if (!response.ok) {
        if (response.status === 401 || data.needsGoogleAuth) {
          setNeedsGoogleAuth(true);
          setError(data.error || "Conecta tu cuenta de Google para acceder a Drive");
        } else {
          setError(data.error || "Error al cargar carpetas");
        }
        setFiles([]);
        return;
      }
      
      setNeedsGoogleAuth(false);
      setFiles(data.files || []);
      
    } catch (err) {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  };
  
  const fetchFolderContents = async (folderId: string) => {
    try {
      const response = await fetch(`/api/drive/folder?folderId=${folderId}`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Error al cargar carpeta");
      }
      
      return { files: data.files, stats: data.stats };
    } catch (err) {
      console.error("Error fetching folder:", err);
      return null;
    }
  };
  
  const toggleFolderExpand = async (folder: DriveFile) => {
    const newExpanded = new Set(expandedFolders);
    
    if (newExpanded.has(folder.id)) {
      newExpanded.delete(folder.id);
    } else {
      newExpanded.add(folder.id);
      
      // Fetch children if not loaded
      if (!folder.children) {
        const result = await fetchFolderContents(folder.id);
        if (result) {
          folder.children = result.files;
          setFiles([...files]); // Trigger re-render
        }
      }
    }
    
    setExpandedFolders(newExpanded);
  };
  
  const selectFolder = async (folder: DriveFile) => {
    setSelectedFolder(folder);
    setAnalysisResult(null);
    setCreatedProjectId(null);
    
    // Fetch stats for selected folder
    const result = await fetchFolderContents(folder.id);
    if (result) {
      setFolderStats(result.stats);
    }
  };
  
  const analyzeFolder = async () => {
    if (!selectedFolder) return;
    
    setAnalyzing(true);
    setError(null);
    setAnalysisStep("Extrayendo contenido de los archivos...");
    
    try {
      const response = await fetch("/api/drive/analyze-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folderId: selectedFolder.id,
          folderName: selectedFolder.name,
          createProject: true
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Error al analizar la carpeta");
      }
      
      setAnalysisResult(data.analysis);
      setCreatedProjectId(data.project?.id);
      setAnalysisStep("");
      
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al analizar");
      setAnalysisStep("");
    } finally {
      setAnalyzing(false);
    }
  };
  
  const goToProject = () => {
    if (createdProjectId) {
      onClose();
      router.push(`/project-builder/${createdProjectId}`);
      if (onProjectCreated) {
        onProjectCreated(createdProjectId);
      }
    }
  };
  
  const handleGoogleSignIn = () => {
    signIn("google", { callbackUrl: window.location.pathname });
  };
  
  const getFileIcon = (mimeType: string) => {
    if (mimeType.includes("folder")) return <Folder className="h-4 w-4 text-yellow-600" />;
    if (mimeType.includes("document")) return <FileText className="h-4 w-4 text-blue-600" />;
    if (mimeType.includes("spreadsheet")) return <FileSpreadsheet className="h-4 w-4 text-green-600" />;
    if (mimeType.startsWith("image/")) return <ImageIcon className="h-4 w-4 text-purple-600" />;
    return <FileIcon className="h-4 w-4 text-gray-600" />;
  };
  
  const renderFolder = (folder: DriveFile, depth: number = 0) => {
    const isExpanded = expandedFolders.has(folder.id);
    const isSelected = selectedFolder?.id === folder.id;
    
    return (
      <div key={folder.id}>
        <div
          className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
            isSelected ? "bg-gray-900 text-white" : "hover:bg-gray-100"
          }`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleFolderExpand(folder);
            }}
            className="p-0.5 hover:bg-gray-200 rounded"
          >
            {isExpanded ? (
              <ChevronDown className={`h-4 w-4 ${isSelected ? "text-white" : "text-gray-500"}`} />
            ) : (
              <ChevronRight className={`h-4 w-4 ${isSelected ? "text-white" : "text-gray-500"}`} />
            )}
          </button>
          
          <div 
            className="flex items-center gap-2 flex-1"
            onClick={() => selectFolder(folder)}
          >
            {isExpanded ? (
              <FolderOpen className={`h-5 w-5 ${isSelected ? "text-yellow-300" : "text-yellow-600"}`} />
            ) : (
              <Folder className={`h-5 w-5 ${isSelected ? "text-yellow-300" : "text-yellow-600"}`} />
            )}
            <span className="text-sm font-medium truncate">{folder.name}</span>
          </div>
          
          {isSelected && (
            <Check className="h-4 w-4 text-white flex-shrink-0" />
          )}
        </div>
        
        {isExpanded && folder.children && (
          <div>
            {folder.children
              .filter(f => f.mimeType === "application/vnd.google-apps.folder")
              .map(child => renderFolder(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h2 className="font-serif text-lg font-medium text-gray-900 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-600" />
              Importar Proyecto desde Google Drive
            </h2>
            <p className="text-sm text-gray-500">
              Selecciona una carpeta para analizar con IA y crear un proyecto
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
            <X className="h-5 w-5" />
          </button>
        </div>
        
        {needsGoogleAuth ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <CloudOff className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="font-serif text-lg font-medium text-gray-900 mb-2">Conectar Google Drive</h3>
            <p className="text-gray-500 mb-6 max-w-sm">
              Para importar carpetas de proyectos, necesitas conectar tu cuenta de Google
            </p>
            <button
              onClick={handleGoogleSignIn}
              className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white rounded-md hover:bg-gray-800 transition-colors"
            >
              Conectar con Google
            </button>
          </div>
        ) : (
          <div className="flex-1 flex overflow-hidden">
            {/* Left panel - Folder tree */}
            <div className="w-1/2 border-r flex flex-col">
              <div className="p-3 border-b">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Buscar carpetas..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900/20"
                  />
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-2">
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                  </div>
                ) : error && !analysisResult ? (
                  <div className="text-center py-12">
                    <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
                    <p className="text-red-600">{error}</p>
                  </div>
                ) : files.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    No se encontraron carpetas
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {files
                      .filter(f => f.mimeType === "application/vnd.google-apps.folder")
                      .filter(f => !searchQuery || f.name.toLowerCase().includes(searchQuery.toLowerCase()))
                      .map(folder => renderFolder(folder))}
                  </div>
                )}
              </div>
            </div>
            
            {/* Right panel - Folder details & analysis */}
            <div className="w-1/2 flex flex-col">
              {!selectedFolder ? (
                <div className="flex-1 flex items-center justify-center text-gray-500">
                  <div className="text-center">
                    <Folder className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p>Selecciona una carpeta para analizar</p>
                  </div>
                </div>
              ) : analysisResult ? (
                <div className="flex-1 overflow-y-auto p-4">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-green-600 bg-green-50 p-3 rounded-lg">
                      <Check className="h-5 w-5" />
                      <span className="font-medium">¡Proyecto creado exitosamente!</span>
                    </div>
                    
                    <div>
                      <h3 className="font-serif text-xl font-medium text-gray-900">
                        {analysisResult.title}
                      </h3>
                      <p className="text-gray-600 mt-1">{analysisResult.description}</p>
                      
                      {analysisResult.tags && analysisResult.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {analysisResult.tags.map((tag, i) => (
                            <span key={i} className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    <div className="space-y-3 text-sm">
                      {analysisResult.concept && (
                        <div>
                          <h4 className="font-medium text-gray-900">Concepto</h4>
                          <p className="text-gray-600">{analysisResult.concept}</p>
                        </div>
                      )}
                      
                      {analysisResult.targetMarket && (
                        <div>
                          <h4 className="font-medium text-gray-900">Mercado Objetivo</h4>
                          <p className="text-gray-600">{analysisResult.targetMarket}</p>
                        </div>
                      )}
                      
                      {analysisResult.businessModel && (
                        <div>
                          <h4 className="font-medium text-gray-900">Modelo de Negocio</h4>
                          <p className="text-gray-600">{analysisResult.businessModel}</p>
                        </div>
                      )}
                      
                      {analysisResult.insights && (
                        <div className="bg-purple-50 p-3 rounded-lg">
                          <h4 className="font-medium text-purple-900 flex items-center gap-1">
                            <Sparkles className="h-4 w-4" />
                            Insights de IA
                          </h4>
                          <p className="text-purple-800 text-sm mt-1">{analysisResult.insights}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto p-4">
                  <div className="space-y-4">
                    <div>
                      <h3 className="font-serif text-lg font-medium text-gray-900 flex items-center gap-2">
                        <FolderOpen className="h-5 w-5 text-yellow-600" />
                        {selectedFolder.name}
                      </h3>
                    </div>
                    
                    {folderStats && (
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-gray-50 p-3 rounded-lg">
                          <p className="text-2xl font-bold text-gray-900">{folderStats.totalFiles}</p>
                          <p className="text-xs text-gray-500">Archivos</p>
                        </div>
                        <div className="bg-gray-50 p-3 rounded-lg">
                          <p className="text-2xl font-bold text-gray-900">{folderStats.totalFolders}</p>
                          <p className="text-xs text-gray-500">Subcarpetas</p>
                        </div>
                        <div className="bg-blue-50 p-3 rounded-lg">
                          <p className="text-2xl font-bold text-blue-900">{folderStats.documents}</p>
                          <p className="text-xs text-blue-600">Documentos</p>
                        </div>
                        <div className="bg-green-50 p-3 rounded-lg">
                          <p className="text-2xl font-bold text-green-900">{folderStats.spreadsheets}</p>
                          <p className="text-xs text-green-600">Hojas de cálculo</p>
                        </div>
                      </div>
                    )}
                    
                    <div className="bg-purple-50 p-4 rounded-lg">
                      <h4 className="font-medium text-purple-900 flex items-center gap-2">
                        <Sparkles className="h-4 w-4" />
                        Análisis con IA
                      </h4>
                      <p className="text-sm text-purple-700 mt-1">
                        La IA analizará todos los documentos de esta carpeta para identificar:
                      </p>
                      <ul className="text-sm text-purple-700 mt-2 space-y-1">
                        <li>• Concepto y problema que resuelve</li>
                        <li>• Mercado objetivo y validación</li>
                        <li>• Modelo de negocio y propuesta de valor</li>
                        <li>• Plan de acción y recursos necesarios</li>
                      </ul>
                    </div>
                    
                    {error && (
                      <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">
                        {error}
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {/* Footer */}
              <div className="p-4 border-t bg-gray-50">
                {analysisResult && createdProjectId ? (
                  <button
                    onClick={goToProject}
                    className="w-full px-4 py-2.5 bg-gray-900 text-white rounded-md hover:bg-gray-800 flex items-center justify-center gap-2"
                  >
                    Ver Proyecto
                    <ChevronRight className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    onClick={analyzeFolder}
                    disabled={!selectedFolder || analyzing}
                    className="w-full px-4 py-2.5 bg-gray-900 text-white rounded-md hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {analyzing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {analysisStep || "Analizando..."}
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        Analizar y Crear Proyecto
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
