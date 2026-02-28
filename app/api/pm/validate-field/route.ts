/**
 * =============================================================================
 * STRATEGIC PM LAB - FIELD VALIDATION API
 * =============================================================================
 * QA AUDIT NOTES:
 * - Validates specific field with strategic rigor
 * - Proposes 3 alternatives if blockers found
 * - Performs cost/benefit analysis
 * - Issues kill switch if unviable after alternatives
 * =============================================================================
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth-options';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || '');

// =============================================================================
// VALIDATION CRITERIA BY FIELD
// =============================================================================
const VALIDATION_CRITERIA: Record<string, string[]> = {
  concepto: [
    'Problema claramente definido',
    'Propuesta de valor única',
    'Diferenciador vs competencia',
    'Validación inicial (entrevistas/datos)',
    'Scope realista para MVP'
  ],
  mercado: [
    'TAM/SAM/SOM calculados con fuentes',
    'Análisis de 5+ competidores',
    'Segmentación de clientes clara',
    'Evidence de willingness-to-pay',
    'ICP (Ideal Customer Profile) definido'
  ],
  negocio: [
    'Modelo de ingresos definido',
    'Unit economics proyectados (CAC, LTV)',
    'Pricing strategy validada',
    'Path to profitability',
    'Go-to-market strategy'
  ],
  ejecucion: [
    'MVP scope < 3 meses',
    'Recursos identificados',
    'Milestones con fechas',
    'Risk matrix con mitigaciones',
    'Budget estimado'
  ]
};

const KILL_SWITCH_BENCHMARKS: Record<string, any> = {
  marketSize: {
    minimum: '$10M TAM para startups, $100M para VCs',
    redFlag: 'TAM < $10M sin estrategia de nicho clara'
  },
  competition: {
    minimum: 'Diferenciador claro vs top 3 competidores',
    redFlag: 'Mercado dominado por incumbents con >80% share'
  },
  unitEconomics: {
    minimum: 'LTV:CAC > 3:1 proyectado en 18 meses',
    redFlag: 'LTV:CAC < 1:1 sin path claro a mejora'
  },
  execution: {
    minimum: 'MVP viable en <3 meses con recursos disponibles',
    redFlag: 'Requiere >12 meses y >$500K para primer producto'
  }
};

// =============================================================================
// POST HANDLER - Field Validation
// =============================================================================
export async function POST(request: NextRequest) {
  console.log('[PM VALIDATE] Starting validation request');
  
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { projectId, field, content } = body;

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { conceptInsights: true }
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Build validation prompt
    const fieldKey = field.toLowerCase();
    const criteria = VALIDATION_CRITERIA[fieldKey] || [];

    const prompt = buildValidationPrompt(project, fieldKey, content, criteria);

    // Call Gemini
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // Parse response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Invalid AI response format');
    }

    const validation = JSON.parse(jsonMatch[0]);

    // Save validation result
    await prisma.conceptInsight.create({
      data: {
        projectId,
        question: `Validación estratégica: ${field}`,
        answer: content,
        stage: capitalizeFirst(fieldKey),
        analysisType: 'validation',
        aiSuggestion: validation.feedback,
        alternatives: validation.alternatives ? JSON.stringify(validation.alternatives) : null,
        costBenefitAnalysis: validation.costBenefitAnalysis,
        killSwitchReason: validation.killSwitch?.reason || null
      }
    });

    // Update project status
    if (validation.status === 'GREEN') {
      const statusField = getStatusFieldName(fieldKey);
      await prisma.project.update({
        where: { id: projectId },
        data: { [statusField]: 'GREEN' }
      });
    } else if (validation.status === 'YELLOW') {
      const statusField = getStatusFieldName(fieldKey);
      await prisma.project.update({
        where: { id: projectId },
        data: { [statusField]: 'YELLOW' }
      });
    }

    return NextResponse.json(validation);

  } catch (error) {
    console.error('[PM VALIDATE] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function buildValidationPrompt(project: any, field: string, content: string, criteria: string[]): string {
  return `Eres un panel de expertos de McKinsey + Sequoia VC validando la etapa "${field.toUpperCase()}" de un proyecto.

## PROYECTO:
Título: ${project.title}
Descripción: ${project.description}

## CONTENIDO A VALIDAR:
${content}

## CRITERIOS DE VALIDACIÓN:
${criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

## BENCHMARKS DE KILL SWITCH:
${JSON.stringify(KILL_SWITCH_BENCHMARKS, null, 2)}

## INSTRUCCIONES:
1. Evalúa cada criterio con rigor
2. Si encuentras BLOQUEOS, propón 3 ALTERNATIVAS/PIVOTES antes de activar kill switch
3. Realiza análisis costo/beneficio del MVP
4. Solo activa kill switch si NINGUNA alternativa es viable

## RESPONDE EN JSON:
{
  "status": "RED | YELLOW | GREEN",
  "criteriaResults": [
    { "criterion": "nombre", "met": true/false, "comment": "explicación" }
  ],
  "feedback": "Feedback general estratégico",
  "blockers": ["Lista de bloqueos encontrados"],
  "alternatives": [
    { "name": "Pivote A", "description": "...", "viability": "alta/media/baja" }
  ],
  "costBenefitAnalysis": {
    "mvpCost": "Estimación de costo MVP",
    "timeToMarket": "Tiempo estimado",
    "marketBenefit": "Beneficio potencial de mercado",
    "recommendation": "Proceder/Pivotar/Reconsiderar"
  },
  "killSwitch": null | {
    "active": true,
    "reason": "Razón detallada",
    "benchmarks": ["Benchmarks fallidos"]
  }
}`;
}

function getStatusFieldName(field: string): string {
  const mapping: Record<string, string> = {
    concepto: 'conceptStatus',
    mercado: 'marketStatus',
    negocio: 'businessStatus',
    ejecucion: 'executionStatus'
  };
  return mapping[field] || 'conceptStatus';
}

function capitalizeFirst(str: string): string {
  const mapping: Record<string, string> = {
    concepto: 'Concepto',
    mercado: 'Mercado',
    negocio: 'Negocio',
    ejecucion: 'Ejecución'
  };
  return mapping[str] || str;
}
