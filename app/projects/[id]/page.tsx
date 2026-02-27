/**
 * =============================================================================
 * PROJECT DETAIL PAGE
 * =============================================================================
 * QA AUDIT NOTES:
 * - Shows full project details with validation status
 * - Traffic light indicators for all 4 stages
 * - Continue validation from any stage
 * - View insights and generated prompts
 * =============================================================================
 */

'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import PromptArchitect from '@/components/PromptArchitect';
import {
  Loader2, ArrowLeft, Calendar, Clock, Edit, Trash2,
  Check, AlertTriangle, ChevronRight
} from 'lucide-react';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================
type Stage = 'Concepto' | 'Mercado' | 'Negocio' | 'Ejecución';

interface Project {
  id: string;
  title: string;
  description: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  conceptStatus: 'RED' | 'YELLOW' | 'GREEN';
  marketStatus: 'RED' | 'YELLOW' | 'GREEN';
  businessStatus: 'RED' | 'YELLOW' | 'GREEN';
  executionStatus: 'RED' | 'YELLOW' | 'GREEN';
  createdAt: string;
  updatedAt: string;
}

interface ConceptInsight {
  id: string;
  question: string;
  answer: string | null;
  stage: string;
}

// =============================================================================
// STAGE INDICATOR COMPONENT
// =============================================================================
function StageCard({
  stage,
  status,
  onClick
}: {
  stage: string;
  status: 'RED' | 'YELLOW' | 'GREEN';
  onClick: () => void;
}) {
  const colors = {
    RED: 'border-red-500 bg-red-900/20',
    YELLOW: 'border-yellow-500 bg-yellow-900/20',
    GREEN: 'border-green-500 bg-green-900/20'
  };

  const dotColors = {
    RED: 'bg-red-500',
    YELLOW: 'bg-yellow-500',
    GREEN: 'bg-green-500'
  };

  return (
    <button
      onClick={onClick}
      className={`p-4 rounded-xl border-2 ${colors[status]} transition-all hover:scale-105 cursor-pointer`}
    >
      <div className="flex items-center gap-3">
        <div className={`w-4 h-4 rounded-full ${dotColors[status]}`} />
        <span className="font-medium text-white">{stage}</span>
      </div>
      <p className="text-xs text-slate-400 mt-2">
        {status === 'GREEN' ? 'Validated' : status === 'YELLOW' ? 'In Progress' : 'Not Started'}
      </p>
    </button>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================
export default function ProjectDetailPage() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [insights, setInsights] = useState<ConceptInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeStage, setActiveStage] = useState<Stage>('Concepto');
  const [showPromptArchitect, setShowPromptArchitect] = useState(false);

  // Fetch project on mount
  useEffect(() => {
    if (sessionStatus === 'authenticated' && projectId) {
      fetchProject();
      fetchInsights();
    } else if (sessionStatus === 'unauthenticated') {
      router.push('/');
    }
  }, [sessionStatus, projectId, router]);

  const fetchProject = async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}`);
      if (!response.ok) throw new Error('Failed to fetch project');
      const data = await response.json();
      setProject(data.project);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const fetchInsights = async () => {
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

  const isOverdue = (): boolean => {
    if (!project?.endDate || project.status === 'completed') return false;
    return new Date() > new Date(project.endDate);
  };

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return 'Not set';
    return new Date(dateStr).toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  // Loading
  if (loading || sessionStatus === 'loading') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
      </div>
    );
  }

  // Error or not found
  if (error || !project) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-white mb-2">Project Not Found</h1>
          <p className="text-slate-400 mb-4">{error || 'This project does not exist'}</p>
          <button
            onClick={() => router.push('/dashboard')}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 rounded-lg font-medium text-white"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="border-b border-slate-800 p-4">
        <div className="max-w-5xl mx-auto flex items-center gap-4">
          <button
            onClick={() => router.push('/dashboard')}
            className="p-2 rounded-lg hover:bg-slate-800"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold">{project.title}</h1>
              {isOverdue() && (
                <span className="flex items-center gap-1 px-2 py-1 rounded bg-red-900 text-red-300 text-xs">
                  <AlertTriangle className="w-3 h-3" />
                  Overdue
                </span>
              )}
            </div>
            <p className="text-sm text-slate-400">Created {formatDate(project.createdAt)}</p>
          </div>
          <button
            onClick={() => setShowPromptArchitect(!showPromptArchitect)}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg font-medium"
          >
            Prompt Architect
          </button>
        </div>
      </header>

      <div className={`${showPromptArchitect ? 'mr-96' : ''}`}>
        <main className="max-w-5xl mx-auto p-6 space-y-6">
          {/* Stage Overview */}
          <section className="grid grid-cols-4 gap-4">
            <StageCard
              stage="Concepto"
              status={project.conceptStatus}
              onClick={() => setActiveStage('Concepto')}
            />
            <StageCard
              stage="Mercado"
              status={project.marketStatus}
              onClick={() => setActiveStage('Mercado')}
            />
            <StageCard
              stage="Negocio"
              status={project.businessStatus}
              onClick={() => setActiveStage('Negocio')}
            />
            <StageCard
              stage="Ejecución"
              status={project.executionStatus}
              onClick={() => setActiveStage('Ejecución')}
            />
          </section>

          {/* Project Details */}
          <section className="grid grid-cols-3 gap-6">
            <div className="col-span-2 p-6 rounded-xl bg-slate-900 border border-slate-800">
              <h2 className="text-lg font-semibold mb-4">Description</h2>
              <p className="text-slate-300 whitespace-pre-wrap">
                {project.description || 'No description provided'}
              </p>
            </div>
            <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
              <h2 className="text-lg font-semibold">Timeline</h2>
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-slate-400" />
                <div>
                  <p className="text-xs text-slate-400">Start Date</p>
                  <p className="text-sm">{formatDate(project.startDate)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-slate-400" />
                <div>
                  <p className="text-xs text-slate-400">End Date</p>
                  <p className={`text-sm ${isOverdue() ? 'text-red-400' : ''}`}>
                    {formatDate(project.endDate)}
                  </p>
                </div>
              </div>
              <div className="pt-4 border-t border-slate-700">
                <p className="text-xs text-slate-400">Status</p>
                <p className="text-sm font-medium capitalize">{project.status}</p>
              </div>
            </div>
          </section>

          {/* Stage Insights */}
          <section className="p-6 rounded-xl bg-slate-900 border border-slate-800">
            <h2 className="text-lg font-semibold mb-4">
              {activeStage} Insights
            </h2>
            
            {insights.filter(i => i.stage === activeStage).length === 0 ? (
              <div className="text-center py-8">
                <p className="text-slate-400 mb-4">No insights for this stage yet</p>
                <button
                  onClick={() => router.push(`/projects/new?continue=${projectId}&stage=${activeStage}`)}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 rounded-lg font-medium"
                >
                  Start Validation
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {insights
                  .filter(i => i.stage === activeStage)
                  .map((insight) => (
                    <div
                      key={insight.id}
                      className="p-4 rounded-lg bg-slate-800 border border-slate-700"
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-2 h-2 rounded-full mt-2 ${
                          insight.answer ? 'bg-green-500' : 'bg-yellow-500'
                        }`} />
                        <div className="flex-1">
                          <p className="text-amber-400 text-sm mb-2">{insight.question}</p>
                          {insight.answer ? (
                            <p className="text-slate-300">{insight.answer}</p>
                          ) : (
                            <p className="text-slate-500 italic">Awaiting answer</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </section>
        </main>
      </div>

      {/* Prompt Architect Sidebar */}
      {showPromptArchitect && (
        <PromptArchitect
          stage={activeStage}
          projectTitle={project.title}
          projectDescription={project.description || ''}
          insights={insights}
        />
      )}
    </div>
  );
}
