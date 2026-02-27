/**
 * =============================================================================
 * STRATEGIC INTELLIGENCE ENGINE - CONCEPT VALIDATION API
 * =============================================================================
 * QA AUDIT NOTES:
 * - Uses Gemini 1.5 Pro for INVEST criteria analysis
 * - INVEST: Independent, Negotiable, Valuable, Estimable, Small, Testable
 * - Generates sequential questions based on detected gaps
 * - Saves Q&A pairs to ConceptInsight table
 * - Returns next question or GREEN status when validated
 * =============================================================================
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth-options';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || '');

// =============================================================================
// INVEST CRITERIA DEFINITIONS
// QA: Used for systematic concept evaluation
// =============================================================================
const INVEST_CRITERIA = {
  Independent: 'Can this concept be developed independently without dependencies on other projects?',
  Negotiable: 'Is the scope flexible enough to adapt to feedback and changes?',
  Valuable: 'Does this provide clear value to the end user or stakeholder?',
  Estimable: 'Can the effort and resources required be reasonably estimated?',
  Small: 'Is the scope small enough to be completed within a reasonable timeframe?',
  Testable: 'Are there clear criteria to test and validate success?'
};

// =============================================================================
// STAGE DEFINITIONS
// QA: 4 validation stages with specific focus areas
// =============================================================================
const STAGE_CONFIG = {
  Concepto: {
    focus: 'Core idea clarity and problem definition',
    criteria: ['Independent', 'Valuable', 'Testable']
  },
  Mercado: {
    focus: 'Market validation and competitive analysis',
    criteria: ['Valuable', 'Negotiable']
  },
  Negocio: {
    focus: 'Business model and value proposition',
    criteria: ['Valuable', 'Estimable']
  },
  Ejecución: {
    focus: 'Execution plan and resource requirements',
    criteria: ['Estimable', 'Small', 'Testable']
  }
};

// =============================================================================
// MAIN POST HANDLER
// QA: Analyzes project description and generates validation questions
// =============================================================================
export async function POST(request: NextRequest) {
  console.log('[CONCEPT VALIDATE] Starting validation request');
  
  try {
    // Auth check
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      console.log('[CONCEPT VALIDATE] Unauthorized - no session');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { projectId, description, stage, answer, questionId } = body;

    console.log(`[CONCEPT VALIDATE] Project: ${projectId}, Stage: ${stage}`);

    // Get user
    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // If answering a question, save the answer
    if (questionId && answer) {
      console.log(`[CONCEPT VALIDATE] Saving answer for question: ${questionId}`);
      await prisma.conceptInsight.update({
        where: { id: questionId },
        data: { answer }
      });
    }

    // Get project with existing insights
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { conceptInsights: true }
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Get existing insights for current stage
    const stageInsights = project.conceptInsights.filter(
      (insight) => insight.stage === stage
    );

    // Count answered questions
    const answeredCount = stageInsights.filter((i) => i.answer).length;
    const unansweredInsights = stageInsights.filter((i) => !i.answer);

    console.log(`[CONCEPT VALIDATE] Stage insights: ${stageInsights.length}, Answered: ${answeredCount}`);

    // If there's an unanswered question, return it
    if (unansweredInsights.length > 0) {
      return NextResponse.json({
        status: 'YELLOW',
        question: {
          id: unansweredInsights[0].id,
          text: unansweredInsights[0].question,
          stage
        },
        progress: {
          answered: answeredCount,
          total: stageInsights.length
        }
      });
    }

    // Analyze with Gemini to get next question or GREEN status
    const analysisResult = await analyzeWithGemini(
      description || project.description || '',
      stage,
      stageInsights
    );

    console.log(`[CONCEPT VALIDATE] Gemini analysis result: ${analysisResult.status}`);

    if (analysisResult.status === 'GREEN') {
      // Update project status for this stage
      const statusField = getStatusField(stage);
      if (statusField) {
        await prisma.project.update({
          where: { id: projectId },
          data: { [statusField]: 'GREEN' }
        });
      }

      return NextResponse.json({
        status: 'GREEN',
        message: `${stage} stage validated successfully!`,
        summary: analysisResult.summary
      });
    }

    // Save new question
    const newInsight = await prisma.conceptInsight.create({
      data: {
        projectId,
        question: analysisResult.question,
        stage
      }
    });

    // Update project status to YELLOW
    const statusField = getStatusField(stage);
    if (statusField) {
      await prisma.project.update({
        where: { id: projectId },
        data: { [statusField]: 'YELLOW' }
      });
    }

    return NextResponse.json({
      status: 'YELLOW',
      question: {
        id: newInsight.id,
        text: newInsight.question,
        stage
      },
      progress: {
        answered: answeredCount,
        total: stageInsights.length + 1
      }
    });

  } catch (error) {
    console.error('[CONCEPT VALIDATE] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}

// =============================================================================
// GEMINI ANALYSIS FUNCTION
// QA: Uses INVEST criteria to evaluate concept and generate questions
// =============================================================================
async function analyzeWithGemini(
  description: string,
  stage: string,
  existingInsights: Array<{ question: string; answer: string | null }>
): Promise<{ status: 'GREEN' | 'YELLOW'; question?: string; summary?: string }> {
  
  const stageConfig = STAGE_CONFIG[stage as keyof typeof STAGE_CONFIG];
  if (!stageConfig) {
    return { status: 'GREEN', summary: 'Unknown stage' };
  }

  const relevantCriteria = stageConfig.criteria
    .map((c) => `${c}: ${INVEST_CRITERIA[c as keyof typeof INVEST_CRITERIA]}`)
    .join('\n');

  const existingQA = existingInsights
    .map((i) => `Q: ${i.question}\nA: ${i.answer || 'Not answered yet'}`)
    .join('\n\n');

  const prompt = `You are a strategic concept validator using INVEST criteria.

STAGE: ${stage}
FOCUS: ${stageConfig.focus}

RELEVANT CRITERIA:
${relevantCriteria}

PROJECT DESCRIPTION:
${description}

EXISTING Q&A FOR THIS STAGE:
${existingQA || 'None yet'}

Your task:
1. Evaluate if the concept is fully validated for the ${stage} stage based on INVEST criteria
2. If NOT fully validated, generate ONE specific question that addresses the most critical gap
3. If fully validated (all relevant criteria satisfied), return GREEN status

Rules:
- Questions should be specific and actionable
- Don't repeat questions that have already been asked
- Maximum 5 questions per stage before forcing GREEN
- Questions should be in Spanish for consistency with stage names

Respond in JSON format:
{
  "status": "GREEN" or "YELLOW",
  "question": "Your question here (only if YELLOW)",
  "summary": "Brief summary of validation status",
  "criteria_met": ["list of INVEST criteria met"]
}`;

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
    const result = await model.generateContent(prompt);
    const response = result.response.text();
    
    // Parse JSON response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      
      // Force GREEN after 5 questions
      if (existingInsights.filter((i) => i.answer).length >= 5) {
        return {
          status: 'GREEN',
          summary: 'Maximum questions reached. Stage validated.'
        };
      }
      
      return {
        status: parsed.status,
        question: parsed.question,
        summary: parsed.summary
      };
    }
    
    return { status: 'GREEN', summary: 'Analysis complete' };
    
  } catch (error) {
    console.error('[CONCEPT VALIDATE] Gemini error:', error);
    // Default to asking a basic question on error
    return {
      status: 'YELLOW',
      question: `¿Puede describir más detalladamente el aspecto de ${stage.toLowerCase()} de su proyecto?`
    };
  }
}

// =============================================================================
// HELPER: Get status field name for stage
// =============================================================================
function getStatusField(stage: string): string | null {
  const mapping: Record<string, string> = {
    'Concepto': 'conceptStatus',
    'Mercado': 'marketStatus',
    'Negocio': 'businessStatus',
    'Ejecución': 'executionStatus'
  };
  return mapping[stage] || null;
}

// =============================================================================
// GET: Retrieve validation status for a project
// =============================================================================
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID required' }, { status: 400 });
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        conceptStatus: true,
        marketStatus: true,
        businessStatus: true,
        executionStatus: true,
        conceptInsights: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    return NextResponse.json({
      stages: {
        Concepto: project.conceptStatus,
        Mercado: project.marketStatus,
        Negocio: project.businessStatus,
        Ejecución: project.executionStatus
      },
      insights: project.conceptInsights
    });

  } catch (error) {
    console.error('[CONCEPT VALIDATE] GET Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
