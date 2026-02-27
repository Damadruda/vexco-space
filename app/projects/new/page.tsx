/**
 * =============================================================================
 * STRATEGIC INTELLIGENCE ENGINE - PROJECT CREATION PAGE
 * =============================================================================
 * QA AUDIT NOTES:
 * - Toggle: Manual vs Import from Drive
 * - Drive mode with folder ID 1ekDx8PsLfS2Dgn4C7qMTYRcx_yDti2Lh → Expert Mode
 * - Interactive concept validation form with Gemini questions
 * - Traffic light indicators for 4 stages
 * - Block later stages if current not GREEN
 * - Integrates PromptArchitect sidebar
 * =============================================================================
 */

'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import PromptArchitect from '@/components/PromptArchitect';
import { 
  Loader2, ArrowLeft, FolderOpen, FileText, Send, 
  Check, AlertCircle, Lock, ChevronRight 
} from 'lucide-react';

// =============================================================================
// CONSTANTS
// =============================================================================
const EXPERT_MODE_FOLDER_ID = '1ekDx8PsLfS2Dgn4C7qMTYRcx_yDti2Lh';

// Stage configuration
const STAGES = ['Concepto', 'Mercado', 'Negocio', 'Ejecución'] as const;
type Stage = typeof STAGES[number];

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================
interface ValidationQuestion {
  id: string;
  text: string;
  stage: string;
}

interface ConceptInsight {
  id: string;
  question: string;
  answer: string | null;
  stage: string;
}

