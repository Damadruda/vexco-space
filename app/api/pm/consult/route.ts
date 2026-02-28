/**
 * =============================================================================
 * STRATEGIC PM LAB - FIELD CONSULTATION API
 * =============================================================================
 * QA AUDIT NOTES:
 * - McKinsey Partner + Sequoia VC + Innovation Expert perspective
 * - "No Bananas" filter: rejects vague inputs without empirical grounding
 * - Field-specific consultation with refinement loop support
 * - Auto-Fill Cascade: when Concepto is GREEN, auto-drafts Mercado/Negocio
 * - Persists all interactions to ConceptInsight table
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
// STRATEGIC PROMPTS - McKinsey + Sequoia + Innovation Expert
// =============================================================================
const STRATEGIC_SYSTEM_PROMPT = `Eres un panel de expertos combinando:

1. **PARTNER DE MCKINSEY**: Análisis estratégico riguroso, frameworks probados (Porter, SWOT, Value Chain), datos empíricos obligatorios.

2. **VC DE SEQUOIA**: Evaluación de viabilidad de inversión, market sizing, unit economics, path to profitability.

3. **EXPERTO EN INNOVACIÓN**: Metodologías ágiles, design thinking, lean startup, product-market fit.

## REGLAS FUNDAMENTALES:

### "NO BANANAS" FILTER:
- RECHAZA cualquier input vago sin datos empíricos
- Exige: números concretos, investigación de mercado, benchmarks competitivos
- Si el usuario dice "muchos clientes quieren esto" → exige cuántos, qué % del mercado, cómo lo validaron

### ANÁLISIS RIGUROSO:
- Siempre evalúa: ¿Hay evidencia empírica? ¿Es escalable? ¿Tiene defensibilidad?
- Cuestiona supuestos no validados
- Propón alternativas cuando encuentres bloqueos

### OUTPUT STRUCTURE:
Responde SIEMPRE en JSON con esta estructura:
{
  "suggestion": "Tu sugerencia principal refinada y estratégica",
  "status": "RED|YELLOW|GREEN",
  "analysis": {
    "strengths": ["lista de fortalezas"],
    "weaknesses": ["lista de debilidades"],
    "opportunities": ["oportunidades detectadas"],
    "threats": ["amenazas identificadas"]
  },
  "alternatives": ["Si hay bloqueos, 3 pivotes alternativos"],
  "costBenefitAnalysis": "Evaluación de esfuerzo MVP vs beneficio mercado",
  "nextQuestion": "Siguiente pregunta crítica si status no es GREEN",
  "killSwitch": null | { "reason": "razón", "benchmarks": ["datos comparativos"] }
}`;

const STAGE_PROMPTS: Record<string, string> = {
  concepto: `ETAPA: CONCEPTO\n\nENFOQUE:\n- ¿Qué problema específico resuelve?\n- ¿Quién tiene este problema y cuántos son?\n- ¿Cuál es la propuesta de valor única?\n- ¿Existe validación inicial (entrevistas, encuestas, datos)?\n\nREQUIERE para GREEN:\n- Problema claramente definido con datos\n- TAM/SAM/SOM estimados\n- Al menos 5 entrevistas con usuarios potenciales\n- Diferenciador vs alternativas existentes`,
  
  mercado: `ETAPA: MERCADO\n\nENFOQUE:\n- Market sizing (TAM, SAM, SOM)\n- Análisis competitivo detallado\n- Segmentación de clientes\n- Validación de disposición a pagar\n\nREQUIERE para GREEN:\n- TAM > $100M (o justificación de nicho estratégico)\n- Análisis de al menos 5 competidores\n- Evidence de willingness-to-pay\n- Clear ICP (Ideal Customer Profile)`,
  
  negocio: `ETAPA: NEGOCIO\n\nENFOQUE:\n- Modelo de ingresos\n- Unit economics (CAC, LTV, payback period)\n- Go-to-market strategy\n- Path to profitability\n\nREQUIERE para GREEN:\n- LTV:CAC ratio > 3:1 (o plan para alcanzarlo)\n- Revenue model definido\n- Pricing validado con clientes\n- Break-even analysis`,
  
  ejecucion: `ETAPA: EJECUCIÓN\n\nENFOQUE:\n- Roadmap de desarrollo\n- Recursos necesarios\n- Milestones críticos\n- Risk mitigation\n\nREQUIERE para GREEN:\n- MVP scope definido (< 3 meses)\n- Team assessment\n- Budget estimado\n- Risk matrix con mitigaciones`
};

// =============================================================================
// POST HANDLER - Field Consultation
// =============================================================================
export async function POST(request: NextRequest) {
  console.log('[PM CONSULT] Starting consultation request');
  
  try {
    // Auth check
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { projectId, field, currentContent, userFeedback, cascade } = body;

    // Validate field
    const validFields = ['concepto', 'mercado', 'negocio', 'ejecucion'];
    if (!validFields.includes(field?.toLowerCase())) {
      return NextResponse.json({ error: 'Invalid field' }, { status: 400 });
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get project with insights
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { conceptInsights: true }
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Build context from existing insights
    const existingInsights = project.conceptInsights
      .filter(i => i.answer)
      .map(i => `Q: ${i.question}\nA: ${i.answer}`)
      .join('\n\n');

    // "No Bananas" pre-check
    const noBananasCheck = checkForBananas(currentContent);
    if (noBananasCheck.isVague && !userFeedback) {
      return NextResponse.json({
        status: 'RED',
        suggestion: null,
        noBananasViolation: true,
        message: noBananasCheck.message,
        requiredData: noBananasCheck.requiredData
      });
    }

    // Build Gemini prompt
    const fieldKey = field.toLowerCase() as keyof typeof STAGE_PROMPTS;
    const prompt = buildConsultationPrompt({
      projectTitle: project.title,
      projectDescription: project.description || '',
      field: fieldKey,
      currentContent,
      userFeedback,
      existingInsights,
      cascade
    });

    // Call Gemini
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // Parse JSON response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Invalid AI response format');
    }

    const aiResponse = JSON.parse(jsonMatch[0]);

    // Save to ConceptInsight
    const insightData: any = {
      projectId,
      question: userFeedback || `Consulta sobre ${field}`,
      answer: currentContent,
      stage: capitalizeFirst(fieldKey),
      analysisType: cascade ? 'cascade' : userFeedback ? 'refinement' : 'consultation',
      aiSuggestion: aiResponse.suggestion,
      alternatives: aiResponse.alternatives ? JSON.stringify(aiResponse.alternatives) : null,
      costBenefitAnalysis: aiResponse.costBenefitAnalysis,
      userFeedback: userFeedback || null,
      killSwitchReason: aiResponse.killSwitch?.reason || null
    };

    await prisma.conceptInsight.create({ data: insightData });

    // Update project status if needed
    if (aiResponse.status === 'GREEN') {
      const statusField = getStatusFieldName(fieldKey);
      await prisma.project.update({
        where: { id: projectId },
        data: { [statusField]: 'GREEN' }
      });

      // Check for Auto-Fill Cascade opportunity
      if (fieldKey === 'concepto') {
        const cascadeDrafts = await generateCascadeDrafts(project, aiResponse);
        return NextResponse.json({
          ...aiResponse,
          cascadeDrafts
        });
      }
    }

    return NextResponse.json(aiResponse);

  } catch (error) {
    console.error('[PM CONSULT] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function checkForBananas(content: string): { isVague: boolean; message: string; requiredData: string[] } {
  const vaguePatterns = [
    /muchos (clientes|usuarios|personas)/i,
    /todo el mundo/i,
    /enorme mercado/i,
    /gran potencial/i,
    /muy popular/i,
    /obvio que/i,
    /claramente/i
  ];

  const requiredDataPatterns = [
    { pattern: /\d+\s*(clientes|usuarios|personas)/i, name: 'Número específico de clientes/usuarios' },
    { pattern: /\$?\d+[MKB]?/i, name: 'Datos financieros concretos' },
    { pattern: /(entrevista|encuesta|validación)/i, name: 'Evidencia de validación' },
    { pattern: /%|porcentaje|tasa/i, name: 'Métricas porcentuales' }
  ];

  const hasVague = vaguePatterns.some(p => p.test(content));
  const missingData = requiredDataPatterns
    .filter(({ pattern }) => !pattern.test(content))
    .map(({ name }) => name);

  if (hasVague || missingData.length >= 3) {
    return {
      isVague: true,
      message: '⚠️ "No Bananas" Filter: Tu descripción necesita datos empíricos concretos.',
      requiredData: missingData
    };
  }

  return { isVague: false, message: '', requiredData: [] };
}

function buildConsultationPrompt(params: {
  projectTitle: string;
  projectDescription: string;
  field: string;
  currentContent: string;
  userFeedback?: string;
  existingInsights: string;
  cascade?: boolean;
}): string {
  const { projectTitle, projectDescription, field, currentContent, userFeedback, existingInsights, cascade } = params;
  
  let prompt = STRATEGIC_SYSTEM_PROMPT + '\n\n';
  prompt += STAGE_PROMPTS[field] + '\n\n';
  prompt += `## CONTEXTO DEL PROYECTO:\n`;
  prompt += `Título: ${projectTitle}\n`;
  prompt += `Descripción: ${projectDescription}\n\n`;
  
  if (existingInsights) {
    prompt += `## HISTORIAL DE VALIDACIÓN:\n${existingInsights}\n\n`;
  }
  
  prompt += `## CONTENIDO ACTUAL DEL CAMPO "${field.toUpperCase()}":\n${currentContent}\n\n`;
  
  if (userFeedback) {
    prompt += `## FEEDBACK DEL USUARIO PARA REFINAMIENTO:\n"${userFeedback}"\n\n`;
    prompt += `TAREA: Refina SOLO el aspecto mencionado manteniendo el contexto existente.\n`;
  } else if (cascade) {
    prompt += `TAREA: Genera un DRAFT inicial basado en el concepto validado. Marca como YELLOW.\n`;
  } else {
    prompt += `TAREA: Analiza el contenido y proporciona sugerencias estratégicas.\n`;
  }
  
  return prompt;
}

async function generateCascadeDrafts(project: any, conceptAnalysis: any): Promise<any> {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
  
  const prompt = `${STRATEGIC_SYSTEM_PROMPT}

Basándote en este CONCEPTO VALIDADO, genera drafts iniciales para MERCADO y NEGOCIO.

PROYECTO: ${project.title}
CONCEPTO: ${project.description}
ANÁLISIS: ${JSON.stringify(conceptAnalysis)}

Responde en JSON:
{
  "mercadoDraft": "Contenido sugerido para la sección de mercado...",
  "negocioDraft": "Contenido sugerido para la sección de negocio...",
  "mercadoQuestions": ["Preguntas pendientes para validar mercado"],
  "negocioQuestions": ["Preguntas pendientes para validar negocio"]
}`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
  } catch (error) {
    console.error('[CASCADE] Error generating drafts:', error);
    return null;
  }
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
