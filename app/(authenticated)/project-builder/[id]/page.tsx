"use client";

/**
 * =============================================================================
 * STRATEGIC PM LAB V2 - PROJECT BUILDER
 * =============================================================================
 * DEPLOYMENT VERIFICATION: STRATEGIC_LAB_V2_ACTIVE
 * 
 * FEATURES:
 * - Botones FUCSIA "Consultar con el PM" por cada campo
 * - Botones AZUL "Validar Campo" por cada sección
 * - Sistema de semáforos controlado SOLO por IA
 * - NO hay controles manuales de completado
 * - Validación "No Bananas": mínimo 25 palabras, datos específicos
 * - Milestones inteligentes generados por IA
 * =============================================================================
 */

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Header } from "@/components/ui/header";
import { ContentGallery } from "@/components/ui/content-gallery";
import { IdeaForm } from "@/components/ui/idea-form";
import { AIGenerator, DocumentGenerator } from "@/components/ui/ai-generator";
import {
  ArrowLeft,
  Check,
  Loader2,
  Save,
  Lightbulb,
  Users,
  DollarSign,
  Target,
  BarChart3,
  Plus,
  FileText,
  Wand2,
  MessageSquare,
  ShieldCheck,
  AlertCircle,
  Flag,
  Sparkles,
  ChevronDown,
  ChevronUp,
  X
} from "lucide-react";
import Link from "next/link";
import { PROJECT_TYPES, PROJECT_TYPE_ORDER, ProjectType } from "@/lib/project-types";

// =============================================================================
// DEPLOYMENT VERIFICATION - PRUEBA DE VIDA
// =============================================================================
console.log('STRATEGIC_LAB_V2_ACTIVE');

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================
interface MilestoneItem {
  id: string;
  title: string;
  description?: string | null;
  isCompleted: boolean;
  order: number;
}

interface Project {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  projectType: string;
  currentStep: number;
  progress: number;
  concept?: string | null;
  problemSolved?: string | null;
  targetMarket?: string | null;
  marketValidation?: string | null;
  businessModel?: string | null;
  valueProposition?: string | null;
  actionPlan?: string | null;
  milestones?: string | null;
  resources?: string | null;
  metrics?: string | null;
  conceptStatus?: 'RED' | 'YELLOW' | 'GREEN';
  marketStatus?: 'RED' | 'YELLOW' | 'GREEN';
  businessStatus?: 'RED' | 'YELLOW' | 'GREEN';
  executionStatus?: 'RED' | 'YELLOW' | 'GREEN';
  milestoneItems: MilestoneItem[];
}

type GeneratorType = "competitor_analysis" | "business_model_suggestions" | "action_plan" | "market_validation";
type SectionStatus = 'RED' | 'YELLOW' | 'GREEN';

// =============================================================================
// STEP DEFINITIONS WITH STATUS MAPPING
// =============================================================================
const steps = [
  {
    number: 1,
    title: "Definición del Concepto",
    icon: Lightbulb,
    description: "¿Qué problema resuelve?",
    statusField: 'conceptStatus' as const,
    aiStage: 'concepto',
    fields: [
      { key: "concept", label: "Concepto Principal", placeholder: "Describe tu idea con datos específicos: problema, solución, diferenciador..." },
      { key: "problemSolved", label: "Problema que Resuelve", placeholder: "¿Qué dolor específico atiendes? Incluye datos: # usuarios afectados, costo del problema..." }
    ]
  },
  {
    number: 2,
    title: "Validación de Mercado",
    icon: Users,
    description: "¿Quién lo necesita?",
    statusField: 'marketStatus' as const,
    aiStage: 'mercado',
    fields: [
      { key: "targetMarket", label: "Mercado Objetivo", placeholder: "Define tu TAM/SAM/SOM, ICP (Ideal Customer Profile), segmentación..." },
      { key: "marketValidation", label: "Validación", placeholder: "Evidencia: # entrevistas, encuestas, pilotos, willingness-to-pay..." }
    ]
  },
  {
    number: 3,
    title: "Modelo de Negocio",
    icon: DollarSign,
    description: "¿Cómo genera valor?",
    statusField: 'businessStatus' as const,
    aiStage: 'negocio',
    fields: [
      { key: "businessModel", label: "Modelo de Monetización", placeholder: "Unit economics: CAC, LTV, pricing, revenue model..." },
      { key: "valueProposition", label: "Propuesta de Valor", placeholder: "Diferenciador vs 5+ competidores, defensibilidad, moat..." }
    ]
  },
  {
    number: 4,
    title: "Plan de Acción",
    icon: Target,
    description: "¿Cómo lo ejecuto?",
    statusField: 'executionStatus' as const,
    aiStage: 'ejecucion',
    fields: [
      { key: "actionPlan", label: "Pasos Inmediatos", placeholder: "MVP scope (<3 meses), recursos, budget, risk matrix..." },
      { key: "milestones", label: "Hitos Clave", placeholder: "Milestones con fechas, KPIs de éxito, métricas de validación..." }
    ]
  },
  {
    number: 5,
    title: "Recursos y Métricas",
    icon: BarChart3,
    description: "¿Qué necesito?",
    statusField: null,
    aiStage: null,
    fields: [
      { key: "resources", label: "Recursos Necesarios", placeholder: "Team, presupuesto detallado, herramientas, conocimientos..." },
      { key: "metrics", label: "Métricas de Éxito", placeholder: "KPIs claros, benchmarks, milestones medibles..." }
    ]
  }
];

