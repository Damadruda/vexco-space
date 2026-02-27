/**
 * =============================================================================
 * PROMPT ARCHITECT - FIXED RIGHT SIDEBAR COMPONENT
 * =============================================================================
 * QA AUDIT NOTES:
 * - Stage-aware meta-prompting system
 * - Generates optimized prompts for external AIs based on ConceptInsights
 * - Stage Mercado → Perplexity prompt for competitor validation
 * - Stage Negocio/Ejecución → Claude prompt with full context
 * - Copy button and explanations for each prompt
 * =============================================================================
 */

'use client';

import { useState, useEffect } from 'react';
import { ClipboardCopy, Lightbulb, Sparkles, TrendingUp, Briefcase, Rocket, Check } from 'lucide-react';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================
interface ConceptInsight {
  id: string;
  question: string;
  answer: string | null;
  stage: string;
}

interface PromptArchitectProps {
  stage: 'Concepto' | 'Mercado' | 'Negocio' | 'Ejecución';
  projectTitle: string;
  projectDescription: string;
  insights: ConceptInsight[];
}

interface GeneratedPrompt {
  title: string;
  targetAI: string;
  prompt: string;
  explanation: string;
  icon: React.ReactNode;
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================
export default function PromptArchitect({
  stage,
  projectTitle,
  projectDescription,
  insights
}: PromptArchitectProps) {
  const [generatedPrompts, setGeneratedPrompts] = useState<GeneratedPrompt[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Generate prompts based on stage and insights
  useEffect(() => {
    const prompts = generateStagePrompts(stage, projectTitle, projectDescription, insights);
    setGeneratedPrompts(prompts);
  }, [stage, projectTitle, projectDescription, insights]);

  // Copy to clipboard handler
  const handleCopy = async (prompt: string, index: number) => {
    await navigator.clipboard.writeText(prompt);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <aside 
      className={`fixed right-0 top-0 h-screen bg-slate-900 border-l border-slate-700 
        transition-all duration-300 z-50 ${isCollapsed ? 'w-12' : 'w-96'}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        {!isCollapsed && (
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <h2 className="font-semibold text-white">Prompt Architect</h2>
          </div>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1 rounded hover:bg-slate-700 text-slate-400"
        >
          {isCollapsed ? '→' : '←'}
        </button>
      </div>

      {!isCollapsed && (
        <div className="p-4 space-y-4 overflow-y-auto h-[calc(100vh-60px)]">
          {/* Stage Indicator */}
          <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-800">
            {getStageIcon(stage)}
            <div>
              <p className="text-xs text-slate-400">Current Stage</p>
              <p className="font-medium text-white">{stage}</p>
            </div>
          </div>

          {/* Stage Description */}
          <div className="p-3 rounded-lg bg-amber-900/20 border border-amber-700/30">
            <div className="flex items-start gap-2">
              <Lightbulb className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-amber-200">
                {getStageDescription(stage)}
              </p>
            </div>
          </div>

          {/* Generated Prompts */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-slate-300">Generated Prompts</h3>
            
            {generatedPrompts.map((prompt, index) => (
              <div
                key={index}
                className="p-3 rounded-lg bg-slate-800 border border-slate-700 space-y-2"
              >
                {/* Prompt Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {prompt.icon}
                    <div>
                      <p className="text-sm font-medium text-white">{prompt.title}</p>
                      <p className="text-xs text-slate-400">For: {prompt.targetAI}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleCopy(prompt.prompt, index)}
                    className={`p-2 rounded transition-colors ${
                      copiedIndex === index 
                        ? 'bg-green-600 text-white' 
                        : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                    }`}
                  >
                    {copiedIndex === index ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <ClipboardCopy className="w-4 h-4" />
                    )}
                  </button>
                </div>

                {/* Prompt Preview */}
                <div className="p-2 rounded bg-slate-900 max-h-32 overflow-y-auto">
                  <pre className="text-xs text-slate-300 whitespace-pre-wrap">
                    {prompt.prompt.substring(0, 200)}...
                  </pre>
                </div>

                {/* Explanation */}
                <p className="text-xs text-slate-400 italic">
                  💡 {prompt.explanation}
                </p>
              </div>
            ))}

            {generatedPrompts.length === 0 && (
              <div className="p-4 text-center text-slate-400">
                <p className="text-sm">Complete the current stage validation to unlock prompts</p>
              </div>
            )}
          </div>

          {/* Insights Summary */}
          {insights.length > 0 && (
            <div className="mt-4 p-3 rounded-lg bg-slate-800/50">
              <h4 className="text-xs font-medium text-slate-400 mb-2">
                Validated Insights ({insights.filter(i => i.answer).length}/{insights.length})
              </h4>
              <ul className="space-y-1">
                {insights.slice(0, 3).map((insight) => (
                  <li key={insight.id} className="flex items-start gap-2">
                    <span className={`text-xs ${
                      insight.answer ? 'text-green-400' : 'text-amber-400'
                    }`}>
                      {insight.answer ? '✓' : '○'}
                    </span>
                    <span className="text-xs text-slate-400 line-clamp-1">
                      {insight.question}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}

// =============================================================================
// PROMPT GENERATION LOGIC
// QA: Stage-specific prompt templates
// =============================================================================
function generateStagePrompts(
  stage: string,
  projectTitle: string,
  projectDescription: string,
  insights: ConceptInsight[]
): GeneratedPrompt[] {
  const answeredInsights = insights.filter(i => i.answer && i.stage === stage);
  const insightsSummary = answeredInsights
    .map(i => `Q: ${i.question}\nA: ${i.answer}`)
    .join('\n\n');

  const prompts: GeneratedPrompt[] = [];

  // Stage-specific prompts
  switch (stage) {
    case 'Concepto':
      prompts.push({
        title: 'Idea Refinement',
        targetAI: 'ChatGPT / Claude',
        icon: <Lightbulb className="w-4 h-4 text-amber-400" />,
        prompt: `Actúa como un experto en innovación y desarrollo de productos.

PROYECTO: ${projectTitle}

DESCRIPCIÓN:
${projectDescription}

VALIDACIONES COMPLETADAS:
${insightsSummary || 'Ninguna aún'}

TAREA:
1. Analiza la propuesta de valor central del concepto
2. Identifica 3 fortalezas únicas del concepto
3. Sugiere 2 mejoras específicas para refinar la idea
4. Proporciona un "elevator pitch" de 30 segundos

Formato: Estructurado con bullets y secciones claras.`,
        explanation: 'Use this prompt to refine your concept with AI before moving to market validation'
      });
      break;

    case 'Mercado':
      prompts.push({
        title: 'Competitor Analysis',
        targetAI: 'Perplexity',
        icon: <TrendingUp className="w-4 h-4 text-blue-400" />,
        prompt: `Busca y analiza competidores para el siguiente proyecto:

PROYECTO: ${projectTitle}

DESCRIPCIÓN:
${projectDescription}

CONTEXTO VALIDADO:
${insightsSummary || 'N/A'}

Necesito:
1. Lista de 5-10 competidores directos e indirectos
2. Análisis de sus modelos de negocio
3. Sus fortalezas y debilidades
4. Brechas en el mercado que mi proyecto podría llenar
5. Tendencias actuales del mercado (2024-2025)
6. Tamaño estimado del mercado (TAM, SAM, SOM)

Proporciona fuentes y datos actualizados.`,
        explanation: 'Perplexity excels at real-time market research with source citations'
      });
      prompts.push({
        title: 'Target Audience Validation',
        targetAI: 'Claude',
        icon: <TrendingUp className="w-4 h-4 text-purple-400" />,
        prompt: `Eres un experto en research de usuarios y desarrollo de personas.

PROYECTO: ${projectTitle}

DESCRIPCIÓN:
${projectDescription}

INSIGHTS:
${insightsSummary || 'N/A'}

TAREA:
1. Crea 3 user personas detalladas para este proyecto
2. Para cada persona incluye: demografía, motivaciones, pain points, jobs-to-be-done
3. Sugiere canales de adquisición para cada persona
4. Identifica el "early adopter" ideal
5. Proporciona preguntas clave para entrevistas de validación`,
        explanation: 'Claude provides deep analytical thinking for user research'
      });
      break;

    case 'Negocio':
      prompts.push({
        title: 'Business Model Canvas',
        targetAI: 'Claude',
        icon: <Briefcase className="w-4 h-4 text-green-400" />,
        prompt: `Actúa como consultor de estrategia de negocios.

PROYECTO: ${projectTitle}

DESCRIPCIÓN:
${projectDescription}

INSIGHTS VALIDADOS:
${insightsSummary || 'N/A'}

GENERA UN BUSINESS MODEL CANVAS COMPLETO:

1. SEGMENTOS DE CLIENTES
2. PROPUESTA DE VALOR
3. CANALES
4. RELACIONES CON CLIENTES
5. FUENTES DE INGRESOS
6. RECURSOS CLAVE
7. ACTIVIDADES CLAVE
8. SOCIOS CLAVE
9. ESTRUCTURA DE COSTOS

Para cada sección:
- Proporciona 3-5 puntos específicos
- Incluye métricas clave a trackear
- Sugiere herramientas/plataformas específicas

Adicional:
- Proyección financiera simplificada (Year 1)
- Unit economics básicos
- Principales KPIs`,
        explanation: 'Comprehensive business model generation with financial projections'
      });
      break;

    case 'Ejecución':
      prompts.push({
        title: 'MVP Development Plan',
        targetAI: 'Claude',
        icon: <Rocket className="w-4 h-4 text-orange-400" />,
        prompt: `Eres un product manager y tech lead senior.

PROYECTO: ${projectTitle}

DESCRIPCIÓN:
${projectDescription}

INSIGHTS Y VALIDACIONES:
${insightsSummary || 'N/A'}

CREA UN PLAN DE DESARROLLO MVP:

1. DEFINICIÓN DEL MVP
- Core features (máximo 5)
- Nice-to-have features (para v2)
- Features a descartar

2. TECH STACK RECOMENDADO
- Frontend
- Backend
- Base de datos
- Infraestructura
- Herramientas de desarrollo

3. ROADMAP DE 8 SEMANAS
- Sprint 1-2: Setup y fundamentos
- Sprint 3-4: Core features
- Sprint 5-6: Integration y testing
- Sprint 7-8: Polish y lanzamiento

4. EQUIPO MÍNIMO
- Roles necesarios
- Opciones de outsourcing
- Estimación de costos

5. MÉTRICAS DE ÉXITO
- KPIs de lanzamiento
- North star metric
- Criterios de pivote`,
        explanation: 'Full execution roadmap with technical specifications for POC/MVP'
      });
      prompts.push({
        title: 'Resource & Budget Plan',
        targetAI: 'ChatGPT',
        icon: <Rocket className="w-4 h-4 text-cyan-400" />,
        prompt: `Ayúdame a crear un plan de recursos y presupuesto detallado.

PROYECTO: ${projectTitle}

DESCRIPCIÓN:
${projectDescription}

CONTEXTO:
${insightsSummary || 'N/A'}

NECESITO:

1. PRESUPUESTO DETALLADO
- Desarrollo (interno/externo)
- Infraestructura y hosting
- Marketing y adquisición
- Legal y administrativo
- Contingencia (15%)

2. TIMELINE CON MILESTONES
- Milestone 1: [fecha] - [entregable]
- Milestone 2: [fecha] - [entregable]
- etc.

3. RIESGOS Y MITIGACIÓN
- Top 5 riesgos técnicos
- Top 5 riesgos de negocio
- Plan de mitigación para cada uno

4. CRITERIOS DE GO/NO-GO
- Métricas mínimas para continuar
- Señales de alerta
- Plan de salida si es necesario

Presenta en formato de tabla donde sea posible.`,
        explanation: 'Detailed resource allocation and risk management planning'
      });
      break;
  }

  return prompts;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================
function getStageIcon(stage: string) {
  switch (stage) {
    case 'Concepto':
      return <Lightbulb className="w-5 h-5 text-amber-400" />;
    case 'Mercado':
      return <TrendingUp className="w-5 h-5 text-blue-400" />;
    case 'Negocio':
      return <Briefcase className="w-5 h-5 text-green-400" />;
    case 'Ejecución':
      return <Rocket className="w-5 h-5 text-orange-400" />;
    default:
      return <Sparkles className="w-5 h-5 text-slate-400" />;
  }
}

function getStageDescription(stage: string): string {
  switch (stage) {
    case 'Concepto':
      return 'Define and validate your core idea. Focus on problem clarity and unique value proposition.';
    case 'Mercado':
      return 'Research your market and competitors. Validate demand and identify your target audience.';
    case 'Negocio':
      return 'Build your business model. Define revenue streams, costs, and growth strategy.';
    case 'Ejecución':
      return 'Plan your MVP development. Create roadmap, allocate resources, and prepare for launch.';
    default:
      return 'Complete each stage to unlock optimized prompts for external AI tools.';
  }
}
