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
  Sparkles,
  FileText,
  Wand2
} from "lucide-react";
import Link from "next/link";

interface Project {
  id: string;
  title: string;
  description?: string | null;
  status: string;
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
      { key: "milestones", label: "Hitos Clave", placeholder: "Define los hitos importantes: lanzamiento, primeros clientes, break-even..." }
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

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showDocGenerator, setShowDocGenerator] = useState(false);
  const [activeAIGenerator, setActiveAIGenerator] = useState<GeneratorType | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});

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

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (!project) return null;

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
                        className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100"
                      >
                        <Wand2 className="h-3 w-3" />
                        Generar con IA
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
