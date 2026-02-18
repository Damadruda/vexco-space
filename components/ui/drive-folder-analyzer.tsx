"use client";

import { useState, useEffect } from "react";
import { 
  X, Search, Folder, FolderOpen, ChevronRight, ChevronDown, 
  Loader2, CloudOff, Sparkles, FileText, FileSpreadsheet, 
  Image as ImageIcon, FileIcon, Check, AlertCircle, Home, Settings, FolderRoot, Code
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

interface TechStack {
  frontend?: string[];
  backend?: string[];
  database?: string[];
  infrastructure?: string[];
  other?: string[];
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
  // Campos técnicos
  techStack?: TechStack;
  techSummary?: string;
  techRecommendations?: string;
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
  
  // Navegación de carpetas
  const [currentFolder, setCurrentFolder] = useState<{ id: string; name: string } | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<{ id: string; name: string }[]>([]);
  const [rootFolder, setRootFolder] = useState<{ id: string; name: string } | null>(null);
  
  // Carpeta raíz por defecto (carpeta de Proyectos de Diego)
  const DEFAULT_ROOT_FOLDER = {
    id: "1vSvQRth1ka9rSJ3S6e1a60_kD9G0Deir",
    name: "Proyectos"
  };
  
  // Cargar carpeta raíz guardada o usar la por defecto
  useEffect(() => {
    const saved = localStorage.getItem("driveRootFolder");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setRootFolder(parsed);
        setCurrentFolder(parsed);
        setBreadcrumbs([parsed]);
      } catch (e) {
        console.error("Error loading root folder:", e);
        // Usar carpeta por defecto si hay error
        setRootFolder(DEFAULT_ROOT_FOLDER);
        setCurrentFolder(DEFAULT_ROOT_FOLDER);
        setBreadcrumbs([DEFAULT_ROOT_FOLDER]);
      }
    } else {
      // No hay carpeta guardada, usar la por defecto
      setRootFolder(DEFAULT_ROOT_FOLDER);
      setCurrentFolder(DEFAULT_ROOT_FOLDER);
      setBreadcrumbs([DEFAULT_ROOT_FOLDER]);
      localStorage.setItem("driveRootFolder", JSON.stringify(DEFAULT_ROOT_FOLDER));
    }
  }, []);
  
  useEffect(() => {
    if (isOpen) {
      // Reset state when modal opens
      setSearchQuery("");
      setSelectedFolder(null);
      setFolderStats(null);
      setAnalysisResult(null);
      setCreatedProjectId(null);
      setError(null);
      
      // Reset to root folder if configured
      if (rootFolder) {
        setCurrentFolder(rootFolder);
        setBreadcrumbs([rootFolder]);
      } else {
        setCurrentFolder(null);
        setBreadcrumbs([]);
      }
    }
  }, [isOpen, rootFolder]);
  
  const fetchFolders = async (parentId?: string, query?: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams({
        mimeType: "application/vnd.google-apps.folder"
      });
      
      if (parentId) {
        params.append("parentId", parentId);
      }
      
      if (query && query.trim()) {
        params.append("query", query.trim());
      }
      
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
  
  // Fetch folders when current folder or search changes
  useEffect(() => {
    if (!isOpen) return;
    
    const timer = setTimeout(() => {
      fetchFolders(currentFolder?.id, searchQuery);
    }, 500);
    
    return () => clearTimeout(timer);
  }, [currentFolder?.id, searchQuery, isOpen]);
  
  const navigateToFolder = (folder: DriveFile) => {
    const newFolder = { id: folder.id, name: folder.name };
    setCurrentFolder(newFolder);
    setBreadcrumbs(prev => [...prev, newFolder]);
    setSelectedFolder(null);
    setSearchQuery("");
  };
  
  const navigateToBreadcrumb = (index: number) => {
    if (index === -1) {
      // Go to Drive root
      setCurrentFolder(null);
      setBreadcrumbs([]);
    } else {
      const newBreadcrumbs = breadcrumbs.slice(0, index + 1);
      setBreadcrumbs(newBreadcrumbs);
      setCurrentFolder(newBreadcrumbs[newBreadcrumbs.length - 1]);
    }
    setSelectedFolder(null);
    setSearchQuery("");
  };
  
  const setAsRootFolder = (folder: { id: string; name: string }) => {
    localStorage.setItem("driveRootFolder", JSON.stringify(folder));
    setRootFolder(folder);
    setCurrentFolder(folder);
    setBreadcrumbs([folder]);
    setSelectedFolder(null);
  };
  
  const clearRootFolder = () => {
    localStorage.removeItem("driveRootFolder");
    setRootFolder(null);
    setCurrentFolder(null);
    setBreadcrumbs([]);
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
              {/* Root folder indicator */}
              {rootFolder && (
                <div className="px-3 py-2 bg-purple-50 border-b flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-purple-700">
                    <FolderRoot className="h-4 w-4" />
                    <span>Carpeta raíz: <strong>{rootFolder.name}</strong></span>
                  </div>
                  <button
                    onClick={clearRootFolder}
                    className="text-xs text-purple-600 hover:text-purple-800 underline"
                  >
                    Quitar
                  </button>
                </div>
              )}
              
              {/* Breadcrumbs */}
              <div className="px-3 py-2 border-b flex items-center gap-1 text-sm overflow-x-auto">
                {!rootFolder && (
                  <button
                    onClick={() => navigateToBreadcrumb(-1)}
                    className="flex items-center gap-1 text-gray-500 hover:text-gray-900 shrink-0"
                  >
                    <Home className="h-4 w-4" />
                    <span>Mi Drive</span>
                  </button>
                )}
                {breadcrumbs.map((crumb, index) => (
                  <div key={crumb.id} className="flex items-center gap-1 shrink-0">
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                    <button
                      onClick={() => navigateToBreadcrumb(index)}
                      className={`hover:text-gray-900 ${
                        index === breadcrumbs.length - 1 ? "text-gray-900 font-medium" : "text-gray-500"
                      }`}
                    >
                      {crumb.name}
                    </button>
                  </div>
                ))}
              </div>
              
              {/* Search */}
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
                    {currentFolder ? "Esta carpeta está vacía" : "No se encontraron carpetas"}
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {files
                      .filter(f => f.mimeType === "application/vnd.google-apps.folder")
                      .map(folder => (
                        <div
                          key={folder.id}
                          className={`group flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer ${
                            selectedFolder?.id === folder.id 
                              ? "bg-gray-900 text-white" 
                              : "hover:bg-gray-100"
                          }`}
                        >
                          <Folder className={`h-4 w-4 shrink-0 ${
                            selectedFolder?.id === folder.id ? "text-white" : "text-yellow-500"
                          }`} />
                          <span 
                            className="flex-1 text-sm truncate"
                            onClick={() => setSelectedFolder(folder)}
                          >
                            {folder.name}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigateToFolder(folder);
                            }}
                            className={`p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity ${
                              selectedFolder?.id === folder.id 
                                ? "hover:bg-gray-700 text-white" 
                                : "hover:bg-gray-200 text-gray-500"
                            }`}
                            title="Abrir carpeta"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
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
                      
                      {/* Sección Técnica */}
                      {(analysisResult.techStack || analysisResult.techSummary) && (
                        <div className="border-t pt-4 mt-4">
                          <h4 className="font-medium text-gray-900 flex items-center gap-2 mb-3">
                            <Code className="h-4 w-4 text-blue-600" />
                            Análisis Técnico
                          </h4>
                          
                          {analysisResult.techStack && (
                            <div className="space-y-2 mb-3">
                              {analysisResult.techStack.frontend && analysisResult.techStack.frontend.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  <span className="text-xs font-medium text-gray-500 w-16">Frontend:</span>
                                  {analysisResult.techStack.frontend.map((tech, i) => (
                                    <span key={i} className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">
                                      {tech}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {analysisResult.techStack.backend && analysisResult.techStack.backend.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  <span className="text-xs font-medium text-gray-500 w-16">Backend:</span>
                                  {analysisResult.techStack.backend.map((tech, i) => (
                                    <span key={i} className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded">
                                      {tech}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {analysisResult.techStack.database && analysisResult.techStack.database.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  <span className="text-xs font-medium text-gray-500 w-16">Database:</span>
                                  {analysisResult.techStack.database.map((tech, i) => (
                                    <span key={i} className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded">
                                      {tech}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {analysisResult.techStack.infrastructure && analysisResult.techStack.infrastructure.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  <span className="text-xs font-medium text-gray-500 w-16">Infra:</span>
                                  {analysisResult.techStack.infrastructure.map((tech, i) => (
                                    <span key={i} className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded">
                                      {tech}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                          
                          {analysisResult.techSummary && (
                            <div className="bg-gray-50 p-3 rounded-lg mb-2">
                              <p className="text-gray-700 text-sm">{analysisResult.techSummary}</p>
                            </div>
                          )}
                          
                          {analysisResult.techRecommendations && (
                            <div className="bg-blue-50 p-3 rounded-lg">
                              <h5 className="font-medium text-blue-900 text-xs mb-1">Recomendaciones Técnicas</h5>
                              <p className="text-blue-800 text-sm">{analysisResult.techRecommendations}</p>
                            </div>
                          )}
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
                    
                    {/* Set as root folder option */}
                    {selectedFolder && rootFolder?.id !== selectedFolder.id && (
                      <button
                        onClick={() => setAsRootFolder({ id: selectedFolder.id, name: selectedFolder.name })}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
                      >
                        <FolderRoot className="h-4 w-4" />
                        Establecer como carpeta raíz
                      </button>
                    )}
                    
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
