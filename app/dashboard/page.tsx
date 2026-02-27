/**
 * =============================================================================
 * STRATEGIC INTELLIGENCE ENGINE - DASHBOARD PAGE
 * =============================================================================
 * QA AUDIT NOTES:
 * - Lists all user projects with traffic light status indicators
 * - Red highlight for overdue projects (currentDate > endDate && status != completed)
 * - Click to view project details
 * - Quick access to create new projects
 * =============================================================================
 */

'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Plus, Folder, Calendar, AlertTriangle, Loader2, RefreshCw } from 'lucide-react';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================
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

// =============================================================================
// TRAFFIC LIGHT COMPONENT
// QA: Visual status indicator for each stage
// =============================================================================
function TrafficLight({ status, label }: { status: 'RED' | 'YELLOW' | 'GREEN'; label: string }) {
  const colors = {
    RED: 'bg-red-500',
    YELLOW: 'bg-yellow-500',
    GREEN: 'bg-green-500'
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`w-3 h-3 rounded-full ${colors[status]} shadow-lg`} />
      <span className="text-xs text-slate-400">{label}</span>
    </div>
  );
}

// =============================================================================
// MAIN DASHBOARD COMPONENT
// =============================================================================
export default function DashboardPage() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch projects on mount
  useEffect(() => {
    if (sessionStatus === 'authenticated') {
      fetchProjects();
    } else if (sessionStatus === 'unauthenticated') {
      router.push('/');
    }
  }, [sessionStatus, router]);

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/projects');
      if (!response.ok) throw new Error('Failed to fetch projects');
      const data = await response.json();
      setProjects(data.projects || []);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  // Check if project is overdue
  const isOverdue = (project: Project): boolean => {
    if (!project.endDate || project.status === 'completed') return false;
    return new Date() > new Date(project.endDate);
  };

  // Format date for display
  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return 'No date';
    return new Date(dateStr).toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  // Loading state
  if (loading || sessionStatus === 'loading') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="border-b border-slate-800 p-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Strategic Intelligence Dashboard</h1>
            <p className="text-slate-400 mt-1">
              Welcome, {session?.user?.name || 'User'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchProjects}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors"
            >
              <RefreshCw className="w-5 h-5 text-slate-400" />
            </button>
            <button
              onClick={() => router.push('/projects/new')}
              className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 rounded-lg font-medium transition-colors"
            >
              <Plus className="w-5 h-5" />
              New Project
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-7xl mx-auto p-6">
        {/* Error State */}
        {error && (
          <div className="mb-6 p-4 bg-red-900/20 border border-red-700 rounded-lg text-red-400">
            {error}
          </div>
        )}

        {/* Stats Overview */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
            <p className="text-sm text-slate-400">Total Projects</p>
            <p className="text-3xl font-bold">{projects.length}</p>
          </div>
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
            <p className="text-sm text-slate-400">In Progress</p>
            <p className="text-3xl font-bold text-amber-400">
              {projects.filter(p => p.status !== 'completed').length}
            </p>
          </div>
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
            <p className="text-sm text-slate-400">Completed</p>
            <p className="text-3xl font-bold text-green-400">
              {projects.filter(p => p.status === 'completed').length}
            </p>
          </div>
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
            <p className="text-sm text-slate-400">Overdue</p>
            <p className="text-3xl font-bold text-red-400">
              {projects.filter(p => isOverdue(p)).length}
            </p>
          </div>
        </div>

        {/* Projects List */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Your Projects</h2>
          
          {projects.length === 0 ? (
            <div className="p-12 rounded-xl bg-slate-900 border border-slate-800 text-center">
              <Folder className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No projects yet</h3>
              <p className="text-slate-400 mb-4">Create your first project to get started</p>
              <button
                onClick={() => router.push('/projects/new')}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 rounded-lg font-medium"
              >
                Create Project
              </button>
            </div>
          ) : (
            <div className="grid gap-4">
              {projects.map((project) => (
                <div
                  key={project.id}
                  onClick={() => router.push(`/projects/${project.id}`)}
                  className={`p-5 rounded-xl cursor-pointer transition-all
                    ${isOverdue(project) 
                      ? 'bg-red-900/20 border-2 border-red-700 hover:bg-red-900/30' 
                      : 'bg-slate-900 border border-slate-800 hover:border-slate-700'
                    }`}
                >
                  <div className="flex items-start justify-between">
                    {/* Project Info */}
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="text-lg font-semibold">{project.title}</h3>
                        {isOverdue(project) && (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-red-900 text-red-300 text-xs">
                            <AlertTriangle className="w-3 h-3" />
                            Overdue
                          </span>
                        )}
                        <span className={`px-2 py-0.5 rounded text-xs font-medium
                          ${project.status === 'completed' ? 'bg-green-900 text-green-300' :
                            project.status === 'development' ? 'bg-blue-900 text-blue-300' :
                            project.status === 'execution' ? 'bg-purple-900 text-purple-300' :
                            'bg-slate-800 text-slate-300'}`}
                        >
                          {project.status}
                        </span>
                      </div>
                      <p className="text-slate-400 text-sm mt-1 line-clamp-1">
                        {project.description || 'No description'}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {project.startDate 
                            ? `${formatDate(project.startDate)} - ${formatDate(project.endDate)}`
                            : 'No dates set'}
                        </span>
                      </div>
                    </div>

                    {/* Traffic Lights */}
                    <div className="flex items-center gap-4 ml-6">
                      <TrafficLight status={project.conceptStatus} label="Concepto" />
                      <TrafficLight status={project.marketStatus} label="Mercado" />
                      <TrafficLight status={project.businessStatus} label="Negocio" />
                      <TrafficLight status={project.executionStatus} label="Ejecución" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
