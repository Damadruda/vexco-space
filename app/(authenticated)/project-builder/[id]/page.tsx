"use client";

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
  CheckCircle2,
  Circle,
  Trash2,
  Flag
} from "lucide-react";
import Link from "next/link";
import { PROJECT_TYPES, PROJECT_TYPE_ORDER, MILESTONES_BY_TYPE, ProjectType } from "@/lib/project-types";

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
  milestoneItems: MilestoneItem[];
}

type GeneratorType = "competitor_analysis" | "business_model_suggestions" | "action_plan" | "market_validation";

const steps = [
  {
    number: 1,
    title: "Definición del Concepto",
    icon: Lightbulb,
    description: "¿Qué problema resuelve?",
    aiAction: null,
    fields: [
      { key: "concept", label: "Concepto Principal", placeholder: "Describe tu idea en una frase clara y concisa..." },
      { key: "problemSolved", label: "Problema que Resuelve", placeholder: "¿Qué dolor o necesidad específica atiendes?" }
    ]
  },
  {
    number: 2,
    title: "Validación de Mercado",
    icon: Users,
    description: "¿Quién lo necesita?",
    aiAction: "market_validation" as GeneratorType,
    fields: [
      { key: "targetMarket", label: "Mercado Objetivo", placeholder: "Define tu cliente ideal: demografía, sector, tamaño..." },
      { key: "marketValidation", label: "Validación", placeholder: "¿Cómo has validado la demanda? ¿Qué evidencia tienes?" }
    ]
  },
  {
    number: 3,
    title: "Modelo de Negocio",
    icon: DollarSign,
    description: "¿Cómo genera valor?",
    aiAction: "business_model_suggestions" as GeneratorType,
    fields: [
      { key: "businessModel", label: "Modelo de Monetización", placeholder: "¿Cómo generarás ingresos? (suscripción, venta directa, comisión...)" },
      { key: "valueProposition", label: "Propuesta de Valor", placeholder: "¿Qué te diferencia de la competencia?" }
    ]
  },
  {
    number: 4,
    title: "Plan de Acción",
    icon: Target,
    description: "¿Cómo lo ejecuto?",
    aiAction: "action_plan" as GeneratorType,
    fields: [
      { key: "actionPlan", label: "Pasos Inmediatos", placeholder: "Lista las 3-5 acciones principales para los próximos 30 días..." },
      { key: "milestones", label: "Hitos Clave (texto libre)", placeholder: "Define los hitos importantes: lanzamiento, primeros clientes, break-even..." }
    ]
  },
  {
    number: 5,
    title: "Recursos y Métricas",
    icon: BarChart3,
    description: "¿Qué necesito?",
    aiAction: null,
    fields: [
      { key: "resources", label: "Recursos Necesarios", placeholder: "Presupuesto, equipo, herramientas, conocimientos..." },
      { key: "metrics", label: "Métricas de Éxito", placeholder: "¿Cómo medirás el progreso? Define KPIs claros..." }
    ]
  }
];

// Deployment verification: "No Bananas" filter
const validateInput = (text: string) => {
  if (text.toLowerCase() === 'bananas') {
    alert('BLOQUEO DE SEGURIDAD: Entrada no estratégica detectada');
    return false;
  }
  return true;
};

