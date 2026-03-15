"use client";

/**
 * =============================================================================
 * STRATEGIC PM LAB V2 - PROJECT BUILDER
 * =============================================================================
 * DEPLOYMENT VERIFICATION: STRATEGIC_LAB_V2_ACTIVE
 *
 * FEATURES:
 * - Botones "Consultar con el PM" por cada campo
 * - Botones "Validar Campo" por cada sección
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
import {
  ArrowLeft,
  Check,
  Save,
  Lightbulb,
  Users,
  DollarSign,
  Target,
  BarChart3,
  Plus,
  MessageSquare,
  ShieldCheck,
  AlertCircle,
  Flag,
  Sparkles,
  ChevronUp,
  Swords,
  X
} from "lucide-react";
import Link from "next/link";
import { PROJECT_TYPES, PROJECT_TYPE_ORDER, ProjectType } from "@/lib/project-types";

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
      message: "Contenido genérico detectado. Necesitas datos específicos, métricas y evidencia empírica."
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
    <div className="mt-3 rounded-md border border-ql-accent/30 bg-ql-accent/5 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-ql-accent" strokeWidth={1.5} />
          <span className="text-sm font-medium text-ql-charcoal">Consulta PM: {fieldLabel}</span>
        </div>
        <button onClick={onClose} className="text-ql-muted hover:text-ql-slate transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-2">
          <span className="ql-status-thinking" />
          <span className="ql-loading">Analizando con McKinsey + Sequoia + Innovation Expert...</span>
        </div>
      )}

      {error && (
        <div className="rounded-md bg-ql-danger/5 border border-ql-danger/20 p-3 text-sm text-ql-danger">
          <AlertCircle className="inline h-4 w-4 mr-1" />
          {error}
        </div>
      )}

      {response && !loading && (
        <div className="space-y-3">
          {response.noBananasViolation && (
            <div className="rounded-md bg-ql-warning/5 border border-ql-warning/20 p-3 text-sm text-ql-warning">
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
            <div className="ql-card-flat p-3 space-y-1">
              <p className="ql-label">Sugerencia Estratégica</p>
              <p className="ql-body">{response.suggestion}</p>
            </div>
          )}

          {response.analysis && (
            <div className="grid grid-cols-2 gap-2">
              {response.analysis.strengths?.length > 0 && (
                <div className="rounded-md bg-ql-success/5 p-2 text-xs">
                  <strong className="text-ql-success">Fortalezas:</strong>
                  <ul className="mt-1 text-ql-success/80">{response.analysis.strengths.map((s: string, i: number) => <li key={i}>• {s}</li>)}</ul>
                </div>
              )}
              {response.analysis.weaknesses?.length > 0 && (
                <div className="rounded-md bg-ql-danger/5 p-2 text-xs">
                  <strong className="text-ql-danger">Debilidades:</strong>
                  <ul className="mt-1 text-ql-danger/80">{response.analysis.weaknesses.map((s: string, i: number) => <li key={i}>• {s}</li>)}</ul>
                </div>
              )}
            </div>
          )}

          {response.alternatives?.length > 0 && (
            <div className="ql-card-flat p-3">
              <p className="ql-label mb-1">Alternativas Propuestas</p>
              <ul className="ql-body space-y-1">
                {response.alternatives.map((alt: string, i: number) => <li key={i}>• {alt}</li>)}
              </ul>
            </div>
          )}

          {response.nextQuestion && (
            <div className="rounded-md border-l-2 border-ql-accent pl-3 py-2">
              <p className="ql-label mb-0.5">Siguiente pregunta crítica</p>
              <p className="ql-body">{response.nextQuestion}</p>
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
    <div className="mt-3 rounded-md border border-ql-charcoal/10 bg-ql-cream p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-ql-charcoal" strokeWidth={1.5} />
          <span className="text-sm font-medium text-ql-charcoal">Resultado de Validación</span>
        </div>
        <button onClick={onClose} className="text-ql-muted hover:text-ql-slate transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-2">
          <span className="ql-status-thinking" />
          <span className="ql-loading">Validando con panel de expertos...</span>
        </div>
      )}

      {validation && !loading && (
        <div className="space-y-3">
          <div className={`flex items-center gap-2 rounded-md p-3 ${
            validation.status === 'GREEN' ? 'bg-ql-success/10 text-ql-success' :
            validation.status === 'YELLOW' ? 'bg-ql-warning/10 text-ql-warning' :
            'bg-ql-danger/10 text-ql-danger'
          }`}>
            <span className={`h-3 w-3 rounded-full ${
              validation.status === 'GREEN' ? 'bg-ql-success' :
              validation.status === 'YELLOW' ? 'bg-ql-warning' :
              'bg-ql-danger'
            }`} />
            <strong className="text-sm">Estado: {validation.status}</strong>
          </div>

          {validation.feedback && (
            <div className="ql-card p-3">
              <p className="ql-body">{validation.feedback}</p>
            </div>
          )}

          {validation.criteriaResults && (
            <div className="space-y-1">
              <p className="ql-label">Criterios Evaluados</p>
              {validation.criteriaResults.map((cr: any, i: number) => (
                <div key={i} className={`flex items-center gap-2 text-xs p-1.5 rounded-sm ${cr.met ? 'bg-ql-success/5 text-ql-success' : 'bg-ql-danger/5 text-ql-danger'}`}>
                  {cr.met ? <Check className="h-3 w-3 shrink-0" /> : <X className="h-3 w-3 shrink-0" />}
                  <span>{cr.criterion}</span>
                </div>
              ))}
            </div>
          )}

          {validation.blockers?.length > 0 && (
            <div className="rounded-md bg-ql-danger/5 p-3">
              <p className="ql-label text-ql-danger mb-1">Bloqueos Detectados</p>
              <ul className="ql-body text-ql-danger space-y-1">
                {validation.blockers.map((b: string, i: number) => <li key={i}>• {b}</li>)}
              </ul>
            </div>
          )}

          {validation.killSwitch?.active && (
            <div className="rounded-md bg-ql-danger/10 p-3 border border-ql-danger/30">
              <p className="text-sm font-semibold text-ql-danger">KILL SWITCH ACTIVADO</p>
              <p className="ql-body text-ql-danger mt-1">{validation.killSwitch.reason}</p>
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
  const color = status === 'GREEN' ? 'bg-ql-success' :
                status === 'YELLOW' ? 'bg-ql-warning' :
                'bg-ql-muted';
  const label = status === 'GREEN' ? 'Validado por IA' :
                status === 'YELLOW' ? 'En Progreso' :
                'Sin Validar';

  return (
    <div className="flex items-center gap-2">
      <span className={`h-3.5 w-3.5 rounded-full ${color}`} />
      <span className={`text-xs font-medium ${
        status === 'GREEN' ? 'text-ql-success' :
        status === 'YELLOW' ? 'text-ql-warning' :
        'text-ql-muted'
      }`}>{label}</span>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================
export default function ProjectDetailPage() {

  const params = useParams();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
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

    const validatedSteps = steps.filter(step => {
      if (!step.statusField) return false;
      return project[step.statusField] === 'GREEN';
    }).length;
    const progress = Math.round((validatedSteps / 4) * 100);

    try {
      await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, progress })
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

    const step = steps.find(s => s.number === stepNumber);
    if (!step) return;

    const content = step.fields.map(f => `${f.label}: ${formData[f.key] || ''}`).join('\n\n');

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
        body: JSON.stringify({ projectId: project.id, field: stage, content })
      });

      const data = await res.json();
      setValidationResults(prev => ({ ...prev, [stepNumber]: data }));

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
        body: JSON.stringify({ projectId: project.id, projectData: formData })
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
      <div className="ql-page flex items-center gap-2 justify-center">
        <span className="ql-status-thinking" />
        <span className="ql-loading">Cargando proyecto...</span>
      </div>
    );
  }

  if (!project) return null;

  const currentType = (project.projectType || "idea") as ProjectType;
  const typeInfo = PROJECT_TYPES[currentType];

  return (
    <div className="ql-page">
      <Header title={project.title} />

      <div className="p-6 space-y-6">
        {/* Back & Actions */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/project-builder" className="ql-btn-ghost">
            <ArrowLeft className="h-4 w-4" />
            Volver a proyectos
          </Link>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => router.push(`/project-builder/${project.id}/war-room`)}
              className="ql-btn-secondary"
            >
              <Swords className="h-4 w-4" />
              Abrir War Room
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="ql-btn-primary disabled:opacity-50"
            >
              {saving ? (
                <span className="ql-status-thinking" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Guardar
            </button>
          </div>
        </div>

        {/* Project Type Selector */}
        <div className="ql-card">
          <div className="mb-3 flex items-center gap-2">
            <Flag className="h-4 w-4 text-ql-muted" strokeWidth={1.5} />
            <span className="text-sm font-medium text-ql-charcoal">Tipo de Proyecto</span>
            {changingType && <span className="ql-status-thinking" />}
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
                  className={`inline-flex items-center gap-2 rounded-md border-2 px-3 py-1.5 text-sm font-medium transition-all disabled:opacity-60 ${
                    isSelected
                      ? `${info.borderColor} ${info.bgColor} ${info.color}`
                      : "border-ql-sand/30 bg-white text-ql-muted hover:border-ql-sand/60"
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
        <div className="ql-card">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm font-medium text-ql-charcoal">Estado de Validación IA</span>
            <span className="ql-caption normal-case tracking-normal">Semáforos actualizados solo con validación de IA</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {steps.slice(0, 4).map((step) => (
              <div key={step.number} className={`rounded-md border p-3 ${
                project[step.statusField!] === 'GREEN' ? 'border-ql-success/30 bg-ql-success/5' :
                project[step.statusField!] === 'YELLOW' ? 'border-ql-warning/30 bg-ql-warning/5' :
                'border-ql-sand/40 bg-ql-cream'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  <step.icon className={`h-4 w-4 ${
                    project[step.statusField!] === 'GREEN' ? 'text-ql-success' :
                    project[step.statusField!] === 'YELLOW' ? 'text-ql-warning' :
                    'text-ql-muted'
                  }`} strokeWidth={1.5} />
                  <span className="text-xs font-medium text-ql-charcoal">{step.title.split(' ')[0]}</span>
                </div>
                <TrafficLight status={project[step.statusField!]} />
              </div>
            ))}
          </div>
        </div>

        {/* Milestones Section with AI Generation */}
        <div className="ql-card overflow-hidden p-0">
          <div className="flex items-center justify-between p-4 border-b border-ql-sand/20">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-ql-accent/10">
                <Flag className="h-4 w-4 text-ql-accent" strokeWidth={1.5} />
              </div>
              <div>
                <p className="text-sm font-medium text-ql-charcoal">Milestones Inteligentes</p>
                <p className="ql-caption normal-case tracking-normal">
                  {milestones.filter(m => m.isCompleted).length}/{milestones.length} completados
                </p>
              </div>
            </div>
            <button
              onClick={handleGenerateMilestones}
              disabled={generatingMilestones}
              className="ql-btn-primary disabled:opacity-50"
            >
              {generatingMilestones ? (
                <span className="ql-status-thinking" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Generar con IA
            </button>
          </div>

          <div className="p-4 space-y-3">
            {/* AI Generated Milestones */}
            {showAiMilestones && aiMilestones.length > 0 && (
              <div className="rounded-md border border-dashed border-ql-accent/40 bg-ql-accent/5 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-ql-accent" strokeWidth={1.5} />
                    <p className="text-sm font-medium text-ql-charcoal">Sugeridos por IA</p>
                  </div>
                  <button onClick={() => setShowAiMilestones(false)} className="text-ql-muted hover:text-ql-slate transition-colors">
                    <ChevronUp className="h-4 w-4" />
                  </button>
                </div>
                <div className="space-y-2">
                  {aiMilestones.map((m, i) => (
                    <div key={i} className="flex items-center justify-between rounded-md bg-white p-3 border border-ql-sand/30">
                      <span className="ql-body">{m.title}</span>
                      <button
                        onClick={() => handleAddAiMilestone(m.title)}
                        className="ql-btn-primary text-xs py-1 px-2.5"
                      >
                        <Plus className="h-3 w-3" />
                        Agregar
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Existing Milestones */}
            {milestones.length === 0 ? (
              <p className="ql-caption normal-case tracking-normal py-4 text-center italic">
                No hay milestones. Usa "Generar con IA" para obtener sugerencias.
              </p>
            ) : (
              milestones.map((milestone) => (
                <div
                  key={milestone.id}
                  className={`flex items-center gap-3 rounded-md border p-3 ${
                    milestone.isCompleted ? 'border-ql-success/20 bg-ql-success/5' : 'border-ql-sand/30'
                  }`}
                >
                  <span className={`h-3 w-3 rounded-full shrink-0 ${milestone.isCompleted ? 'bg-ql-success' : 'bg-ql-muted'}`} />
                  <span className={`flex-1 text-sm ${milestone.isCompleted ? 'line-through text-ql-muted' : 'text-ql-charcoal'}`}>
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
                className="ql-card overflow-hidden p-0"
              >
                {/* Step Header with Traffic Light */}
                <div className={`flex items-center gap-4 p-4 border-b border-ql-sand/20 ${
                  stepStatus === 'GREEN' ? 'bg-ql-success/5' :
                  stepStatus === 'YELLOW' ? 'bg-ql-warning/5' : ''
                }`}>
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${
                    stepStatus === 'GREEN' ? 'bg-ql-success/10 text-ql-success' :
                    stepStatus === 'YELLOW' ? 'bg-ql-warning/10 text-ql-warning' :
                    'bg-ql-cream text-ql-muted'
                  }`}>
                    <step.icon className="h-5 w-5" strokeWidth={1.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ql-charcoal">
                      Paso {step.number}: {step.title}
                    </p>
                    <p className="ql-caption normal-case tracking-normal">{step.description}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {step.statusField && (
                      <TrafficLight status={stepStatus} />
                    )}
                    {step.aiStage && (
                      <button
                        onClick={() => handleValidateSection(step.number, step.aiStage)}
                        disabled={validating[step.number]}
                        className="ql-btn-primary text-xs py-1.5 px-3 disabled:opacity-50"
                      >
                        {validating[step.number] ? (
                          <span className="ql-status-thinking" />
                        ) : (
                          <ShieldCheck className="h-3.5 w-3.5" />
                        )}
                        Validar Campo
                      </button>
                    )}
                  </div>
                </div>

                {/* Validation Result Panel */}
                {showValidation[step.number] && (
                  <div className="px-4">
                    <ValidationPanel
                      isOpen={showValidation[step.number]}
                      onClose={() => setShowValidation(prev => ({ ...prev, [step.number]: false }))}
                      validation={validationResults[step.number]}
                      loading={validating[step.number]}
                    />
                  </div>
                )}

                {/* Step Fields with Individual Consult Buttons */}
                <div className="p-4 space-y-4">
                  {step.fields.map((field) => (
                    <div key={field.key}>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="ql-label">
                          {field.label}
                        </label>
                        {step.aiStage && (
                          <button
                            onClick={() => toggleConsultation(field.key)}
                            className="ql-btn-ghost text-xs py-1 px-2.5"
                          >
                            <MessageSquare className="h-3 w-3" />
                            Consultar con el PM
                          </button>
                        )}
                      </div>
                      <textarea
                        value={formData[field.key] || ""}
                        onChange={(e) => handleFieldChange(field.key, e.target.value)}
                        className="ql-textarea"
                        placeholder={field.placeholder}
                        rows={3}
                      />
                      {/* Word count indicator */}
                      <div className="mt-1 flex justify-end">
                        <span className={`text-xs ${
                          (formData[field.key]?.trim().split(/\s+/).length || 0) >= 25
                            ? 'text-ql-success'
                            : 'text-ql-muted'
                        }`}>
                          {formData[field.key]?.trim().split(/\s+/).filter((w: string) => w).length || 0} palabras
                          {(formData[field.key]?.trim().split(/\s+/).filter((w: string) => w).length || 0) < 25 && ' (mín. 25)'}
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
        <div className="ql-card">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-medium text-ql-charcoal">Contenido Asociado</p>
            <button
              onClick={() => setShowForm(true)}
              className="ql-btn-ghost text-xs py-1.5 px-3"
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

    </div>
  );
}
