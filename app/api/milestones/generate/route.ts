/**
 * =============================================================================
 * STRATEGIC PM LAB - MILESTONE GENERATION API
 * =============================================================================
 * QA AUDIT NOTES:
 * - Generates milestones based on project type (SaaS, Product, Service)
 * - Uses AI to create relevant milestones based on project content
 * - Milestones are stored with projectType for tracking
 * =============================================================================
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth-options';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || '');

// =============================================================================
// MILESTONE TEMPLATES BY PROJECT TYPE
// =============================================================================
const MILESTONE_TEMPLATES: Record<string, string[]> = {
  saas: [
    'Validación del problema con 20+ entrevistas',
    'MVP funcional desplegado',
    'Primeros 10 usuarios beta',
    'Product-market fit validado (NPS > 40)',
    'Primeros $1K MRR',
    'Modelo de adquisición validado (CAC < LTV/3)',
    'Series Seed / Break-even'
  ],
  product: [
    'Prototipo funcional',
    'Validación con usuarios objetivo',
    'Diseño de producción finalizado',
    'Cadena de suministro establecida',
    'Primeras 100 unidades vendidas',
    'Distribución en primer canal validada',
    'Rentabilidad unitaria demostrada'
  ],
  service: [
    'Propuesta de valor validada',
    'Primer cliente piloto',
    'Proceso de delivery estandarizado',
    '5 clientes recurrentes',
    'Team de 3+ personas',
    'Escalabilidad del modelo probada',
    'Margen bruto > 40%'
  ],
  generic: [
    'Concepto validado',
    'MVP/Prototipo completado',
    'Primeros usuarios/clientes',
    'Modelo de negocio validado',
    'Crecimiento sostenible iniciado',
    'Break-even alcanzado'
  ]
};

// =============================================================================
// POST HANDLER - Generate Milestones
// =============================================================================
export async function POST(request: NextRequest) {
  console.log('[MILESTONES GENERATE] Starting milestone generation');
  
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { projectId, projectType } = body;

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { 
        conceptInsights: true,
        milestoneItems: true
      }
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Delete existing milestones if regenerating
    if (project.milestoneItems.length > 0) {
      await prisma.milestone.deleteMany({
        where: { projectId }
      });
    }

    // Determine project type if not provided
    const type = projectType || await detectProjectType(project);
    const templateMilestones = MILESTONE_TEMPLATES[type.toLowerCase()] || MILESTONE_TEMPLATES.generic;

    // Use AI to customize milestones based on project context
    const customizedMilestones = await customizeMilestones(project, templateMilestones, type);

    // Create milestones in database
    const createdMilestones = await Promise.all(
      customizedMilestones.map((milestone: any, index: number) =>
        prisma.milestone.create({
          data: {
            projectId,
            title: milestone.title,
            description: milestone.description,
            projectType: type,
            order: index,
            isCompleted: false,
            isCertified: false
          }
        })
      )
    );

    console.log(`[MILESTONES GENERATE] Created ${createdMilestones.length} milestones`);

    return NextResponse.json({
      success: true,
      projectType: type,
      milestones: createdMilestones
    });

  } catch (error) {
    console.error('[MILESTONES GENERATE] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// =============================================================================
// GET HANDLER - Get Project Milestones
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

    const milestones = await prisma.milestone.findMany({
      where: { projectId },
      orderBy: { order: 'asc' }
    });

    return NextResponse.json({ milestones });

  } catch (error) {
    console.error('[MILESTONES GET] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

async function detectProjectType(project: any): Promise<string> {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
  
  const prompt = `Analiza este proyecto y determina su tipo:\n\nTítulo: ${project.title}\nDescripción: ${project.description}\n\nResponde SOLO con una palabra: SaaS, Product, o Service`;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response.text().trim().toLowerCase();
    if (['saas', 'product', 'service'].includes(response)) {
      return response;
    }
  } catch (error) {
    console.error('[DETECT TYPE] Error:', error);
  }
  
  return 'generic';
}

async function customizeMilestones(project: any, templates: string[], type: string): Promise<any[]> {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
  
  const existingInsights = project.conceptInsights
    .filter((i: any) => i.answer)
    .map((i: any) => `${i.stage}: ${i.answer}`)
    .join('\n');

  const prompt = `Eres un experto en desarrollo de productos y startups.

PROYECTO:
- Título: ${project.title}
- Descripción: ${project.description}
- Tipo: ${type}

INSIGHTS VALIDADOS:
${existingInsights}

TEMPLATES DE MILESTONES:
${templates.map((t, i) => `${i + 1}. ${t}`).join('\n')}

TAREA: Personaliza estos milestones para este proyecto específico. Mantén la estructura general pero adapta los detalles.

Responde en JSON:
[
  { "title": "Milestone 1", "description": "Descripción específica para este proyecto" },
  ...
]`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.error('[CUSTOMIZE MILESTONES] Error:', error);
  }

  // Fallback to templates
  return templates.map(t => ({ title: t, description: '' }));
}
