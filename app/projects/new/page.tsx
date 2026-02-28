/**
 * =============================================================================
 * STRATEGIC PM LAB - PROJECT CREATION PAGE
 * =============================================================================
 * QA AUDIT NOTES:
 * - Granular interface with 4 sections: Concepto, Mercado, Negocio, Ejecución
 * - Each section has: text area, "Consultar con el PM" button, AI suggestions,
 *   feedback input for refinement, status indicator (RED/YELLOW/GREEN)
 * - Auto-Fill Cascade: when Concepto reaches GREEN, auto-drafts for Mercado/Negocio
 * - Refinement loop: user can give feedback, AI reformulates specific field
 * - Dynamic milestone suggestions as project evolves
 * - All interactions persisted to ConceptInsight table
 * =============================================================================
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import PromptArchitect from '@/components/PromptArchitect';
import { 
  Loader2, ArrowLeft, FolderOpen, FileText, Send, 
  Check, AlertCircle, Lock, ChevronRight, Sparkles,
  RefreshCw, Target, Lightbulb, X, ChevronDown, ChevronUp,
  Trophy, Zap, MessageSquare, ThumbsUp, ThumbsDown
} from 'lucide-react';

// =============================================================================
// CONSTANTS
// =============================================================================
const EXPERT_MODE_FOLDER_ID = '1ekDx8PsLfS2Dgn4C7qMTYRcx_yDti2Lh';
const STAGES = ['Concepto', 'Mercado', 'Negocio', 'Ejecución'] as const;
type Stage = typeof STAGES[number];
type StageKey = 'concepto' | 'mercado' | 'negocio' | 'ejecucion';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================
interface ConceptInsight {
  id: string;
  question: string;
  answer: string | null;
  stage: string;
  aiSuggestion?: string;
  alternatives?: string;
  costBenefitAnalysis?: string;
  userFeedback?: string;
}

interface PMResponse {
  status: 'RED' | 'YELLOW' | 'GREEN';
  suggestion: string;
  analysis?: {
    strengths: string[];
    weaknesses: string[];
    opportunities: string[];
    threats: string[];
  };
  alternatives?: { name: string; description: string; viability: string }[];
  costBenefitAnalysis?: string | { recommendation?: string };
  nextQuestion?: string;
  killSwitch?: { reason: string; benchmarks: string[] };
  noBananasViolation?: boolean;
  message?: string;
  requiredData?: string[];
  cascadeDrafts?: {
    mercadoDraft: string;
    negocioDraft: string;
    mercadoQuestions: string[];
    negocioQuestions: string[];
  };
}

interface Milestone {
  id: string;
  title: string;
  description?: string;
  isCertified: boolean;
  certifiedAt?: string;
  order: number;
}

// =============================================================================
// SECTION COMPONENT - Granular AI Assistance for each field
// =============================================================================
function FieldSection({
  stage,
  stageKey,
  content,
  setContent,
  status,
  aiResponse,
  isLoading,
  isLocked,
  onConsult,
  onValidate,
  onRefinement,
  cascadeDraft,
  onAcceptDraft,
  insights
}: {
  stage: Stage;
  stageKey: StageKey;
  content: string;
  setContent: (value: string) => void;
  status: 'RED' | 'YELLOW' | 'GREEN';
  aiResponse: PMResponse | null;
  isLoading: boolean;
  isLocked: boolean;
  onConsult: () => void;
  onValidate: () => void;
  onRefinement: (feedback: string) => void;
  cascadeDraft?: string;
  onAcceptDraft?: () => void;
  insights: ConceptInsight[];
}) {
  const [isExpanded, setIsExpanded] = useState(!isLocked);
  const [feedbackInput, setFeedbackInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const statusColors = {
    RED: 'bg-red-500',
    YELLOW: 'bg-yellow-500',
    GREEN: 'bg-green-500'
  };

  const statusBorders = {
    RED: 'border-red-500/30',
    YELLOW: 'border-yellow-500/30',
    GREEN: 'border-green-500/30'
  };

  const stageIcons = {
    Concepto: Lightbulb,
    Mercado: Target,
    Negocio: Zap,
    Ejecución: Trophy
  };

  const StageIcon = stageIcons[stage];
  const stageInsights = insights.filter(i => i.stage === stage);

  return (
    <div className={`rounded-xl border ${statusBorders[status]} bg-slate-900/50 overflow-hidden transition-all duration-300 ${isLocked ? 'opacity-60' : ''}`}>
      {/* Section Header */}
      <div
        className={`flex items-center justify-between p-4 cursor-pointer ${isLocked ? 'cursor-not-allowed' : 'hover:bg-slate-800/50'}`}
        onClick={() => !isLocked && setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl ${statusColors[status]} bg-opacity-20 flex items-center justify-center`}>
            <StageIcon className={`w-5 h-5 ${status === 'GREEN' ? 'text-green-400' : status === 'YELLOW' ? 'text-yellow-400' : 'text-red-400'}`} />
          </div>
          <div>
            <h3 className="font-semibold text-white flex items-center gap-2">
              {stage}
              <span className={`w-3 h-3 rounded-full ${statusColors[status]} animate-pulse`} />
            </h3>
            <p className="text-xs text-slate-400">
              {status === 'GREEN' ? 'Validado' : status === 'YELLOW' ? 'En proceso' : 'Pendiente'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isLocked && <Lock className="w-4 h-4 text-slate-500" />}
          {!isLocked && (isExpanded ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />)}
        </div>
      </div>

      {/* Section Content */}
      {isExpanded && !isLocked && (
        <div className="p-4 pt-0 space-y-4">
          {/* Cascade Draft Banner */}
          {cascadeDraft && status === 'RED' && (
            <div className="p-4 rounded-lg bg-purple-900/30 border border-purple-500/30">
              <div className="flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-purple-400 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-purple-300 mb-2">
                    Draft auto-generado basado en tu Concepto validado:
                  </p>
                  <p className="text-sm text-slate-300 whitespace-pre-wrap">{cascadeDraft}</p>
                  <button
                    onClick={onAcceptDraft}
                    className="mt-3 px-4 py-1.5 bg-purple-600 hover:bg-purple-500 rounded-lg text-sm font-medium flex items-center gap-2"
                  >
                    <ThumbsUp className="w-4 h-4" />
                    Aceptar Draft
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Content Input */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Contenido de {stage}
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={`Describe el ${stage.toLowerCase()} de tu proyecto...`}
              rows={5}
              className="w-full p-4 rounded-lg bg-slate-800 border border-slate-700 focus:border-amber-500 focus:outline-none resize-none text-sm"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={onConsult}
              disabled={isLoading || !content.trim()}
              className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg font-medium text-sm flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <MessageSquare className="w-4 h-4" />
              )}
              Consultar con el PM
            </button>
            <button
              onClick={onValidate}
              disabled={isLoading || !content.trim()}
              className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:cursor-not-allowed rounded-lg font-medium text-sm flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4" />
              Validar Campo
            </button>
          </div>

          {/* AI Response Area */}
          {aiResponse && (
            <div className="space-y-3">
              {/* No Bananas Warning */}
              {aiResponse.noBananasViolation && (
                <div className="p-4 rounded-lg bg-red-900/30 border border-red-500/30">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-red-300 mb-2">
                        ⚠️ "No Bananas" Filter
                      </p>
                      <p className="text-sm text-slate-300">{aiResponse.message}</p>
                      {aiResponse.requiredData && aiResponse.requiredData.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs text-slate-400 mb-1">Datos requeridos:</p>
                          <ul className="list-disc list-inside text-xs text-slate-300">
                            {aiResponse.requiredData.map((d, i) => (
                              <li key={i}>{d}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* AI Suggestion */}
              {aiResponse.suggestion && (
                <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
                  <p className="text-sm font-medium text-amber-400 mb-2 flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    Sugerencia del PM Estratégico
                  </p>
                  <p className="text-sm text-slate-300 whitespace-pre-wrap">{aiResponse.suggestion}</p>
                </div>
              )}

              {/* SWOT Analysis */}
              {aiResponse.analysis && (
                <button
                  onClick={() => setShowSuggestions(!showSuggestions)}
                  className="w-full p-3 rounded-lg bg-slate-800/30 border border-slate-700/50 text-sm text-slate-400 hover:text-white flex items-center justify-between"
                >
                  <span>Ver análisis SWOT detallado</span>
                  {showSuggestions ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              )}

              {showSuggestions && aiResponse.analysis && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-3 rounded-lg bg-green-900/20 border border-green-500/20">
                    <p className="text-xs font-medium text-green-400 mb-1">Fortalezas</p>
                    <ul className="text-xs text-slate-300 space-y-1">
                      {aiResponse.analysis.strengths?.map((s, i) => <li key={i}>• {s}</li>)}
                    </ul>
                  </div>
                  <div className="p-3 rounded-lg bg-red-900/20 border border-red-500/20">
                    <p className="text-xs font-medium text-red-400 mb-1">Debilidades</p>
                    <ul className="text-xs text-slate-300 space-y-1">
                      {aiResponse.analysis.weaknesses?.map((s, i) => <li key={i}>• {s}</li>)}
                    </ul>
                  </div>
                  <div className="p-3 rounded-lg bg-blue-900/20 border border-blue-500/20">
                    <p className="text-xs font-medium text-blue-400 mb-1">Oportunidades</p>
                    <ul className="text-xs text-slate-300 space-y-1">
                      {aiResponse.analysis.opportunities?.map((s, i) => <li key={i}>• {s}</li>)}
                    </ul>
                  </div>
                  <div className="p-3 rounded-lg bg-yellow-900/20 border border-yellow-500/20">
                    <p className="text-xs font-medium text-yellow-400 mb-1">Amenazas</p>
                    <ul className="text-xs text-slate-300 space-y-1">
                      {aiResponse.analysis.threats?.map((s, i) => <li key={i}>• {s}</li>)}
                    </ul>
                  </div>
                </div>
              )}

              {/* Alternatives */}
              {aiResponse.alternatives && aiResponse.alternatives.length > 0 && (
                <div className="p-4 rounded-lg bg-purple-900/20 border border-purple-500/20">
                  <p className="text-sm font-medium text-purple-400 mb-2">
                    🔄 Alternativas/Pivotes Sugeridos
                  </p>
                  <div className="space-y-2">
                    {aiResponse.alternatives.map((alt, i) => (
                      <div key={i} className="p-2 rounded bg-slate-800/50 text-xs">
                        <p className="font-medium text-white">{alt.name}</p>
                        <p className="text-slate-400">{alt.description}</p>
                        <span className={`text-xs ${alt.viability === 'alta' ? 'text-green-400' : alt.viability === 'media' ? 'text-yellow-400' : 'text-red-400'}`}>
                          Viabilidad: {alt.viability}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Cost-Benefit Analysis */}
              {aiResponse.costBenefitAnalysis && (
                <div className="p-4 rounded-lg bg-blue-900/20 border border-blue-500/20">
                  <p className="text-sm font-medium text-blue-400 mb-2">📊 Análisis Costo/Beneficio</p>
                  <p className="text-xs text-slate-300">
                    {typeof aiResponse.costBenefitAnalysis === 'string' 
                      ? aiResponse.costBenefitAnalysis 
                      : aiResponse.costBenefitAnalysis.recommendation}
                  </p>
                </div>
              )}

              {/* Kill Switch */}
              {aiResponse.killSwitch && (
                <div className="p-4 rounded-lg bg-red-900/30 border border-red-500/50">
                  <p className="text-sm font-medium text-red-400 mb-2">🛑 Kill Switch Activado</p>
                  <p className="text-sm text-slate-300 mb-2">{aiResponse.killSwitch.reason}</p>
                  {aiResponse.killSwitch.benchmarks && (
                    <div className="mt-2">
                      <p className="text-xs text-slate-400">Benchmarks fallidos:</p>
                      <ul className="list-disc list-inside text-xs text-red-300">
                        {aiResponse.killSwitch.benchmarks.map((b, i) => <li key={i}>{b}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Refinement Input */}
          <div className="pt-2 border-t border-slate-700/50">
            <label className="block text-xs font-medium text-slate-400 mb-2">
              Solicitar ajuste específico (ej: "ajusta el modelo de ingresos")
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={feedbackInput}
                onChange={(e) => setFeedbackInput(e.target.value)}
                placeholder="¿Qué aspecto quieres refinar?"
                className="flex-1 p-2 rounded-lg bg-slate-800 border border-slate-700 focus:border-amber-500 focus:outline-none text-sm"
              />
              <button
                onClick={() => {
                  if (feedbackInput.trim()) {
                    onRefinement(feedbackInput);
                    setFeedbackInput('');
                  }
                }}
                disabled={isLoading || !feedbackInput.trim()}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 rounded-lg text-sm flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Refinar
              </button>
            </div>
          </div>

          {/* Previous Insights */}
          {stageInsights.length > 0 && (
            <div className="pt-2 border-t border-slate-700/50">
              <p className="text-xs font-medium text-slate-400 mb-2">
                Historial de consultas ({stageInsights.length})
              </p>
              <div className="max-h-40 overflow-y-auto space-y-2">
                {stageInsights.slice(-3).map((insight) => (
                  <div key={insight.id} className="p-2 rounded bg-slate-800/50 text-xs">
                    <p className="text-amber-400">{insight.question}</p>
                    {insight.aiSuggestion && (
                      <p className="text-slate-400 mt-1">{insight.aiSuggestion.substring(0, 100)}...</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// MILESTONES SIDEBAR COMPONENT
// =============================================================================
function MilestonesSidebar({
  projectId,
  milestones,
  onRefresh
}: {
  projectId: string | null;
  milestones: Milestone[];
  onRefresh: () => void;
}) {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    if (!projectId) return;
    setIsGenerating(true);
    try {
      await fetch('/api/milestones/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId })
      });
      onRefresh();
    } catch (error) {
      console.error('Error generating milestones:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="w-72 bg-slate-900/50 border-l border-slate-800 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-white flex items-center gap-2">
          <Trophy className="w-5 h-5 text-amber-400" />
          Milestones
        </h3>
        <button
          onClick={handleGenerate}
          disabled={isGenerating || !projectId}
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50"
        >
          {isGenerating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
        </button>
      </div>

      {milestones.length === 0 ? (
        <div className="text-center py-8 text-slate-500 text-sm">
          <Trophy className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>Los milestones se generarán automáticamente cuando valides tu concepto.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {milestones.map((milestone, index) => (
            <div
              key={milestone.id}
              className={`p-3 rounded-lg border ${
                milestone.isCertified
                  ? 'bg-green-900/20 border-green-500/30'
                  : 'bg-slate-800/50 border-slate-700/50'
              }`}
            >
              <div className="flex items-start gap-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  milestone.isCertified ? 'bg-green-500 text-white' : 'bg-slate-700 text-slate-400'
                }`}>
                  {milestone.isCertified ? <Check className="w-3 h-3" /> : index + 1}
                </div>
                <div className="flex-1">
                  <p className={`text-sm font-medium ${milestone.isCertified ? 'text-green-300' : 'text-white'}`}>
                    {milestone.title}
                  </p>
                  {milestone.description && (
                    <p className="text-xs text-slate-400 mt-1">{milestone.description}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================
export default function NewProjectPage() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();

  // Project creation state
  const [mode, setMode] = useState<'manual' | 'drive'>('manual');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [folderId, setFolderId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  // Project state
  const [projectId, setProjectId] = useState<string | null>(null);
  const [isExpertMode, setIsExpertMode] = useState(false);
  
  // Stage content
  const [fieldContent, setFieldContent] = useState<Record<StageKey, string>>({
    concepto: '',
    mercado: '',
    negocio: '',
    ejecucion: ''
  });
  
  // Stage status
  const [stageStatus, setStageStatus] = useState<Record<Stage, 'RED' | 'YELLOW' | 'GREEN'>>({
    Concepto: 'RED',
    Mercado: 'RED',
    Negocio: 'RED',
    Ejecución: 'RED'
  });
  
  // AI responses
  const [aiResponses, setAiResponses] = useState<Record<StageKey, PMResponse | null>>({
    concepto: null,
    mercado: null,
    negocio: null,
    ejecucion: null
  });
  
  // Loading state per field
  const [loadingField, setLoadingField] = useState<StageKey | null>(null);
  
  // Cascade drafts
  const [cascadeDrafts, setCascadeDrafts] = useState<{ mercado?: string; negocio?: string }>({});
  
  // Insights
  const [insights, setInsights] = useState<ConceptInsight[]>([]);
  
  // Milestones
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  
  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPromptArchitect, setShowPromptArchitect] = useState(false);
  const [showMilestones, setShowMilestones] = useState(false);

  // Auth redirect
  useEffect(() => {
    if (sessionStatus === 'unauthenticated') {
      router.push('/');
    }
  }, [sessionStatus, router]);

  // Expert mode detection
  useEffect(() => {
    setIsExpertMode(folderId === EXPERT_MODE_FOLDER_ID);
  }, [folderId]);

  // Stage key mapping
  const stageToKey = (stage: Stage): StageKey => {
    const mapping: Record<Stage, StageKey> = {
      'Concepto': 'concepto',
      'Mercado': 'mercado',
      'Negocio': 'negocio',
      'Ejecución': 'ejecucion'
    };
    return mapping[stage];
  };

  // Check if stage is locked
  const isStageUnlocked = (stage: Stage): boolean => {
    const stageIndex = STAGES.indexOf(stage);
    if (stageIndex === 0) return true;
    return stageStatus[STAGES[stageIndex - 1]] === 'GREEN';
  };

  // ==========================================================================
  // API HANDLERS
  // ==========================================================================
  const handleCreateProject = async () => {
    if (!title.trim()) {
      setError('El título del proyecto es requerido');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          startDate: startDate || null,
          endDate: endDate || null
        })
      });

      if (!response.ok) throw new Error('Error al crear el proyecto');

      const { project } = await response.json();
      setProjectId(project.id);
      setFieldContent(prev => ({ ...prev, concepto: description }));

      // If Drive mode, analyze folder
      if (mode === 'drive' && folderId) {
        const analyzeResponse = await fetch('/api/drive/analyze-folder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folderId, projectId: project.id })
        });

        if (analyzeResponse.ok) {
          const analyzeData = await analyzeResponse.json();
          if (analyzeData.summary) {
            setFieldContent(prev => ({
              ...prev,
              concepto: prev.concepto + '\n\n' + analyzeData.summary
            }));
          }
        }
      }

    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleConsult = async (stageKey: StageKey) => {
    if (!projectId) return;
    
    setLoadingField(stageKey);
    try {
      const response = await fetch('/api/pm/consult', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          field: stageKey,
          currentContent: fieldContent[stageKey]
        })
      });

      if (!response.ok) throw new Error('Error en consulta');

      const data: PMResponse = await response.json();
      setAiResponses(prev => ({ ...prev, [stageKey]: data }));
      
      // Update status
      const stage = STAGES.find(s => stageToKey(s) === stageKey)!;
      setStageStatus(prev => ({ ...prev, [stage]: data.status }));
      
      // Handle cascade drafts
      if (data.cascadeDrafts) {
        setCascadeDrafts({
          mercado: data.cascadeDrafts.mercadoDraft,
          negocio: data.cascadeDrafts.negocioDraft
        });
        setShowMilestones(true);
        // Auto-generate milestones when concepto is GREEN
        await handleGenerateMilestones();
      }
      
      // Refresh insights
      fetchInsights();

    } catch (err) {
      setError(String(err));
    } finally {
      setLoadingField(null);
    }
  };

  const handleValidate = async (stageKey: StageKey) => {
    if (!projectId) return;
    
    setLoadingField(stageKey);
    try {
      const response = await fetch('/api/pm/validate-field', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          field: stageKey,
          content: fieldContent[stageKey]
        })
      });

      if (!response.ok) throw new Error('Error en validación');

      const data = await response.json();
      setAiResponses(prev => ({ ...prev, [stageKey]: data }));
      
      const stage = STAGES.find(s => stageToKey(s) === stageKey)!;
      setStageStatus(prev => ({ ...prev, [stage]: data.status }));
      
      fetchInsights();

    } catch (err) {
      setError(String(err));
    } finally {
      setLoadingField(null);
    }
  };

  const handleRefinement = async (stageKey: StageKey, feedback: string) => {
    if (!projectId) return;
    
    setLoadingField(stageKey);
    try {
      const response = await fetch('/api/pm/consult', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          field: stageKey,
          currentContent: fieldContent[stageKey],
          userFeedback: feedback
        })
      });

      if (!response.ok) throw new Error('Error en refinamiento');

      const data: PMResponse = await response.json();
      setAiResponses(prev => ({ ...prev, [stageKey]: data }));
      
      // If AI provides a refined suggestion, offer to update content
      if (data.suggestion) {
        // Could auto-update or prompt user
      }
      
      fetchInsights();

    } catch (err) {
      setError(String(err));
    } finally {
      setLoadingField(null);
    }
  };

  const handleAcceptDraft = (stageKey: StageKey) => {
    const draft = stageKey === 'mercado' ? cascadeDrafts.mercado : cascadeDrafts.negocio;
    if (draft) {
      setFieldContent(prev => ({ ...prev, [stageKey]: draft }));
      setCascadeDrafts(prev => ({ ...prev, [stageKey]: undefined }));
    }
  };

  const fetchInsights = async () => {
    if (!projectId) return;
    
    try {
      const response = await fetch(`/api/concept/validate?projectId=${projectId}`);
      if (response.ok) {
        const data = await response.json();
        setInsights(data.insights || []);
      }
    } catch (err) {
      console.error('Failed to fetch insights:', err);
    }
  };

  const handleGenerateMilestones = async () => {
    if (!projectId) return;
    
    try {
      const response = await fetch('/api/milestones/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId })
      });
      
      if (response.ok) {
        const data = await response.json();
        setMilestones(data.milestones || []);
      }
    } catch (err) {
      console.error('Failed to generate milestones:', err);
    }
  };

  const fetchMilestones = async () => {
    if (!projectId) return;
    
    try {
      const response = await fetch(`/api/milestones/generate?projectId=${projectId}`);
      if (response.ok) {
        const data = await response.json();
        setMilestones(data.milestones || []);
      }
    } catch (err) {
      console.error('Failed to fetch milestones:', err);
    }
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================
  if (sessionStatus === 'loading') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="border-b border-slate-800 p-4 sticky top-0 bg-slate-950/95 backdrop-blur z-10">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          <button
            onClick={() => router.push('/dashboard')}
            className="p-2 rounded-lg hover:bg-slate-800"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400" />
              Strategic PM Lab
            </h1>
            <p className="text-sm text-slate-400">
              {projectId ? 'Valida tu proyecto con asistencia AI' : 'Crea y valida tu proyecto'}
            </p>
          </div>
          {projectId && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowMilestones(!showMilestones)}
                className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${
                  showMilestones ? 'bg-amber-600' : 'bg-slate-800 hover:bg-slate-700'
                }`}
              >
                <Trophy className="w-4 h-4" />
                Milestones
              </button>
              <button
                onClick={() => setShowPromptArchitect(!showPromptArchitect)}
                className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${
                  showPromptArchitect ? 'bg-purple-600' : 'bg-slate-800 hover:bg-slate-700'
                }`}
              >
                <Zap className="w-4 h-4" />
                Prompt Architect
              </button>
            </div>
          )}
          {isExpertMode && (
            <span className="px-3 py-1 bg-purple-900 text-purple-300 rounded-full text-sm font-medium">
              ⚡ Expert Mode
            </span>
          )}
        </div>
      </header>

      <div className="flex">
        {/* Main Content */}
        <main className={`flex-1 transition-all duration-300 ${showMilestones ? 'mr-72' : ''} ${showPromptArchitect ? 'mr-96' : ''}`}>
          <div className="max-w-4xl mx-auto p-6">
            {/* Error Display */}
            {error && (
              <div className="mb-6 p-4 bg-red-900/20 border border-red-700 rounded-lg flex items-center gap-3 text-red-400">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span>{error}</span>
                <button onClick={() => setError(null)} className="ml-auto text-red-300 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {!projectId ? (
              /* Project Creation Form */
              <div className="space-y-6">
                <div className="text-center mb-8">
                  <h2 className="text-2xl font-bold mb-2">Inicia tu proyecto</h2>
                  <p className="text-slate-400">Proporciona los detalles básicos para comenzar la validación estratégica</p>
                </div>

                {/* Mode Toggle */}
                <div className="flex gap-4 p-1 bg-slate-800 rounded-xl w-fit mx-auto">
                  <button
                    onClick={() => setMode('manual')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                      mode === 'manual' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <FileText className="w-4 h-4" />
                    Manual
                  </button>
                  <button
                    onClick={() => setMode('drive')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                      mode === 'drive' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <FolderOpen className="w-4 h-4" />
                    Import from Drive
                  </button>
                </div>

                {/* Form Fields */}
                <div className="space-y-4 max-w-2xl mx-auto">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Título del Proyecto *
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Nombre de tu proyecto"
                      className="w-full p-3 rounded-lg bg-slate-800 border border-slate-700 focus:border-amber-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Descripción inicial
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Describe tu idea o concepto..."
                      rows={4}
                      className="w-full p-3 rounded-lg bg-slate-800 border border-slate-700 focus:border-amber-500 focus:outline-none resize-none"
                    />
                  </div>

                  {mode === 'drive' && (
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Google Drive Folder ID
                      </label>
                      <input
                        type="text"
                        value={folderId}
                        onChange={(e) => setFolderId(e.target.value)}
                        placeholder="ID de carpeta de Drive"
                        className="w-full p-3 rounded-lg bg-slate-800 border border-slate-700 focus:border-amber-500 focus:outline-none font-mono text-sm"
                      />
                      {isExpertMode && (
                        <p className="mt-2 text-sm text-purple-400">
                          ⚡ Expert Mode: Pattern Extraction Engine activado
                        </p>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Fecha de Inicio
                      </label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full p-3 rounded-lg bg-slate-800 border border-slate-700 focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Fecha de Fin
                      </label>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full p-3 rounded-lg bg-slate-800 border border-slate-700 focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleCreateProject}
                    disabled={loading || !title.trim()}
                    className="w-full py-3 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Creando...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-5 h-5" />
                        Crear & Abrir PM Lab
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              /* Strategic PM Lab Interface */
              <div className="space-y-4">
                {/* Progress Overview */}
                <div className="flex items-center gap-2 p-4 rounded-xl bg-slate-900/50 border border-slate-800">
                  {STAGES.map((stage, index) => (
                    <div key={stage} className="flex items-center">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                        stageStatus[stage] === 'GREEN' ? 'bg-green-500' :
                        stageStatus[stage] === 'YELLOW' ? 'bg-yellow-500' :
                        'bg-slate-700'
                      }`}>
                        {stageStatus[stage] === 'GREEN' ? <Check className="w-4 h-4" /> : index + 1}
                      </div>
                      <span className="ml-2 text-sm text-slate-400">{stage}</span>
                      {index < STAGES.length - 1 && (
                        <div className={`w-12 h-0.5 mx-2 ${
                          stageStatus[stage] === 'GREEN' ? 'bg-green-500' : 'bg-slate-700'
                        }`} />
                      )}
                    </div>
                  ))}
                </div>

                {/* Field Sections */}
                {STAGES.map((stage) => {
                  const stageKey = stageToKey(stage);
                  return (
                    <FieldSection
                      key={stage}
                      stage={stage}
                      stageKey={stageKey}
                      content={fieldContent[stageKey]}
                      setContent={(value) => setFieldContent(prev => ({ ...prev, [stageKey]: value }))}
                      status={stageStatus[stage]}
                      aiResponse={aiResponses[stageKey]}
                      isLoading={loadingField === stageKey}
                      isLocked={!isStageUnlocked(stage)}
                      onConsult={() => handleConsult(stageKey)}
                      onValidate={() => handleValidate(stageKey)}
                      onRefinement={(feedback) => handleRefinement(stageKey, feedback)}
                      cascadeDraft={
                        stageKey === 'mercado' ? cascadeDrafts.mercado :
                        stageKey === 'negocio' ? cascadeDrafts.negocio : undefined
                      }
                      onAcceptDraft={() => handleAcceptDraft(stageKey)}
                      insights={insights}
                    />
                  );
                })}

                {/* Actions */}
                <div className="flex gap-4 pt-4">
                  <button
                    onClick={() => router.push('/dashboard')}
                    className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-medium"
                  >
                    Ir al Dashboard
                  </button>
                  {stageStatus.Ejecución === 'GREEN' && (
                    <button
                      onClick={() => router.push(`/projects/${projectId}`)}
                      className="flex-1 py-3 bg-green-600 hover:bg-green-500 rounded-lg font-medium flex items-center justify-center gap-2"
                    >
                      <Check className="w-5 h-5" />
                      Proyecto Validado - Ver Detalles
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </main>

        {/* Milestones Sidebar */}
        {showMilestones && projectId && (
          <MilestonesSidebar
            projectId={projectId}
            milestones={milestones}
            onRefresh={fetchMilestones}
          />
        )}

        {/* Prompt Architect Sidebar */}
        {showPromptArchitect && projectId && (
          <PromptArchitect
            stage={STAGES.find(s => stageStatus[s] !== 'GREEN') || 'Concepto'}
            projectTitle={title}
            projectDescription={description}
            insights={insights}
          />
        )}
      </div>
    </div>
  );
}
