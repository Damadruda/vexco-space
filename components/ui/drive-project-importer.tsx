"use client";

import { useState, useEffect } from "react";
import { X, Folder, FileText, Loader2, CheckCircle, AlertCircle, Sparkles, Eye, Search, ChevronRight, Home } from "lucide-react";
import { useRouter } from "next/navigation";
import { signIn, useSession } from "next-auth/react";

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  path: string;
  children?: DriveFile[];
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

interface ProjectStructure {
  title: string;
  description: string;
  category: string;
  tags: string[];
  concept: {
    idea: string;
    problem: string;
    solution: string;
    value: string;
  };
  market: {
    target: string;
    size: string;
    trends: string;
    competitors: string;
  };
  model: {
    revenue: string;
    costs: string;
    channels: string;
    resources: string;
  };
  action: {
    milestones: string;
    timeline: string;
    tasks: string;
    metrics: string;
  };
  resourcesPlan: {
    team: string;
    tools: string;
    budget: string;
    partners: string;
  };
  extractedNotes: Array<{ title: string; content: string }>;
  extractedLinks: Array<{ url: string; title: string; description: string }>;
  sourceFolderName?: string;
  totalFilesProcessed?: number;
  totalFilesInFolder?: number;
}

interface DriveProjectImporterProps {
  isOpen: boolean;
  onClose: () => void;
}

const DEFAULT_ROOT_FOLDER = {
  id: "1vSvQRth1ka9rSJ3S6e1a60_kD9G0Deir",
  name: "Proyectos"
};

