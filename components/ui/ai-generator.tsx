"use client";

import { useState, useRef, useEffect } from "react";
import { X, Sparkles, Copy, Check, Download, FileText, BarChart3, Target, Users, Briefcase } from "lucide-react";

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
      setContent("Error al generar el contenido. Inténtalo de nuevo.");
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ql-charcoal/60 p-4">
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-lg bg-white">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ql-sand/20 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-ql-accent/10">
              <Icon className="h-5 w-5 text-ql-accent" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-sm font-medium text-ql-charcoal">{config.title}</p>
              <p className="ql-caption normal-case tracking-normal">{config.description}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-ql-muted hover:text-ql-slate transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div
          ref={contentRef}
          className="flex-1 overflow-y-auto p-6"
        >
          {loading && !content && (
            <div className="flex flex-col items-center justify-center gap-2 py-12">
              <span className="ql-status-thinking" />
              <span className="ql-loading">Generando análisis con IA...</span>
            </div>
          )}

          {content && (
            <div className="ql-body whitespace-pre-wrap">
              {content}
              {loading && <span className="ql-status-thinking ml-2" />}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between border-t border-ql-sand/20 px-6 py-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-ql-accent" strokeWidth={1.5} />
            <span className="ql-caption normal-case tracking-normal">Generado con IA</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              disabled={!content || loading}
              className="ql-btn-secondary disabled:opacity-50"
            >
              {copied ? <Check className="h-4 w-4 text-ql-success" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copiado" : "Copiar"}
            </button>
            <button
              onClick={() => generate()}
              disabled={loading}
              className="ql-btn-primary disabled:opacity-50"
            >
              {loading ? <span className="ql-status-thinking" /> : <Sparkles className="h-4 w-4" />}
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
      setContent("Error al generar el documento. Inténtalo de nuevo.");
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ql-charcoal/60 p-4">
      <div className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-lg bg-white">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ql-sand/20 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-ql-charcoal">
              <FileText className="h-5 w-5 text-white" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-sm font-medium text-ql-charcoal">Generador de Documentos</p>
              <p className="ql-caption normal-case tracking-normal">Crea documentos profesionales con IA</p>
            </div>
          </div>
          <button onClick={onClose} className="text-ql-muted hover:text-ql-slate transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {!selectedType ? (
          /* Document Type Selection */
          <div className="p-6">
            <p className="ql-body mb-4">Selecciona el tipo de documento a generar:</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {(Object.entries(documentConfig) as [DocumentType, typeof documentConfig[DocumentType]][]).map(([type, config]) => {
                const DocIcon = config.icon;
                return (
                  <button
                    key={type}
                    onClick={() => generate(type)}
                    className="ql-card group flex items-start gap-4 text-left"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-ql-cream">
                      <DocIcon className="h-5 w-5 text-ql-slate" strokeWidth={1.5} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-ql-charcoal">{config.title}</p>
                      <p className="ql-body mt-0.5">{config.description}</p>
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
                <span className="ql-badge-default">{documentConfig[selectedType].title}</span>
              </div>

              {loading && !content && (
                <div className="flex flex-col items-center gap-2 justify-center py-12">
                  <span className="ql-status-thinking" />
                  <span className="ql-loading">Generando documento...</span>
                  <span className="ql-caption normal-case tracking-normal italic">Esto puede tomar un minuto</span>
                </div>
              )}

              {content && (
                <div className="ql-body whitespace-pre-wrap">
                  {content}
                  {loading && <span className="ql-status-thinking ml-2" />}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between border-t border-ql-sand/20 px-6 py-4">
              <button
                onClick={() => { setSelectedType(null); setContent(""); }}
                className="ql-btn-ghost text-sm"
              >
                Cambiar tipo de documento
              </button>
              <div className="flex gap-2">
                <button
                  onClick={handleCopy}
                  disabled={!content || loading}
                  className="ql-btn-secondary disabled:opacity-50"
                >
                  {copied ? <Check className="h-4 w-4 text-ql-success" /> : <Copy className="h-4 w-4" />}
                  {copied ? "Copiado" : "Copiar"}
                </button>
                <button
                  onClick={handleDownload}
                  disabled={!content || loading}
                  className="ql-btn-secondary disabled:opacity-50"
                >
                  <Download className="h-4 w-4" />
                  Descargar
                </button>
                <button
                  onClick={() => generate(selectedType)}
                  disabled={loading}
                  className="ql-btn-primary disabled:opacity-50"
                >
                  {loading ? <span className="ql-status-thinking" /> : <Sparkles className="h-4 w-4" />}
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
