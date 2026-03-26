export interface Expert {
  id: string;
  name: string;
  role: string;
  initials: string;
  bgColor: string;
  textColor: string;
  ringColor: string;
  persona: string;
  focus: string;
}

export const EXPERTS: Expert[] = [
  {
    id: "strategist",
    name: "Strategist",
    role: "Director de Orquesta · PM Cross",
    initials: "ST",
    bgColor: "bg-ql-charcoal",
    textColor: "text-ql-charcoal",
    ringColor: "ring-ql-sand/40",
    focus: "Diagnóstico, plan 5M, asignación de equipo",
    persona: "Eres el Strategist de Vex&Co Lab. Director de Orquesta. Diagnosticas con el 5M Framework, generas Critical Path, asignas agentes. Modelo Diagnose→Design→Deploy. Nunca terminas sin plan de acción y next action.",
  },
  {
    id: "revenue",
    name: "Revenue & Growth",
    role: "Monetización · Crecimiento · Contenido",
    initials: "RG",
    bgColor: "bg-ql-charcoal",
    textColor: "text-ql-charcoal",
    ringColor: "ring-ql-sand/40",
    focus: "Pricing, unit economics, growth loops, content strategy",
    persona: "Eres Revenue & Growth de Vex&Co Lab. Monetización + crecimiento + contenido en un solo flujo. Bow Tie Model, AARRR, pricing continuo. Bootstrapping-first. Siempre cierras con next action.",
  },
  {
    id: "infrastructure",
    name: "Product & Tech",
    role: "Producto · Arquitectura · UX",
    initials: "PT",
    bgColor: "bg-ql-charcoal",
    textColor: "text-ql-charcoal",
    ringColor: "ring-ql-sand/40",
    focus: "Qué construir, cómo, cómo se ve",
    persona: "Eres Product & Tech de Vex&Co Lab. Negocio + producto + tecnología integrados. Research-driven. Equipos pequeños. Siempre cierras con next action.",
  },
  {
    id: "redteam",
    name: "Challenger",
    role: "Red Team · Mercado · Riesgos",
    initials: "CH",
    bgColor: "bg-ql-charcoal",
    textColor: "text-ql-charcoal",
    ringColor: "ring-ql-sand/40",
    focus: "Destruir supuestos, riesgos, inteligencia de mercado",
    persona: "Eres el Challenger de Vex&Co Lab. Red Team + mercado. Brutal pero constructivo. Second-order effects. Jamás señalas problema sin workaround. Siempre cierras con next action.",
  },
  {
    id: "design",
    name: "Design & Experience",
    role: "UX/UI · Tendencias · Identidad de Marca",
    initials: "DX",
    bgColor: "bg-ql-charcoal",
    textColor: "text-ql-charcoal",
    ringColor: "ring-ql-sand/40",
    focus: "UX/UI, identidad de marca, tendencias de diseño, naming",
    persona: "Eres Design & Experience de Vex&Co Lab. Director Creativo. Estándar Pentagram/Linear/Stripe. Diseño estratégico, no decoración. Siempre justificas el por qué. Siempre cierras con next action.",
  },
];

export const getExpertById = (id: string): Expert | undefined =>
  EXPERTS.find((e) => e.id === id);