export function DriveProjectImporter({ isOpen, onClose }: DriveProjectImporterProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const [step, setStep] = useState<"select" | "analyze" | "preview">("select");
  const [selectedFolder, setSelectedFolder] = useState<DriveFile | null>(null);
  const [folderStats, setFolderStats] = useState<FolderStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projectStructure, setProjectStructure] = useState<ProjectStructure | null>(null);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [needsGoogleAuth, setNeedsGoogleAuth] = useState(false);

  // Folder browser state
  const [driveFolders, setDriveFolders] = useState<DriveFile[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentFolder, setCurrentFolder] = useState<{ id: string; name: string } | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<{ id: string; name: string }[]>([]);

  // Initialize folder browser
  useEffect(() => {
    if (isOpen) {
      setStep("select");
      setSelectedFolder(null);
      setFolderStats(null);
      setProjectStructure(null);
      setFiles([]);
      setError(null);
      setSearchQuery("");

      const saved = localStorage.getItem("driveRootFolder");
      let root = DEFAULT_ROOT_FOLDER;
      if (saved) {
        try { root = JSON.parse(saved); } catch (e) { /* use default */ }
      }
      setCurrentFolder(root);
      setBreadcrumbs([root]);
    }
  }, [isOpen]);

  // Fetch folders when current folder or search changes
  useEffect(() => {
    if (!isOpen || step !== "select") return;

    const timer = setTimeout(() => {
      fetchFolders(currentFolder?.id, searchQuery);
    }, 500);

    return () => clearTimeout(timer);
  }, [currentFolder?.id, searchQuery, isOpen, step]);

  const fetchFolders = async (parentId?: string, query?: string) => {
    setBrowseLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        mimeType: "application/vnd.google-apps.folder"
      });
      if (parentId) params.append("parentId", parentId);
      if (query && query.trim()) params.append("query", query.trim());

      const response = await fetch(`/api/drive?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401 || data.needsGoogleAuth) {
          setNeedsGoogleAuth(true);
          setError(data.error || "Conecta tu cuenta de Google para acceder a Drive");
        } else {
          setError(data.error || "Error al cargar carpetas");
        }
        setDriveFolders([]);
        return;
      }

      setNeedsGoogleAuth(false);
      setDriveFolders(data.files || []);
    } catch (err) {
      setError("Error de conexión");
    } finally {
      setBrowseLoading(false);
    }
  };

  const navigateToFolder = (folder: DriveFile) => {
    const newFolder = { id: folder.id, name: folder.name };
    setCurrentFolder(newFolder);
    setBreadcrumbs(prev => [...prev, newFolder]);
    setSelectedFolder(null);
    setSearchQuery("");
  };

  const navigateToBreadcrumb = (index: number) => {
    if (index === -1) {
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

  const handleSelectFolder = async (folderId: string, folderName?: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/drive/folder?folderId=${folderId}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Error al cargar carpeta");
      }

      const rootFolder: DriveFile = {
        id: folderId,
        name: folderName || "Carpeta seleccionada",
        mimeType: "application/vnd.google-apps.folder",
        path: "",
        children: data.files
      };

      setSelectedFolder(rootFolder);
      setFolderStats(data.stats);
      setFiles(flattenFiles(data.files));
      setStep("analyze");

    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar carpeta");
    } finally {
      setLoading(false);
    }
  };

  const flattenFiles = (files: DriveFile[]): DriveFile[] => {
    const result: DriveFile[] = [];
    for (const file of files) {
      result.push(file);
      if (file.children) {
        result.push(...flattenFiles(file.children));
      }
    }
    return result;
  };

  const handleAnalyze = async () => {
    if (!files || files.length === 0) return;

    setAnalyzing(true);
    setError(null);

    try {
      const response = await fetch("/api/projects/import-from-drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files,
          folderName: selectedFolder?.name
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Error al analizar carpeta");
      }

      setProjectStructure(data.projectStructure);
      setStep("preview");

    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al analizar carpeta");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleCreateProject = async () => {
    if (!projectStructure) return;

    setCreating(true);
    setError(null);

    try {
      const response = await fetch("/api/projects/import-from-drive", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectStructure })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Error al crear proyecto");
      }

      router.push(`/project-builder/${data.project.id}`);
      onClose();

    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear proyecto");
    } finally {
      setCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="font-serif text-xl font-medium text-gray-900">Importar Proyecto desde Drive</h2>
            <p className="text-sm text-gray-500 mt-1">Analiza una carpeta completa y genera un proyecto estructurado</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-4 p-4 border-b bg-gray-50">
          <div className={`flex items-center gap-2 ${
            step === "select" ? "text-gray-900" : "text-gray-400"
          }`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
              step !== "select" ? "bg-green-500 text-white" : "bg-gray-200"
            }`}>
              {step !== "select" ? <CheckCircle className="w-5 h-5" /> : "1"}
            </div>
            <span className="text-sm font-medium">Seleccionar</span>
          </div>

          <div className="w-12 h-px bg-gray-300" />

          <div className={`flex items-center gap-2 ${
            step === "analyze" ? "text-gray-900" : "text-gray-400"
          }`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
              step === "preview" ? "bg-green-500 text-white" : step === "analyze" ? "bg-gray-900 text-white" : "bg-gray-200"
            }`}>
              {step === "preview" ? <CheckCircle className="w-5 h-5" /> : "2"}
            </div>
            <span className="text-sm font-medium">Analizar</span>
          </div>

          <div className="w-12 h-px bg-gray-300" />

          <div className={`flex items-center gap-2 ${
            step === "preview" ? "text-gray-900" : "text-gray-400"
          }`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
              step === "preview" ? "bg-gray-900 text-white" : "bg-gray-200"
            }`}>
              3
            </div>
            <span className="text-sm font-medium">Confirmar</span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          {/* Step 1: Select Folder — Visual Browser */}
          {step === "select" && (
            needsGoogleAuth ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Folder className="h-8 w-8 text-gray-400" />
                </div>
                <h3 className="font-serif text-lg font-medium text-gray-900 mb-2">Conectar Google Drive</h3>
                <p className="text-gray-500 mb-6 max-w-md mx-auto">
                  Para importar carpetas de proyectos, necesitas conectar tu cuenta de Google
                </p>
                <button
                  onClick={() => signIn("google", { callbackUrl: window.location.pathname })}
                  className="px-6 py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
                >
                  Conectar con Google
                </button>
              </div>
            ) : (
              <div>
                {/* Breadcrumbs */}
                <div className="flex items-center gap-1 text-sm mb-3 overflow-x-auto">
                  <button
                    onClick={() => navigateToBreadcrumb(-1)}
                    className="flex items-center gap-1 text-gray-500 hover:text-gray-900 shrink-0"
                  >
                    <Home className="h-4 w-4" />
                    <span>Mi Drive</span>
                  </button>
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
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Buscar carpetas..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900/20"
                  />
                </div>

                {/* Folder list */}
                <div className="border border-gray-200 rounded-lg overflow-hidden min-h-[300px] max-h-[400px] overflow-y-auto">
                  {browseLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                    </div>
                  ) : driveFolders.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      {currentFolder ? "Esta carpeta está vacía" : "No se encontraron carpetas"}
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {driveFolders
                        .filter(f => f.mimeType === "application/vnd.google-apps.folder")
                        .map(folder => (
                          <div
                            key={folder.id}
                            className="group flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
                          >
                            <Folder className="h-5 w-5 text-yellow-500 shrink-0" />
                            <span
                              className="flex-1 text-sm truncate"
                              onClick={() => navigateToFolder(folder)}
                            >
                              {folder.name}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectFolder(folder.id, folder.name);
                              }}
                              disabled={loading}
                              className="shrink-0 px-3 py-1 text-xs font-medium text-gray-600 border border-gray-200 rounded-md hover:bg-gray-900 hover:text-white hover:border-gray-900 transition-colors opacity-0 group-hover:opacity-100"
                            >
                              {loading ? "..." : "Seleccionar"}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigateToFolder(folder);
                              }}
                              className="p-1 rounded hover:bg-gray-200 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity"
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
            )
          )}

          {/* Step 2: Analyze */}
          {step === "analyze" && folderStats && (
            <div>
              <div className="bg-gray-50 rounded-lg p-6 mb-6">
                <h3 className="font-serif text-lg font-medium text-gray-900 mb-4">Contenido de la carpeta</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-900">{folderStats.totalFiles}</div>
                    <div className="text-sm text-gray-500">Archivos</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-900">{folderStats.documents}</div>
                    <div className="text-sm text-gray-500">Documentos</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-900">{folderStats.pdfs}</div>
                    <div className="text-sm text-gray-500">PDFs</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-900">{folderStats.spreadsheets}</div>
                    <div className="text-sm text-gray-500">Hojas</div>
                  </div>
                </div>
              </div>

              <div className="text-center">
                <p className="text-gray-600 mb-6">
                  Analizaremos hasta 50 documentos relevantes (ignorando código y configuración) para estructurar tu proyecto automáticamente
                </p>
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={() => setStep("select")}
                    className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    Cambiar carpeta
                  </button>
                  <button
                    onClick={handleAnalyze}
                    disabled={analyzing}
                    className="px-6 py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {analyzing ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Analizando con IA...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-5 h-5" />
                        Analizar y Generar Proyecto
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Preview */}
          {step === "preview" && projectStructure && (
            <div className="space-y-6">
              <div>
                <h3 className="font-serif text-lg font-medium text-gray-900 mb-3">Información del Proyecto</h3>
                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Título</label>
                    <input
                      type="text"
                      value={projectStructure.title}
                      onChange={(e) => setProjectStructure({ ...projectStructure, title: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900/20"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                    <textarea
                      value={projectStructure.description}
                      onChange={(e) => setProjectStructure({ ...projectStructure, description: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900/20"
                    />
                  </div>
                  <div className="flex gap-2">
                    {projectStructure.tags.map((tag, index) => (
                      <span key={index} className="px-2 py-1 bg-gray-200 text-gray-700 rounded-full text-xs">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 text-sm text-gray-500 bg-blue-50 p-3 rounded-lg">
                <FileText className="w-4 h-4" />
                <span>{projectStructure.totalFilesProcessed || 0} archivos procesados de {projectStructure.totalFilesInFolder || 0} totales</span>
                {projectStructure.extractedNotes && projectStructure.extractedNotes.length > 0 && (
                  <span>• {projectStructure.extractedNotes.length} notas extraídas</span>
                )}
                {projectStructure.extractedLinks && projectStructure.extractedLinks.length > 0 && (
                  <span>• {projectStructure.extractedLinks.length} links encontrados</span>
                )}
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="border border-gray-200 rounded-lg p-4">
                  <h4 className="font-medium text-gray-900 mb-2">01 • Concept</h4>
                  <p className="text-sm text-gray-600 line-clamp-3">{projectStructure.concept?.idea}</p>
                </div>
                <div className="border border-gray-200 rounded-lg p-4">
                  <h4 className="font-medium text-gray-900 mb-2">02 • Market</h4>
                  <p className="text-sm text-gray-600 line-clamp-3">{projectStructure.market?.target}</p>
                </div>
                <div className="border border-gray-200 rounded-lg p-4">
                  <h4 className="font-medium text-gray-900 mb-2">03 • Model</h4>
                  <p className="text-sm text-gray-600 line-clamp-3">{projectStructure.model?.revenue}</p>
                </div>
                <div className="border border-gray-200 rounded-lg p-4">
                  <h4 className="font-medium text-gray-900 mb-2">04 • Action</h4>
                  <p className="text-sm text-gray-600 line-clamp-3">{projectStructure.action?.milestones}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === "preview" && (
          <div className="flex items-center justify-between p-6 border-t bg-gray-50">
            <button
              onClick={() => setStep("analyze")}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Volver
            </button>
            <button
              onClick={handleCreateProject}
              disabled={creating}
              className="px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {creating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creando...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Crear Proyecto
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
