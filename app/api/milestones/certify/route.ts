/**
 * =============================================================================
 * STRATEGIC PM LAB - MILESTONE CERTIFICATION API
 * =============================================================================
 * QA AUDIT NOTES:
 * - AI audits project content to certify milestone completion
 * - User cannot manually mark milestones - AI certifies based on evidence
 * - Certification includes reason and timestamp
 * =============================================================================
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth-options';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || '');

// =============================================================================
// POST HANDLER - Request Certification
// =============================================================================
export async function POST(request: NextRequest) {
  console.log('[MILESTONE CERTIFY] Starting certification request');
  
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { milestoneId, evidence } = body;

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get milestone with project and insights
    const milestone = await prisma.milestone.findUnique({
      where: { id: milestoneId },
      include: {
        project: {
          include: {
            conceptInsights: true
          }
        }
      }
    });

    if (!milestone) {
      return NextResponse.json({ error: 'Milestone not found' }, { status: 404 });
    }

    if (milestone.isCertified) {
      return NextResponse.json({
        success: true,
        alreadyCertified: true,
        milestone
      });
    }

    // Build context for AI certification
    const projectContext = buildProjectContext(milestone.project);
    
    // AI certification
    const certification = await performAICertification(milestone, projectContext, evidence);

    if (certification.certified) {
      // Update milestone as certified
      const updatedMilestone = await prisma.milestone.update({
        where: { id: milestoneId },
        data: {
          isCompleted: true,
          isCertified: true,
          certifiedAt: new Date(),
          certificationReason: certification.reason
        }
      });

      // Save certification record to ConceptInsight
      await prisma.conceptInsight.create({
        data: {
          projectId: milestone.projectId,
          question: `Certificación de milestone: ${milestone.title}`,
          answer: evidence || 'Evidencia proporcionada durante certificación',
          stage: 'Ejecución',
          analysisType: 'certification',
          aiSuggestion: certification.reason
        }
      });

      return NextResponse.json({
        success: true,
        certified: true,
        milestone: updatedMilestone,
        reason: certification.reason
      });
    } else {
      return NextResponse.json({
        success: true,
        certified: false,
        reason: certification.reason,
        missingEvidence: certification.missingEvidence,
        suggestions: certification.suggestions
      });
    }

  } catch (error) {
    console.error('[MILESTONE CERTIFY] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// =============================================================================
// BATCH CERTIFICATION - Check all milestones for a project
// =============================================================================
export async function PUT(request: NextRequest) {
  console.log('[MILESTONE CERTIFY] Starting batch certification');
  
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { projectId } = body;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        milestoneItems: {
          orderBy: { order: 'asc' }
        },
        conceptInsights: true
      }
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const projectContext = buildProjectContext(project);
    const results = [];

    for (const milestone of project.milestoneItems) {
      if (!milestone.isCertified) {
        const certification = await performAICertification(milestone, projectContext, null);
        
        if (certification.certified) {
          await prisma.milestone.update({
            where: { id: milestone.id },
            data: {
              isCompleted: true,
              isCertified: true,
              certifiedAt: new Date(),
              certificationReason: certification.reason
            }
          });
        }
        
        results.push({
          milestoneId: milestone.id,
          title: milestone.title,
          certified: certification.certified,
          reason: certification.reason
        });
      }
    }

    return NextResponse.json({
      success: true,
      results
    });

  } catch (error) {
    console.error('[MILESTONE CERTIFY BATCH] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function buildProjectContext(project: any): string {
  const stages = {
    Concepto: project.conceptStatus,
    Mercado: project.marketStatus,
    Negocio: project.businessStatus,
    Ejecución: project.executionStatus
  };

  const insights = project.conceptInsights
    ?.filter((i: any) => i.answer)
    .map((i: any) => `[${i.stage}] ${i.question}: ${i.answer}`)
    .join('\n') || '';

  return `
PROYECTO: ${project.title}
DESCRIPCIÓN: ${project.description}

ESTADO DE VALIDACIÓN:
${Object.entries(stages).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

INSIGHTS DOCUMENTADOS:
${insights}
`;
}

async function performAICertification(milestone: any, projectContext: string, evidence: string | null): Promise<{
  certified: boolean;
  reason: string;
  missingEvidence?: string[];
  suggestions?: string[];
}> {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
  
  const prompt = `Eres un auditor de milestones para startups. Tu trabajo es CERTIFICAR si un milestone ha sido completado basándote en la evidencia disponible.

## CONTEXTO DEL PROYECTO:
${projectContext}

## MILESTONE A CERTIFICAR:
Título: ${milestone.title}
Descripción: ${milestone.description || 'Sin descripción adicional'}

## EVIDENCIA PROPORCIONADA:
${evidence || 'El usuario solicita certificación automática basada en el progreso del proyecto.'}

## CRITERIOS DE CERTIFICACIÓN:
1. Debe haber evidencia concreta (no promesas)
2. Los datos deben ser verificables
3. El milestone debe estar genuinamente completado, no en progreso
4. El trabajo realizado debe coincidir con el objetivo del milestone

## RESPONDE EN JSON:
{
  "certified": true/false,
  "reason": "Explicación detallada de la decisión",
  "missingEvidence": ["Lista de evidencias faltantes si no se certifica"],
  "suggestions": ["Sugerencias para completar el milestone si no se certifica"]
}`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.error('[AI CERTIFICATION] Error:', error);
  }

  return {
    certified: false,
    reason: 'Error al procesar la certificación. Por favor, intenta de nuevo.',
    missingEvidence: ['No se pudo analizar la evidencia'],
    suggestions: ['Proporciona más detalles sobre el trabajo completado']
  };
}
