"use client";

import { Header } from "@/components/ui/header";
import { ChatInterface } from "@/components/ui/chat-interface";
import { Bot, Sparkles, Target, FileText, TrendingUp, Users, DollarSign, BarChart3 } from "lucide-react";

const quickPrompts = [
  {
    icon: Target,
    label: "Validar idea",
    prompt: "Quiero validar una idea de negocio. Ayúdame a estructurar el análisis de viabilidad."
  },
  {
    icon: Users,
    label: "Análisis de competencia",
    prompt: "Necesito analizar a mis competidores. ¿Qué aspectos debo considerar y cómo estructurar el análisis?"
  },
  {
    icon: DollarSign,
    label: "Modelo de negocio",
    prompt: "Ayúdame a definir el modelo de negocio más adecuado para mi proyecto."
  },
  {
    icon: FileText,
    label: "Plan de acción",
    prompt: "Necesito crear un plan de acción detallado para los próximos 90 días."
  },
  {
    icon: BarChart3,
    label: "Métricas clave",
    prompt: "¿Cuáles son las métricas más importantes que debo seguir para mi tipo de proyecto?"
  },
  {
    icon: TrendingUp,
    label: "Estrategia de crecimiento",
    prompt: "Dame una estrategia de crecimiento para mi proyecto considerando recursos limitados."
  }
];

export default function AssistantPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Header title="Asistente IA" subtitle="Tu copiloto de proyectos" />

      <div className="p-6">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Chat */}
          <div className="lg:col-span-2">
            <div className="h-[calc(100vh-180px)]">
              <ChatInterface quickPrompts={quickPrompts} />
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Info Card */}
            <div className="rounded-xl bg-slate-800 p-6 text-white">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-white/10">
                <Bot className="h-6 w-6" />
              </div>
              <h3 className="font-serif text-lg">Tu Copiloto de Proyectos</h3>
              <p className="mt-2 text-sm text-slate-300">
                Potenciado por GPT-4 para ayudarte a estructurar, validar y ejecutar tus ideas de negocio.
              </p>
            </div>

            {/* Capabilities */}
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h4 className="mb-3 text-xs tracking-[0.15em] uppercase text-slate-400">Capacidades</h4>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green-100">
                    <Target className="h-4 w-4 text-green-600" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-700">Análisis de Viabilidad</p>
                    <p className="text-sm text-slate-500">Evalúa el potencial de tus ideas</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100">
                    <Users className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-700">Análisis Competitivo</p>
                    <p className="text-sm text-slate-500">Conoce a tu competencia</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-100">
                    <FileText className="h-4 w-4 text-purple-600" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-700">Generación de Documentos</p>
                    <p className="text-sm text-slate-500">Business plan, pitch deck, etc.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100">
                    <Sparkles className="h-4 w-4 text-amber-600" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-700">Recomendaciones</p>
                    <p className="text-sm text-slate-500">Basadas en tus proyectos</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Tips */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h4 className="mb-2 text-xs tracking-[0.15em] uppercase text-slate-400">Consejos</h4>
              <ul className="space-y-2 text-sm text-slate-600">
                <li>• Sé específico con tus preguntas</li>
                <li>• Proporciona contexto del proyecto</li>
                <li>• Pide ejemplos concretos</li>
                <li>• Usa los atajos rápidos de arriba</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
