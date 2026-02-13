"use client";

import { useState, useRef, useEffect } from "react";
import { X, Loader2, Sparkles, Copy, Check, Download, FileText, BarChart3, Target, Users, Briefcase } from "lucide-react";

type GeneratorType = 
  | "competitor_analysis" 
  | "business_model_suggestions" 
  | "action_plan" 
  | "market_validation";

type DocumentType = 
  | "business_plan" 
  | "pitch_deck" 
  | "executive_summary" 
  | "competitor_report" 
  | "market_analysis";

interface AIGeneratorProps {
  projectId: string;
  type: GeneratorType;
  onClose: () => void;
  onApply?: (content: string, field?: string) => void;
}

interface DocumentGeneratorProps {
  projectId: string;
  onClose: () => void;
}

const generatorConfig: Record<GeneratorType, { title: string; icon: any; description: string }> = {
  competitor_analysis: {
    title: "Análisis de Competencia",
    icon: Users,
    description: "Analiza tu competencia directa e indirecta con recomendaciones estratégicas"
  },
  business_model_suggestions: {
    title: "Sugerencias de Modelo de Negocio",
    icon: Briefcase,
    description: "Genera opciones de modelos de negocio viables para tu proyecto"
  },
  action_plan: {
    title: "Plan de Acción",
    icon: Target,
    description: "Crea un plan de acción detallado con fases, hitos y presupuesto"
  },
  market_validation: {
    title: "Validación de Mercado",
    icon: BarChart3,
    description: "Analiza el mercado objetivo, tamaño, tendencias y oportunidades"
  }
};

const documentConfig: Record<DocumentType, { title: string; icon: any; description: string }> = {
  business_plan: {
    title: "Plan de Negocios",
    icon: FileText,
    description: "Documento completo con todas las secciones de un business plan"
  },
  pitch_deck: {
    title: "Contenido Pitch Deck",
    icon: Briefcase,
    description: "Contenido listo para crear slides de presentación a inversores"
  },
  executive_summary: {
    title: "Resumen Ejecutivo",
    icon: FileText,
    description: "Resumen de 1-2 páginas del proyecto"
  },
  competitor_report: {
    title: "Informe de Competencia",
    icon: Users,
    description: "Análisis detallado del panorama competitivo"
  },
  market_analysis: {
    title: "Análisis de Mercado",
    icon: BarChart3,
    description: "Estudio completo del mercado objetivo"
  }
};

export function AIGenerator({ projectId, type, onClose, onApply }: AIGeneratorProps) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const config = generatorConfig[type];
  const Icon = config.icon;

  const generate = async () => {
    setLoading(true);
    setContent("");

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: type,
          data: { projectId, content: "Genera un análisis completo" },
          stream: true
        })
      });

      if (!res.ok) throw new Error("Error generating content");

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              const text = parsed.choices?.[0]?.delta?.content || "";
              fullContent += text;
              setContent(fullContent);
            } catch (e) {
              // Skip parsing errors
            }
          }
        }
      }
    } catch (error) {
      console.error("Generation error:", error);
      setContent("Error al generar el contenido. Por favor inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    generate();
  }, []);

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [content]);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-800">{config.title}</h2>
              <p className="text-sm text-slate-500">{config.description}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div 
          ref={contentRef}
          className="flex-1 overflow-y-auto p-6"
        >
          {loading && !content && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <Loader2 className="mx-auto h-8 w-8 animate-spin text-amber-500" />
                <p className="mt-3 text-sm text-slate-500">Generando análisis con IA...</p>
              </div>
            </div>
          )}
          
          {content && (
            <div className="prose prose-sm max-w-none text-slate-700 whitespace-pre-wrap">
              {content}
              {loading && <span className="inline-block w-2 h-4 bg-amber-500 animate-pulse ml-1" />}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" />
            <span className="text-sm text-slate-500">Generado con IA</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              disabled={!content || loading}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copiado" : "Copiar"}
            </button>
            <button
              onClick={() => generate()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Regenerar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DocumentGenerator({ projectId, onClose }: DocumentGeneratorProps) {
  const [selectedType, setSelectedType] = useState<DocumentType | null>(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const generate = async (type: DocumentType) => {
    setSelectedType(type);
    setLoading(true);
    setContent("");

    try {
      const res = await fetch("/api/ai/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, documentType: type })
      });

      if (!res.ok) throw new Error("Error generating document");

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              const text = parsed.choices?.[0]?.delta?.content || "";
              fullContent += text;
              setContent(fullContent);
            } catch (e) {
              // Skip
            }
          }
        }
      }
    } catch (error) {
      console.error("Document generation error:", error);
      setContent("Error al generar el documento. Por favor inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [content]);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedType || "document"}_${new Date().toISOString().split("T")[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-800 text-white">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-800">Generador de Documentos</h2>
              <p className="text-sm text-slate-500">Crea documentos profesionales con IA</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {!selectedType ? (
          /* Document Type Selection */
          <div className="p-6">
            <p className="mb-4 text-sm text-slate-500">Selecciona el tipo de documento a generar:</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {(Object.entries(documentConfig) as [DocumentType, typeof documentConfig[DocumentType]][]).map(([type, config]) => {
                const DocIcon = config.icon;
                return (
                  <button
                    key={type}
                    onClick={() => generate(type)}
                    className="flex items-start gap-4 rounded-xl border border-slate-200 p-4 text-left transition-all hover:border-slate-300 hover:bg-slate-50"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                      <DocIcon className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="font-medium text-slate-800">{config.title}</h4>
                      <p className="mt-1 text-sm text-slate-500">{config.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          /* Document Content */
          <>
            <div 
              ref={contentRef}
              className="flex-1 overflow-y-auto p-6"
            >
              <div className="mb-4">
                <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">
                  {documentConfig[selectedType].title}
                </span>
              </div>
              
              {loading && !content && (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <Loader2 className="mx-auto h-8 w-8 animate-spin text-slate-500" />
                    <p className="mt-3 text-sm text-slate-500">Generando documento...</p>
                    <p className="mt-1 text-xs text-slate-400">Esto puede tomar un minuto</p>
                  </div>
                </div>
              )}
              
              {content && (
                <div className="prose prose-sm max-w-none text-slate-700 whitespace-pre-wrap">
                  {content}
                  {loading && <span className="inline-block w-2 h-4 bg-slate-500 animate-pulse ml-1" />}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4">
              <button
                onClick={() => { setSelectedType(null); setContent(""); }}
                className="text-sm text-slate-500 hover:text-slate-700"
              >
                ← Cambiar tipo de documento
              </button>
              <div className="flex gap-2">
                <button
                  onClick={handleCopy}
                  disabled={!content || loading}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  {copied ? "Copiado" : "Copiar"}
                </button>
                <button
                  onClick={handleDownload}
                  disabled={!content || loading}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  <Download className="h-4 w-4" />
                  Descargar
                </button>
                <button
                  onClick={() => generate(selectedType)}
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Regenerar
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
