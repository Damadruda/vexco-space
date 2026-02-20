export type ProjectType = "idea" | "active" | "operational" | "completed";

export const PROJECT_TYPES: Record<ProjectType, {
  label: string;
  description: string;
  color: string;
  bgColor: string;
  borderColor: string;
  dotColor: string;
}> = {
  idea: {
    label: "Idea / Concepto",
    description: "Exploración inicial, validación de hipótesis",
    color: "text-violet-700",
    bgColor: "bg-violet-50",
    borderColor: "border-violet-200",
    dotColor: "bg-violet-400"
  },
  active: {
    label: "Proyecto Activo",
    description: "En desarrollo activo, generando momentum",
    color: "text-blue-700",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
    dotColor: "bg-blue-500"
  },
  operational: {
    label: "Operativo",
    description: "Producto/servicio generando valor real",
    color: "text-emerald-700",
    bgColor: "bg-emerald-50",
    borderColor: "border-emerald-200",
    dotColor: "bg-emerald-500"
  },
  completed: {
    label: "Completado",
    description: "Archivado o finalizado con éxito",
    color: "text-gray-600",
    bgColor: "bg-gray-50",
    borderColor: "border-gray-200",
    dotColor: "bg-gray-400"
  }
};

export const MILESTONES_BY_TYPE: Record<ProjectType, string[]> = {
  idea: [
    "Validación de concepto",
    "Research de mercado",
    "Definición de MVP"
  ],
  active: [
    "Setup técnico",
    "MVP funcional",
    "Beta con usuarios",
    "Launch"
  ],
  operational: [
    "Métricas baseline",
    "Optimización",
    "Escalado"
  ],
  completed: [
    "Documentación final",
    "Retrospectiva",
    "Handoff"
  ]
};

export const PROJECT_TYPE_ORDER: ProjectType[] = ["idea", "active", "operational", "completed"];