// =============================================================================
// "NO BANANAS" VALIDATION - STRICT
// =============================================================================
const validateNoBananas = (text: string): { valid: boolean; message: string } => {
  if (!text || text.trim().length === 0) {
    return { valid: false, message: "El campo está vacío" };
  }
  
  const words = text.trim().split(/\s+/).length;
  if (words < 25) {
    return { 
      valid: false, 
      message: `Contenido insuficiente: ${words}/25 palabras mínimas. Añade más detalles específicos.` 
    };
  }
  
  // Patrones vagos que activan el filtro
  const vaguePatterns = [
    /^bananas?$/i,
    /^test$/i,
    /^prueba$/i,
    /^asdf/i,
    /^lorem ipsum/i,
    /muchos? (clientes?|usuarios?|personas?)/i,
    /todo el mundo/i,
    /gran potencial/i,
    /obvio que/i,
    /muy f[aá]cil/i
  ];
  
  if (vaguePatterns.some(p => p.test(text))) {
    return { 
      valid: false, 
      message: "⚠️ Contenido genérico detectado. Necesitas datos específicos, métricas y evidencia empírica." 
    };
  }
  
  return { valid: true, message: "" };
};

// =============================================================================
// CONSULTATION PANEL COMPONENT
// =============================================================================
function ConsultationPanel({ 
  isOpen, 
  onClose, 
  fieldLabel,
  content,
  projectId,
  stage
}: { 
  isOpen: boolean; 
  onClose: () => void;
  fieldLabel: string;
  content: string;
  projectId: string;
  stage: string;
}) {
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleConsult = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/pm/consult', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          field: stage,
          currentContent: content
        })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error en la consulta');
      setResponse(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && content) {
      handleConsult();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="mt-3 rounded-lg border-2 border-fuchsia-200 bg-fuchsia-50 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-fuchsia-600" />
          <span className="font-semibold text-fuchsia-800">Consulta PM: {fieldLabel}</span>
        </div>
        <button onClick={onClose} className="text-fuchsia-400 hover:text-fuchsia-600">
          <X className="h-4 w-4" />
        </button>
      </div>
      
      {loading && (
        <div className="flex items-center gap-2 text-fuchsia-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Analizando con McKinsey + Sequoia + Innovation Expert...</span>
        </div>
      )}
      
      {error && (
        <div className="rounded-lg bg-red-100 p-3 text-red-700 text-sm">
          <AlertCircle className="inline h-4 w-4 mr-1" />
          {error}
        </div>
      )}
      
      {response && !loading && (
        <div className="space-y-3">
          {response.noBananasViolation && (
            <div className="rounded-lg bg-amber-100 p-3 text-amber-800 text-sm">
              <AlertCircle className="inline h-4 w-4 mr-1" />
              <strong>Filtro "No Bananas":</strong> {response.message}
              {response.requiredData && (
                <ul className="mt-2 list-disc list-inside">
                  {response.requiredData.map((d: string, i: number) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          
          {response.suggestion && (
            <div className="rounded-lg bg-white p-3 border border-fuchsia-200">
              <h4 className="font-medium text-fuchsia-700 mb-1">💡 Sugerencia Estratégica</h4>
              <p className="text-sm text-slate-700">{response.suggestion}</p>
            </div>
          )}
          
          {response.analysis && (
            <div className="grid grid-cols-2 gap-2">
              {response.analysis.strengths?.length > 0 && (
                <div className="rounded bg-green-50 p-2 text-xs">
                  <strong className="text-green-700">Fortalezas:</strong>
                  <ul className="mt-1 text-green-600">{response.analysis.strengths.map((s: string, i: number) => <li key={i}>• {s}</li>)}</ul>
                </div>
              )}
              {response.analysis.weaknesses?.length > 0 && (
                <div className="rounded bg-red-50 p-2 text-xs">
                  <strong className="text-red-700">Debilidades:</strong>
                  <ul className="mt-1 text-red-600">{response.analysis.weaknesses.map((s: string, i: number) => <li key={i}>• {s}</li>)}</ul>
                </div>
              )}
            </div>
          )}
          
          {response.alternatives?.length > 0 && (
            <div className="rounded-lg bg-blue-50 p-3">
              <h4 className="font-medium text-blue-700 mb-1">🔄 Alternativas Propuestas</h4>
              <ul className="text-sm text-blue-600 space-y-1">
                {response.alternatives.map((alt: string, i: number) => <li key={i}>• {alt}</li>)}
              </ul>
            </div>
          )}
          
          {response.nextQuestion && (
            <div className="rounded-lg bg-purple-50 p-3 text-sm text-purple-700">
              <strong>❓ Siguiente pregunta crítica:</strong> {response.nextQuestion}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// VALIDATION RESULT PANEL
// =============================================================================
function ValidationPanel({ 
  isOpen, 
  onClose, 
  validation,
  loading 
}: { 
  isOpen: boolean; 
  onClose: () => void;
  validation: any;
  loading: boolean;
}) {
  if (!isOpen) return null;

  return (
    <div className="mt-3 rounded-lg border-2 border-blue-200 bg-blue-50 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-blue-600" />
          <span className="font-semibold text-blue-800">Resultado de Validación</span>
        </div>
        <button onClick={onClose} className="text-blue-400 hover:text-blue-600">
          <X className="h-4 w-4" />
        </button>
      </div>
      
      {loading && (
        <div className="flex items-center gap-2 text-blue-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Validando con panel de expertos...</span>
        </div>
      )}
      
      {validation && !loading && (
        <div className="space-y-3">
          <div className={`flex items-center gap-2 rounded-lg p-3 ${
            validation.status === 'GREEN' ? 'bg-green-100 text-green-800' :
            validation.status === 'YELLOW' ? 'bg-yellow-100 text-yellow-800' :
            'bg-red-100 text-red-800'
          }`}>
            <span className={`h-4 w-4 rounded-full ${
              validation.status === 'GREEN' ? 'bg-green-500' :
              validation.status === 'YELLOW' ? 'bg-yellow-500' :
              'bg-red-500'
            }`} />
            <strong>Estado: {validation.status}</strong>
          </div>
          
          {validation.feedback && (
            <div className="rounded-lg bg-white p-3 border border-blue-200">
              <p className="text-sm text-slate-700">{validation.feedback}</p>
            </div>
          )}
          
          {validation.criteriaResults && (
            <div className="space-y-1">
              <h4 className="font-medium text-blue-700 text-sm">Criterios Evaluados:</h4>
              {validation.criteriaResults.map((cr: any, i: number) => (
                <div key={i} className={`flex items-center gap-2 text-xs p-1 rounded ${cr.met ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  {cr.met ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                  <span>{cr.criterion}</span>
                </div>
              ))}
            </div>
          )}
          
          {validation.blockers?.length > 0 && (
            <div className="rounded-lg bg-red-50 p-3">
              <h4 className="font-medium text-red-700 mb-1">⚠️ Bloqueos Detectados</h4>
              <ul className="text-sm text-red-600 space-y-1">
                {validation.blockers.map((b: string, i: number) => <li key={i}>• {b}</li>)}
              </ul>
            </div>
          )}
          
          {validation.killSwitch?.active && (
            <div className="rounded-lg bg-red-200 p-3 border-2 border-red-500">
              <h4 className="font-bold text-red-800">🚨 KILL SWITCH ACTIVADO</h4>
              <p className="text-sm text-red-700 mt-1">{validation.killSwitch.reason}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// TRAFFIC LIGHT COMPONENT
// =============================================================================
function TrafficLight({ status }: { status: SectionStatus | undefined }) {
  const color = status === 'GREEN' ? 'bg-green-500' : 
                status === 'YELLOW' ? 'bg-yellow-500' : 
                'bg-slate-400';
  const label = status === 'GREEN' ? 'Validado por IA' :
                status === 'YELLOW' ? 'En Progreso' :
                'Sin Validar';
  
  return (
    <div className="flex items-center gap-2">
      <span className={`h-4 w-4 rounded-full ${color} shadow-lg`} />
      <span className={`text-xs font-medium ${
        status === 'GREEN' ? 'text-green-700' :
        status === 'YELLOW' ? 'text-yellow-700' :
        'text-slate-500'
      }`}>{label}</span>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================
export default function ProjectDetailPage() {
  // Deployment verification
  console.log('STRATEGIC_LAB_V2_ACTIVE');
  
  const params = useParams();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showDocGenerator, setShowDocGenerator] = useState(false);
  const [activeAIGenerator, setActiveAIGenerator] = useState<GeneratorType | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [milestones, setMilestones] = useState<MilestoneItem[]>([]);
  const [changingType, setChangingType] = useState(false);
  
  // Consultation states (per field)
  const [openConsultations, setOpenConsultations] = useState<Record<string, boolean>>({});
  
  // Validation states (per step)
  const [validating, setValidating] = useState<Record<number, boolean>>({});
  const [validationResults, setValidationResults] = useState<Record<number, any>>({});
  const [showValidation, setShowValidation] = useState<Record<number, boolean>>({});
  
  // Milestone generation
  const [generatingMilestones, setGeneratingMilestones] = useState(false);
  const [aiMilestones, setAiMilestones] = useState<any[]>([]);
  const [showAiMilestones, setShowAiMilestones] = useState(false);

  useEffect(() => {
    fetchProject();
  }, [params?.id]);

  const fetchProject = async () => {
    try {
      const res = await fetch(`/api/projects/${params?.id}`);
      if (!res.ok) {
        router.push("/project-builder");
        return;
      }
      const data = await res.json();
      setProject(data?.project);
      setMilestones(data?.project?.milestoneItems ?? []);
      
      const initialData: Record<string, string> = {};
      steps.forEach((step) => {
        step.fields.forEach((field) => {
          initialData[field.key] = data?.project?.[field.key as keyof Project] as string || "";
        });
      });
      setFormData(initialData);
    } catch (error) {
      console.error("Error fetching project:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleFieldChange = (key: string, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!project) return;
    setSaving(true);

    // Calculate progress based on validated sections (GREEN status)
    const validatedSteps = steps.filter(step => {
      if (!step.statusField) return false;
      return project[step.statusField] === 'GREEN';
    }).length;
    const progress = Math.round((validatedSteps / 4) * 100);

    try {
      await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          progress
        })
      });
      setProject((prev) => prev ? { ...prev, progress } : null);
    } catch (error) {
      console.error("Error saving project:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleValidateSection = async (stepNumber: number, stage: string | null) => {
    if (!project || !stage) return;
    
    // Collect content from all fields in this step
    const step = steps.find(s => s.number === stepNumber);
    if (!step) return;
    
    const content = step.fields.map(f => `${f.label}: ${formData[f.key] || ''}`).join('\n\n');
    
    // Validate "No Bananas" first
    const validation = validateNoBananas(content);
    if (!validation.valid) {
      setValidationResults(prev => ({
        ...prev,
        [stepNumber]: {
          status: 'RED',
          feedback: validation.message,
          blockers: ['Contenido no cumple con los requisitos mínimos']
        }
      }));
      setShowValidation(prev => ({ ...prev, [stepNumber]: true }));
      return;
    }
    
    setValidating(prev => ({ ...prev, [stepNumber]: true }));
    setShowValidation(prev => ({ ...prev, [stepNumber]: true }));
    
    try {
      const res = await fetch('/api/pm/validate-field', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          field: stage,
          content
        })
      });
      
      const data = await res.json();
      setValidationResults(prev => ({ ...prev, [stepNumber]: data }));
      
      // Refresh project to get updated status
      if (data.status === 'GREEN' || data.status === 'YELLOW') {
        fetchProject();
      }
    } catch (error) {
      console.error("Validation error:", error);
      setValidationResults(prev => ({
        ...prev,
        [stepNumber]: { status: 'RED', feedback: 'Error en la validación' }
      }));
    } finally {
      setValidating(prev => ({ ...prev, [stepNumber]: false }));
    }
  };

  const handleGenerateMilestones = async () => {
    if (!project) return;
    setGeneratingMilestones(true);
    
    try {
      const res = await fetch('/api/milestones/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          projectData: formData
        })
      });
      
      if (res.ok) {
        const data = await res.json();
        setAiMilestones(data.milestones || []);
        setShowAiMilestones(true);
      }
    } catch (error) {
      console.error("Error generating milestones:", error);
    } finally {
      setGeneratingMilestones(false);
    }
  };

  const handleAddAiMilestone = async (title: string) => {
    if (!project) return;
    try {
      const res = await fetch(`/api/projects/${project.id}/milestones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title })
      });
      if (res.ok) {
        const data = await res.json();
        setMilestones((prev) => [...prev, data.milestone]);
        setAiMilestones(prev => prev.filter(m => m.title !== title));
      }
    } catch (error) {
      console.error("Error adding milestone:", error);
    }
  };

  const handleChangeProjectType = async (newType: ProjectType) => {
    if (!project || changingType) return;
    setChangingType(true);
    try {
      await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectType: newType })
      });
      setProject((prev) => prev ? { ...prev, projectType: newType } : null);
    } catch (error) {
      console.error("Error changing project type:", error);
    } finally {
      setChangingType(false);
    }
  };

  const toggleConsultation = (fieldKey: string) => {
    setOpenConsultations(prev => ({ ...prev, [fieldKey]: !prev[fieldKey] }));
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (!project) return null;

  const currentType = (project.projectType || "idea") as ProjectType;
  const typeInfo = PROJECT_TYPES[currentType];

  return (
    <div className="min-h-screen bg-slate-50">
      <Header title={project.title} />

      <div className="p-6 space-y-6">
        {/* Back & Actions */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/project-builder"
            className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver a proyectos
          </Link>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setActiveAIGenerator("competitor_analysis")}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              <Users className="h-4 w-4" />
              Análisis Competencia
            </button>
            <button
              onClick={() => setShowDocGenerator(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100"
            >
              <FileText className="h-4 w-4" />
              Generar Documentos
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:bg-slate-300"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Guardar
            </button>
          </div>
        </div>

        {/* Project Type Selector */}
        <div className="rounded-xl bg-white p-4 shadow-sm border border-slate-200">
          <div className="mb-3 flex items-center gap-2">
            <Flag className="h-4 w-4 text-slate-500" />
            <span className="text-sm font-semibold text-slate-700">Tipo de Proyecto</span>
            {changingType && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
          </div>
          <div className="flex flex-wrap gap-2">
            {PROJECT_TYPE_ORDER.map((type) => {
              const info = PROJECT_TYPES[type];
              const isSelected = currentType === type;
              return (
                <button
                  key={type}
                  onClick={() => handleChangeProjectType(type)}
                  disabled={changingType}
                  className={`inline-flex items-center gap-2 rounded-lg border-2 px-3 py-1.5 text-sm font-medium transition-all disabled:opacity-60 ${
                    isSelected
                      ? `${info.borderColor} ${info.bgColor} ${info.color}`
                      : "border-slate-100 bg-white text-slate-500 hover:border-slate-200"
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${info.dotColor}`} />
                  {info.label}
                  {isSelected && <Check className="h-3.5 w-3.5" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Progress Overview with Traffic Lights */}
        <div className="rounded-xl bg-white p-4 shadow-sm border border-slate-200">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">Estado de Validación IA</span>
            <span className="text-xs text-slate-500">Los semáforos se actualizan SOLO con validación de IA</span>
          </div>
          <div className="grid grid-cols-4 gap-4">
            {steps.slice(0, 4).map((step) => (
              <div key={step.number} className={`rounded-lg border p-3 ${
                project[step.statusField!] === 'GREEN' ? 'border-green-300 bg-green-50' :
                project[step.statusField!] === 'YELLOW' ? 'border-yellow-300 bg-yellow-50' :
                'border-slate-200 bg-slate-50'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  <step.icon className={`h-4 w-4 ${
                    project[step.statusField!] === 'GREEN' ? 'text-green-600' :
                    project[step.statusField!] === 'YELLOW' ? 'text-yellow-600' :
                    'text-slate-400'
                  }`} />
                  <span className="text-xs font-medium text-slate-700">{step.title.split(' ')[0]}</span>
                </div>
                <TrafficLight status={project[step.statusField!]} />
              </div>
            ))}
          </div>
        </div>

        {/* Milestones Section with AI Generation */}
        <div className="rounded-xl bg-white shadow-sm border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-gradient-to-r from-purple-50 to-fuchsia-50">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-100 border border-purple-200">
                <Flag className="h-4 w-4 text-purple-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800">Milestones Inteligentes</h3>
                <p className="text-xs text-slate-500">
                  {milestones.filter(m => m.isCompleted).length}/{milestones.length} completados
                </p>
              </div>
            </div>
            <button
              onClick={handleGenerateMilestones}
              disabled={generatingMilestones}
              className="inline-flex items-center gap-2 rounded-lg bg-fuchsia-600 px-4 py-2 text-sm font-medium text-white hover:bg-fuchsia-500 disabled:opacity-50"
            >
              {generatingMilestones ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Generar con IA
            </button>
          </div>

          <div className="p-4 space-y-3">
            {/* AI Generated Milestones */}
            {showAiMilestones && aiMilestones.length > 0 && (
              <div className="rounded-lg border-2 border-dashed border-fuchsia-300 p-4 bg-fuchsia-50">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-fuchsia-700 flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    Sugeridos por IA
                  </h4>
                  <button onClick={() => setShowAiMilestones(false)} className="text-fuchsia-400 hover:text-fuchsia-600">
                    <ChevronUp className="h-4 w-4" />
                  </button>
                </div>
                <div className="space-y-2">
                  {aiMilestones.map((m, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg bg-white p-3 border border-fuchsia-200">
                      <span className="text-sm text-slate-700">{m.title}</span>
                      <button
                        onClick={() => handleAddAiMilestone(m.title)}
                        className="inline-flex items-center gap-1 rounded bg-fuchsia-600 px-2 py-1 text-xs font-medium text-white hover:bg-fuchsia-500"
                      >
                        <Plus className="h-3 w-3" />
                        Agregar
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Existing Milestones (Read-only display) */}
            {milestones.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-400">
                No hay milestones. Usa "Generar con IA" para obtener sugerencias.
              </p>
            ) : (
              milestones.map((milestone) => (
                <div
                  key={milestone.id}
                  className={`flex items-center gap-3 rounded-lg border p-3 ${
                    milestone.isCompleted ? 'border-green-200 bg-green-50' : 'border-slate-100'
                  }`}
                >
                  <span className={`h-3 w-3 rounded-full ${milestone.isCompleted ? 'bg-green-500' : 'bg-slate-300'}`} />
                  <span className={`flex-1 text-sm ${milestone.isCompleted ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                    {milestone.title}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Steps Content - Strategic PM Lab */}
        <div className="space-y-4">
          {steps.map((step) => {
            const stepStatus = step.statusField ? project[step.statusField] : undefined;
            
            return (
              <div
                key={step.number}
                className="rounded-xl bg-white shadow-sm border border-slate-200 overflow-hidden"
              >
                {/* Step Header with Traffic Light */}
                <div className={`flex items-center gap-4 p-4 border-b border-slate-100 ${
                  stepStatus === 'GREEN' ? 'bg-green-50' :
                  stepStatus === 'YELLOW' ? 'bg-yellow-50' : ''
                }`}>
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                    stepStatus === 'GREEN' ? 'bg-green-100 text-green-600' :
                    stepStatus === 'YELLOW' ? 'bg-yellow-100 text-yellow-600' :
                    'bg-slate-100 text-slate-600'
                  }`}>
                    <step.icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-slate-800">
                      Paso {step.number}: {step.title}
                    </h3>
                    <p className="text-sm text-slate-500">{step.description}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {step.statusField && (
                      <TrafficLight status={stepStatus} />
                    )}
                    {step.aiStage && (
                      <button
                        onClick={() => handleValidateSection(step.number, step.aiStage)}
                        disabled={validating[step.number]}
                        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                      >
                        {validating[step.number] ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ShieldCheck className="h-4 w-4" />
                        )}
                        Validar Campo
                      </button>
                    )}
                  </div>
                </div>

                {/* Validation Result Panel */}
                {showValidation[step.number] && (
                  <ValidationPanel
                    isOpen={showValidation[step.number]}
                    onClose={() => setShowValidation(prev => ({ ...prev, [step.number]: false }))}
                    validation={validationResults[step.number]}
                    loading={validating[step.number]}
                  />
                )}

                {/* Step Fields with Individual Consult Buttons */}
                <div className="p-4 space-y-4">
                  {step.fields.map((field) => (
                    <div key={field.key}>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-sm font-medium text-slate-700">
                          {field.label}
                        </label>
                        {/* BOTÓN FUCSIA - Consultar con el PM */}
                        {step.aiStage && (
                          <button
                            onClick={() => toggleConsultation(field.key)}
                            className="inline-flex items-center gap-1 rounded-lg bg-fuchsia-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-fuchsia-500"
                          >
                            <MessageSquare className="h-3 w-3" />
                            Consultar con el PM
                          </button>
                        )}
                      </div>
                      <textarea
                        value={formData[field.key] || ""}
                        onChange={(e) => handleFieldChange(field.key, e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
                        placeholder={field.placeholder}
                        rows={3}
                      />
                      {/* Word count indicator */}
                      <div className="mt-1 flex justify-end">
                        <span className={`text-xs ${
                          (formData[field.key]?.trim().split(/\s+/).length || 0) >= 25 
                            ? 'text-green-600' 
                            : 'text-slate-400'
                        }`}>
                          {formData[field.key]?.trim().split(/\s+/).filter(w => w).length || 0} palabras
                          {(formData[field.key]?.trim().split(/\s+/).filter(w => w).length || 0) < 25 && ' (mín. 25)'}
                        </span>
                      </div>
                      
                      {/* Consultation Panel */}
                      {step.aiStage && (
                        <ConsultationPanel
                          isOpen={openConsultations[field.key] || false}
                          onClose={() => setOpenConsultations(prev => ({ ...prev, [field.key]: false }))}
                          fieldLabel={field.label}
                          content={formData[field.key] || ''}
                          projectId={project.id}
                          stage={step.aiStage}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Associated Content */}
        <div className="rounded-xl bg-white p-4 shadow-sm border border-slate-200">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-slate-800">Contenido Asociado</h3>
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-200"
            >
              <Plus className="h-4 w-4" />
              Agregar
            </button>
          </div>
          <ContentGallery projectId={project.id} />
        </div>
      </div>

      {/* Add Content Form */}
      {showForm && (
        <IdeaForm
          onClose={() => setShowForm(false)}
          onSuccess={() => {}}
          projectId={project.id}
        />
      )}

      {/* AI Generator */}
      {activeAIGenerator && (
        <AIGenerator
          projectId={project.id}
          type={activeAIGenerator}
          onClose={() => setActiveAIGenerator(null)}
        />
      )}

      {/* Document Generator */}
      {showDocGenerator && (
        <DocumentGenerator
          projectId={project.id}
          onClose={() => setShowDocGenerator(false)}
        />
      )}
    </div>
  );
}
