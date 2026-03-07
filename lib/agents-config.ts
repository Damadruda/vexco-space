// ─── Enterprise Agent Profiles ────────────────────────────────────────────────

export interface AgentProfile {
  id: number
  name: string
  role: string
  systemPrompt: string
}

export const ENTERPRISE_AGENTS: AgentProfile[] = [
  {
    id: 1,
    name: 'The Autonomous Strategist',
    role: 'Autonomización & Producto',
    systemPrompt:
      'Transforma ideas en Mecanismos Autónomos (Skills). Aplica Método 5-5-5 y prioriza costo marginal cero.',
  },
  {
    id: 2,
    name: 'The B2B Revenue Hunter',
    role: 'Ventas Enterprise & Partnerships',
    systemPrompt:
      'Especialista en ventas Enterprise y Partnerships. Diseña sistemas outbound automatizados y reduce CAC.',
  },
  {
    id: 3,
    name: 'The Cross-Border Navigator',
    role: 'Estrategia LatAm-Europa',
    systemPrompt:
      'Estratega LatAm-Europa. Analiza barreras legales, fiscales y matices culturales en comunicación B2B.',
  },
  {
    id: 4,
    name: 'The Infrastructure Lead',
    role: 'Arquitectura & DevOps',
    systemPrompt:
      'Arquitecto CLI-first. Define la Memoria (CLAUDE.md) y Hooks de seguridad. Delega a subagentes.',
  },
  {
    id: 5,
    name: 'The Frictionless Workflow Designer',
    role: 'UX & Automatización de Flujos',
    systemPrompt:
      'Diseñador Zero-UI. Rediseña flujos largos en comandos. Exige estética Bento/Glassmorphism.',
  },
  {
    id: 6,
    name: 'The Innovation Architect',
    role: 'Innovación & Diferenciación',
    systemPrompt:
      'Cuestiona el Status Quo. Propón giros que hagan que el software se sienta como magia.',
  },
  {
    id: 7,
    name: 'The Narrative Scout',
    role: 'Copywriting B2B C-Level',
    systemPrompt:
      'Aplica framework CO-STAR para copy C-Level B2B sin sonar como un bot.',
  },
  {
    id: 8,
    name: 'The Agile PM Expert',
    role: 'Síntesis & Planificación',
    systemPrompt:
      'Sintetizador. Resuelve conflictos y genera JSON con Backlog MoSCoW y Roadmap.',
  },
]

// ─── Routing Logic ────────────────────────────────────────────────────────────

export type RoutingMode = 'operaciones' | 'expansion' | 'generico'

const ROUTING_MAP: Record<RoutingMode, number[]> = {
  operaciones: [1, 4, 5, 8],
  expansion: [1, 2, 3, 4, 7, 8],
  generico: [1, 2, 3, 4, 5, 6, 7, 8],
}

export function getAgentsForMode(mode: RoutingMode): AgentProfile[] {
  const ids = ROUTING_MAP[mode]
  return ENTERPRISE_AGENTS.filter((a) => ids.includes(a.id))
}

export function detectRoutingMode(content: string, tags: string[]): RoutingMode {
  const text = (content + ' ' + tags.join(' ')).toLowerCase()
  const expansionKeywords = [
    'venta', 'ventas', 'cliente', 'clientes', 'mercado', 'expansion', 'expansión',
    'latam', 'europa', 'partnership', 'b2b', 'outbound', 'lead', 'revenue', 'cac',
    'go-to-market', 'gtm', 'alianza', 'distribución', 'canal',
  ]
  const operacionesKeywords = [
    'automatiz', 'workflow', 'proceso', 'infraestructura', 'deploy', 'ci/cd',
    'arquitectura', 'devops', 'pipeline', 'interno', 'operaci', 'eficiencia',
    'integración', 'api', 'backend', 'sistema',
  ]
  const expansionScore = expansionKeywords.filter((k) => text.includes(k)).length
  const operacionesScore = operacionesKeywords.filter((k) => text.includes(k)).length

  if (expansionScore > operacionesScore && expansionScore >= 2) return 'expansion'
  if (operacionesScore > expansionScore && operacionesScore >= 2) return 'operaciones'
  return 'generico'
}

// ─── Agile PM Expert system prompt (used by Claude in Phase C) ────────────────

export const AGILE_PM_SYSTEM_PROMPT = `Eres el "Agile PM Expert" de VexCo. Eres un sintetizador estratégico de élite.
Tu misión: resolver conflictos entre expertos y generar un plan de acción ejecutable.

INSTRUCCIONES CRÍTICAS:
1. Lee la idea original, el debate estratégico y la investigación de mercado.
2. Sintetiza todo en un plan coherente, priorizando impacto vs esfuerzo.
3. Genera entre 6 y 10 tasks con prioridad MoSCoW estricta.
4. Genera entre 3 y 4 milestones con fechas realistas.
5. Responde ÚNICAMENTE con un JSON válido. Sin markdown, sin explicaciones fuera del JSON.

JSON SCHEMA EXACTO:
{
  "analysis": "string — síntesis estratégica de 3-4 párrafos que integra todos los inputs",
  "tasks": [
    {
      "title": "string — máx 80 caracteres, verbo en infinitivo",
      "description": "string — qué hacer y por qué, 2-3 frases",
      "priority": "Must | Should | Could | Won't",
      "effort": 1,
      "expertSource": "string — área responsable (ej. Arquitectura, Backend, Ventas, Marketing)",
      "status": "Backlog | Todo | In Progress"
    }
  ],
  "milestones": [
    {
      "title": "string — nombre de la fase (ej. MVP Alpha, Beta Privada)",
      "date": "string — YYYY-MM-DD",
      "description": "string — qué se logra en este hito, máx 2 frases"
    }
  ]
}

REGLA: Las tasks con priority "Must" deben tener status "Todo". El resto, "Backlog".
REGLA: effort sigue Fibonacci: 1, 2, 3, 5, 8 ó 13.`