export default function ProjectDetailPage() {
  console.log('--- MOTOR DE ESTRATEGIA V2 ACTIVO ---');
  
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
  const [newMilestoneTitle, setNewMilestoneTitle] = useState("");
  const [addingMilestone, setAddingMilestone] = useState(false);
  const [showMilestoneInput, setShowMilestoneInput] = useState(false);
  const [changingType, setChangingType] = useState(false);

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
      // Initialize form data
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
    
    // Deployment verification: validate all form inputs
    for (const value of Object.values(formData)) {
      if (!validateInput(value)) return;
    }
    
    setSaving(true);

    // Calculate progress based on filled fields
    const totalFields = steps.reduce((acc, step) => acc + step.fields.length, 0);
    const filledFields = Object.values(formData).filter((v) => v?.trim()).length;
    const progress = Math.round((filledFields / totalFields) * 100);

    // Calculate current step (first incomplete step)
    let currentStep = 5;
    for (let i = 0; i < steps.length; i++) {
      const stepFields = steps[i].fields;
      const allFilled = stepFields.every((f) => formData[f.key]?.trim());
      if (!allFilled) {
        currentStep = i + 1;
        break;
      }
    }

    // Determine status based on progress
    let status = "idea";
    if (progress >= 100) status = "completed";
    else if (progress >= 60) status = "execution";
    else if (progress >= 20) status = "development";

    try {
      await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          progress,
          currentStep,
          status
        })
      });
      setProject((prev) => prev ? { ...prev, progress, currentStep, status } : null);
    } catch (error) {
      console.error("Error saving project:", error);
    } finally {
      setSaving(false);
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

  const handleToggleMilestone = async (milestone: MilestoneItem) => {
    const updated = { ...milestone, isCompleted: !milestone.isCompleted };
    setMilestones((prev) => prev.map((m) => m.id === milestone.id ? updated : m));
    try {
      await fetch(`/api/milestones/${milestone.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isCompleted: updated.isCompleted })
      });
    } catch {
      // Revert on error
      setMilestones((prev) => prev.map((m) => m.id === milestone.id ? milestone : m));
    }
  };

  const handleDeleteMilestone = async (id: string) => {
    setMilestones((prev) => prev.filter((m) => m.id !== id));
    try {
      await fetch(`/api/milestones/${id}`, { method: "DELETE" });
    } catch {
      fetchProject();
    }
  };

  const handleAddMilestone = async (title: string) => {
    if (!title.trim() || !project) return;
    setAddingMilestone(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/milestones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() })
      });
      if (res.ok) {
        const data = await res.json();
        setMilestones((prev) => [...prev, data.milestone]);
        setNewMilestoneTitle("");
        setShowMilestoneInput(false);
      }
    } catch {
      console.error("Error adding milestone");
    } finally {
      setAddingMilestone(false);
    }
  };

  const handleAddSuggestedMilestone = async (title: string) => {
    if (!project) return;
    setAddingMilestone(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/milestones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title })
      });
      if (res.ok) {
        const data = await res.json();
        setMilestones((prev) => [...prev, data.milestone]);
      }
    } catch {
      console.error("Error adding milestone");
    } finally {
      setAddingMilestone(false);
    }
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
  const suggestedMilestones = MILESTONES_BY_TYPE[currentType];
  const existingMilestoneTitles = new Set(milestones.map((m) => m.title.toLowerCase()));
  const completedMilestones = milestones.filter((m) => m.isCompleted).length;

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
            <span className="text-sm font-semibold text-slate-700">Tipo de Proyecto (PM Ágil)</span>
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
          <p className="mt-2 text-xs text-slate-400">{typeInfo.description}</p>
        </div>

        {/* Progress Bar */}
        <div className="rounded-xl bg-white p-4 shadow-sm border border-slate-200">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">Progreso del Proyecto</span>
            <span className="text-sm font-bold text-slate-800">{project.progress}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full bg-slate-800 transition-all duration-500"
              style={{ width: `${project.progress}%` }}
            />
          </div>
          {/* Step indicators */}
          <div className="mt-4 flex justify-between">
            {steps.map((step) => {
              const StepIcon = step.icon;
              const isCompleted = step.fields.every((f) => formData[f.key]?.trim());
              const isCurrent = project.currentStep === step.number;
              return (
                <div key={step.number} className="flex flex-col items-center">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
                      isCompleted
                        ? "bg-green-500 text-white"
                        : isCurrent
                        ? "bg-slate-800 text-white"
                        : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    {isCompleted ? <Check className="h-5 w-5" /> : <StepIcon className="h-5 w-5" />}
                  </div>
                  <span className={`mt-2 text-xs font-medium ${
                    isCompleted || isCurrent ? "text-slate-700" : "text-slate-400"
                  }`}>
                    {step.title.split(" ")[0]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Milestones Section */}
        <div className="rounded-xl bg-white shadow-sm border border-slate-200 overflow-hidden">
          <div className={`flex items-center justify-between p-4 border-b border-slate-100 ${typeInfo.bgColor}`}>
            <div className="flex items-center gap-3">
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${typeInfo.bgColor} border ${typeInfo.borderColor}`}>
                <Flag className={`h-4 w-4 ${typeInfo.color}`} />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800">Milestones</h3>
                <p className="text-xs text-slate-500">
                  {completedMilestones}/{milestones.length} completados · Tipo: {typeInfo.label}
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowMilestoneInput(true)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${typeInfo.borderColor} ${typeInfo.bgColor} ${typeInfo.color} hover:opacity-80`}
            >
              <Plus className="h-3.5 w-3.5" />
              Agregar
            </button>
          </div>

          <div className="p-4 space-y-3">
            {/* Suggested milestones not yet added */}
            {suggestedMilestones.some((s) => !existingMilestoneTitles.has(s.toLowerCase())) && (
              <div className="rounded-lg border border-dashed border-slate-200 p-3">
                <p className="mb-2 text-xs font-medium text-slate-500">Sugeridos para proyectos de tipo "{typeInfo.label}":</p>
                <div className="flex flex-wrap gap-2">
                  {suggestedMilestones
                    .filter((s) => !existingMilestoneTitles.has(s.toLowerCase()))
                    .map((suggestion) => (
                      <button
                        key={suggestion}
                        onClick={() => handleAddSuggestedMilestone(suggestion)}
                        disabled={addingMilestone}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${typeInfo.borderColor} ${typeInfo.bgColor} ${typeInfo.color} hover:opacity-80 disabled:opacity-40`}
                      >
                        <Plus className="h-3 w-3" />
                        {suggestion}
                      </button>
                    ))}
                </div>
              </div>
            )}

            {/* Existing milestones */}
            {milestones.length === 0 && suggestedMilestones.every((s) => existingMilestoneTitles.has(s.toLowerCase())) && (
              <p className="py-4 text-center text-sm text-slate-400">
                No hay milestones. Agrega uno arriba.
              </p>
            )}

            {milestones.map((milestone) => (
              <div
                key={milestone.id}
                className="group flex items-center gap-3 rounded-lg border border-slate-100 p-3 hover:border-slate-200 transition-colors"
              >
                <button
                  onClick={() => handleToggleMilestone(milestone)}
                  className="shrink-0 text-slate-400 hover:text-green-500 transition-colors"
                >
                  {milestone.isCompleted ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  ) : (
                    <Circle className="h-5 w-5" />
                  )}
                </button>
                <span className={`flex-1 text-sm ${milestone.isCompleted ? "line-through text-slate-400" : "text-slate-700"}`}>
                  {milestone.title}
                </span>
                <button
                  onClick={() => handleDeleteMilestone(milestone.id)}
                  className="shrink-0 text-slate-300 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}

            {/* New milestone input */}
            {showMilestoneInput && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newMilestoneTitle}
                  onChange={(e) => setNewMilestoneTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddMilestone(newMilestoneTitle);
                    if (e.key === "Escape") { setShowMilestoneInput(false); setNewMilestoneTitle(""); }
                  }}
                  autoFocus
                  placeholder="Nombre del milestone..."
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
                />
                <button
                  onClick={() => handleAddMilestone(newMilestoneTitle)}
                  disabled={addingMilestone || !newMilestoneTitle.trim()}
                  className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:bg-slate-200"
                >
                  {addingMilestone ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                </button>
                <button
                  onClick={() => { setShowMilestoneInput(false); setNewMilestoneTitle(""); }}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-500 hover:bg-slate-50"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Steps Content */}
        <div className="space-y-4">
          {steps.map((step) => {
            const StepIcon = step.icon;
            const isCompleted = step.fields.every((f) => formData[f.key]?.trim());
            return (
              <div
                key={step.number}
                className="rounded-xl bg-white shadow-sm border border-slate-200 overflow-hidden"
              >
                {/* Step Header */}
                <div className={`flex items-center gap-4 p-4 border-b border-slate-100 ${
                  isCompleted ? "bg-green-50" : ""
                }`}>
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                      isCompleted ? "bg-green-100 text-green-600" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    <StepIcon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-slate-800">
                      Paso {step.number}: {step.title}
                    </h3>
                    <p className="text-sm text-slate-500">{step.description}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {step.aiAction && (
                      <button
                        onClick={() => setActiveAIGenerator(step.aiAction)}
                        className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                        style={{ backgroundColor: '#FF6600' }}
                      >
                        <Wand2 className="h-3 w-3" />
                        Consultar con el PM
                      </button>
                    )}
                    {isCompleted && (
                      <span className="flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                        <Check className="h-3 w-3" />
                        Completado
                      </span>
                    )}
                  </div>
                </div>

                {/* Step Fields */}
                <div className="p-4 space-y-4">
                  {step.fields.map((field) => (
                    <div key={field.key}>
                      <label className="mb-1.5 block text-sm font-medium text-slate-700">
                        {field.label}
                      </label>
                      <textarea
                        value={formData[field.key] || ""}
                        onChange={(e) => handleFieldChange(field.key, e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
                        placeholder={field.placeholder}
                        rows={3}
                      />
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