// =============================================================================
// TRAFFIC LIGHT INDICATOR COMPONENT
// =============================================================================
function StageIndicator({ 
  stage, 
  status, 
  isActive, 
  isLocked, 
  onClick 
}: { 
  stage: string; 
  status: 'RED' | 'YELLOW' | 'GREEN'; 
  isActive: boolean;
  isLocked: boolean;
  onClick: () => void;
}) {
  const colors = {
    RED: 'bg-red-500',
    YELLOW: 'bg-yellow-500',
    GREEN: 'bg-green-500'
  };

  return (
    <button
      onClick={onClick}
      disabled={isLocked}
      className={`flex items-center gap-3 p-4 rounded-xl transition-all w-full
        ${isActive ? 'bg-slate-700 border-2 border-amber-500' : 'bg-slate-800 border border-slate-700'}
        ${isLocked ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-700 cursor-pointer'}
      `}
    >
      <div className={`w-4 h-4 rounded-full ${colors[status]} shadow-lg`} />
      <span className={`font-medium ${isActive ? 'text-white' : 'text-slate-300'}`}>
        {stage}
      </span>
      {isLocked && <Lock className="w-4 h-4 text-slate-500 ml-auto" />}
      {!isLocked && isActive && <ChevronRight className="w-4 h-4 text-amber-400 ml-auto" />}
    </button>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================
export default function NewProjectPage() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();

  // Form state
  const [mode, setMode] = useState<'manual' | 'drive'>('manual');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [folderId, setFolderId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  // Validation state
  const [projectId, setProjectId] = useState<string | null>(null);
  const [currentStage, setCurrentStage] = useState<Stage>('Concepto');
  const [stageStatus, setStageStatus] = useState<Record<Stage, 'RED' | 'YELLOW' | 'GREEN'>>({
    Concepto: 'RED',
    Mercado: 'RED',
    Negocio: 'RED',
    Ejecución: 'RED'
  });
  const [currentQuestion, setCurrentQuestion] = useState<ValidationQuestion | null>(null);
  const [answer, setAnswer] = useState('');
  const [insights, setInsights] = useState<ConceptInsight[]>([]);
  
  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExpertMode, setIsExpertMode] = useState(false);
  const [showPromptArchitect, setShowPromptArchitect] = useState(false);

  // Auth redirect
  useEffect(() => {
    if (sessionStatus === 'unauthenticated') {
      router.push('/');
    }
  }, [sessionStatus, router]);

  // Check for Expert Mode when folder ID changes
  useEffect(() => {
    setIsExpertMode(folderId === EXPERT_MODE_FOLDER_ID);
  }, [folderId]);

  // ==========================================================================
  // CREATE PROJECT HANDLER
  // ==========================================================================
  const handleCreateProject = async () => {
    if (!title.trim()) {
      setError('Project title is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Create the project
      const createResponse = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          startDate: startDate || null,
          endDate: endDate || null
        })
      });

      if (!createResponse.ok) {
        const data = await createResponse.json();
        throw new Error(data.error || 'Failed to create project');
      }

      const { project } = await createResponse.json();
      setProjectId(project.id);

      // If Drive mode, analyze folder
      if (mode === 'drive' && folderId) {
        console.log('[NEW PROJECT] Analyzing Drive folder...');
        const analyzeResponse = await fetch('/api/drive/analyze-folder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            folderId,
            projectId: project.id 
          })
        });

        if (analyzeResponse.ok) {
          const analyzeData = await analyzeResponse.json();
          console.log('[NEW PROJECT] Folder analysis complete:', analyzeData);
          
          // Update description with extracted info
          if (analyzeData.summary) {
            setDescription(prev => prev + '\n\n' + analyzeData.summary);
          }
        }
      }

      // Start concept validation
      await startValidation(project.id, description);

    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  // ==========================================================================
  // VALIDATION HANDLERS
  // ==========================================================================
  const startValidation = async (projId: string, desc: string) => {
    setLoading(true);
    try {
      const response = await fetch('/api/concept/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: projId,
          description: desc,
          stage: currentStage
        })
      });

      if (!response.ok) throw new Error('Validation request failed');

      const data = await response.json();
      handleValidationResponse(data);

    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const submitAnswer = async () => {
    if (!currentQuestion || !answer.trim() || !projectId) return;

    setLoading(true);
    try {
      const response = await fetch('/api/concept/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          description,
          stage: currentStage,
          questionId: currentQuestion.id,
          answer
        })
      });

      if (!response.ok) throw new Error('Submit failed');

      const data = await response.json();
      handleValidationResponse(data);
      setAnswer('');

    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleValidationResponse = (data: any) => {
    // Update stage status
    setStageStatus(prev => ({
      ...prev,
      [currentStage]: data.status
    }));

    if (data.status === 'GREEN') {
      // Stage complete - move to next or show prompt architect
      setCurrentQuestion(null);
      setShowPromptArchitect(true);
      
      // Refresh insights
      fetchInsights();
      
    } else if (data.question) {
      // New question to answer
      setCurrentQuestion(data.question);
    }
  };

  const fetchInsights = async () => {
    if (!projectId) return;
    
    try {
      const response = await fetch(`/api/concept/validate?projectId=${projectId}`);
      if (response.ok) {
        const data = await response.json();
        setInsights(data.insights || []);
        
        // Update stage statuses
        if (data.stages) {
          setStageStatus({
            Concepto: data.stages.Concepto,
            Mercado: data.stages.Mercado,
            Negocio: data.stages.Negocio,
            Ejecución: data.stages.Ejecución
          });
        }
      }
    } catch (err) {
      console.error('Failed to fetch insights:', err);
    }
  };

  const handleStageClick = (stage: Stage) => {
    const stageIndex = STAGES.indexOf(stage);
    const prevStageIndex = stageIndex - 1;
    
    // Check if previous stage is GREEN (or if this is the first stage)
    if (prevStageIndex < 0 || stageStatus[STAGES[prevStageIndex]] === 'GREEN') {
      setCurrentStage(stage);
      if (projectId) {
        startValidation(projectId, description);
      }
    }
  };

  const isStageUnlocked = (stage: Stage): boolean => {
    const stageIndex = STAGES.indexOf(stage);
    if (stageIndex === 0) return true;
    return stageStatus[STAGES[stageIndex - 1]] === 'GREEN';
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
      <header className="border-b border-slate-800 p-4">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <button
            onClick={() => router.push('/dashboard')}
            className="p-2 rounded-lg hover:bg-slate-800"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold">
              {projectId ? 'Validate Project' : 'Create New Project'}
            </h1>
            <p className="text-sm text-slate-400">
              {projectId ? 'Answer questions to validate your concept' : 'Set up your project details'}
            </p>
          </div>
          {isExpertMode && (
            <span className="ml-auto px-3 py-1 bg-purple-900 text-purple-300 rounded-full text-sm font-medium">
              ⚡ Expert Mode
            </span>
          )}
        </div>
      </header>

      <div className={`flex ${showPromptArchitect ? 'mr-96' : ''}`}>
        {/* Main Content */}
        <main className="flex-1 max-w-4xl mx-auto p-6">
          {/* Error Display */}
          {error && (
            <div className="mb-6 p-4 bg-red-900/20 border border-red-700 rounded-lg flex items-center gap-3 text-red-400">
              <AlertCircle className="w-5 h-5" />
              {error}
              <button onClick={() => setError(null)} className="ml-auto text-red-300 hover:text-white">✕</button>
            </div>
          )}

          {!projectId ? (
            /* Project Creation Form */
            <div className="space-y-6">
              {/* Mode Toggle */}
              <div className="flex gap-4 p-1 bg-slate-800 rounded-xl w-fit">
                <button
                  onClick={() => setMode('manual')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors
                    ${mode === 'manual' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'}`}
                >
                  <FileText className="w-4 h-4" />
                  Manual
                </button>
                <button
                  onClick={() => setMode('drive')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors
                    ${mode === 'drive' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'}`}
                >
                  <FolderOpen className="w-4 h-4" />
                  Import from Drive
                </button>
              </div>

              {/* Form Fields */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Project Title *
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Enter project title"
                    className="w-full p-3 rounded-lg bg-slate-800 border border-slate-700 focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Description
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe your project concept..."
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
                      placeholder="Enter folder ID from Drive URL"
                      className="w-full p-3 rounded-lg bg-slate-800 border border-slate-700 focus:border-amber-500 focus:outline-none font-mono text-sm"
                    />
                    {isExpertMode && (
                      <p className="mt-2 text-sm text-purple-400">
                        ⚡ Expert Mode activated: Pattern Extraction Engine enabled
                      </p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Start Date
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
                      End Date
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
                      Creating...
                    </>
                  ) : (
                    <>
                      Create & Start Validation
                      <ChevronRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            /* Validation Interface */
            <div className="space-y-6">
              {/* Stage Navigation */}
              <div className="grid grid-cols-4 gap-3">
                {STAGES.map((stage) => (
                  <StageIndicator
                    key={stage}
                    stage={stage}
                    status={stageStatus[stage]}
                    isActive={currentStage === stage}
                    isLocked={!isStageUnlocked(stage)}
                    onClick={() => handleStageClick(stage)}
                  />
                ))}
              </div>

              {/* Current Stage Validation */}
              <div className="p-6 rounded-xl bg-slate-900 border border-slate-800">
                <h2 className="text-lg font-semibold mb-4">
                  Stage: {currentStage}
                </h2>

                {stageStatus[currentStage] === 'GREEN' ? (
                  <div className="text-center py-8">
                    <Check className="w-16 h-16 text-green-400 mx-auto mb-4" />
                    <h3 className="text-xl font-medium text-green-400 mb-2">
                      Stage Validated!
                    </h3>
                    <p className="text-slate-400 mb-4">
                      This stage has been successfully validated. You can now proceed to the next stage or generate prompts.
                    </p>
                    {currentStage !== 'Ejecución' && (
                      <button
                        onClick={() => {
                          const nextIndex = STAGES.indexOf(currentStage) + 1;
                          if (nextIndex < STAGES.length) {
                            handleStageClick(STAGES[nextIndex]);
                          }
                        }}
                        className="px-6 py-2 bg-amber-600 hover:bg-amber-500 rounded-lg font-medium"
                      >
                        Continue to {STAGES[STAGES.indexOf(currentStage) + 1]}
                      </button>
                    )}
                  </div>
                ) : currentQuestion ? (
                  <div className="space-y-4">
                    <div className="p-4 rounded-lg bg-slate-800">
                      <p className="text-sm text-amber-400 mb-2">Question:</p>
                      <p className="text-lg">{currentQuestion.text}</p>
                    </div>

                    <div>
                      <textarea
                        value={answer}
                        onChange={(e) => setAnswer(e.target.value)}
                        placeholder="Type your answer..."
                        rows={4}
                        className="w-full p-3 rounded-lg bg-slate-800 border border-slate-700 focus:border-amber-500 focus:outline-none resize-none"
                      />
                    </div>

                    <button
                      onClick={submitAnswer}
                      disabled={loading || !answer.trim()}
                      className="px-6 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg font-medium flex items-center gap-2"
                    >
                      {loading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                      Submit Answer
                    </button>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Loader2 className="w-8 h-8 text-amber-400 animate-spin mx-auto mb-4" />
                    <p className="text-slate-400">Analyzing your concept...</p>
                  </div>
                )}
              </div>

              {/* Previous Q&A */}
              {insights.filter(i => i.stage === currentStage && i.answer).length > 0 && (
                <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800">
                  <h3 className="text-sm font-medium text-slate-400 mb-3">
                    Previous Answers for {currentStage}
                  </h3>
                  <div className="space-y-3">
                    {insights
                      .filter(i => i.stage === currentStage && i.answer)
                      .map((insight) => (
                        <div key={insight.id} className="p-3 rounded-lg bg-slate-800">
                          <p className="text-sm text-amber-400 mb-1">{insight.question}</p>
                          <p className="text-sm text-slate-300">{insight.answer}</p>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Finish & Go to Dashboard */}
              {stageStatus.Concepto === 'GREEN' && (
                <div className="flex gap-4">
                  <button
                    onClick={() => setShowPromptArchitect(!showPromptArchitect)}
                    className="flex-1 py-3 bg-purple-600 hover:bg-purple-500 rounded-lg font-medium"
                  >
                    {showPromptArchitect ? 'Hide' : 'Show'} Prompt Architect
                  </button>
                  <button
                    onClick={() => router.push('/dashboard')}
                    className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-medium"
                  >
                    Go to Dashboard
                  </button>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Prompt Architect Sidebar */}
      {showPromptArchitect && projectId && (
        <PromptArchitect
          stage={currentStage}
          projectTitle={title}
          projectDescription={description}
          insights={insights}
        />
      )}
    </div>
  );
}
