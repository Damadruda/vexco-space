import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Create test user (for internal testing)
  const hashedPassword = await bcrypt.hash("johndoe123", 10);
  
  const user = await prisma.user.upsert({
    where: { email: "john@doe.com" },
    update: {},
    create: {
      email: "john@doe.com",
      password: hashedPassword,
      name: "Carlos Emprendedor"
    }
  });

  console.log("User created:", user.email);

  // Create additional test user (for auth validation)
  const hashedPassword2 = await bcrypt.hash("test1234", 10);
  
  await prisma.user.upsert({
    where: { email: "test@emprendedor.com" },
    update: { password: hashedPassword2 },
    create: {
      email: "test@emprendedor.com",
      password: hashedPassword2,
      name: "Test User"
    }
  });

  console.log("Test user created: test@emprendedor.com");

  // Create sample projects
  const projects = [
    {
      title: "Agencia de Marketing B2B Digital",
      description: "Servicios de marketing digital especializados para empresas B2B del sector tecnológico",
      status: "execution",
      category: "marketing",
      tags: ["B2B", "marketing digital", "tech"],
      priority: "high",
      progress: 70,
      currentStep: 4,
      concept: "Agencia boutique de marketing digital enfocada exclusivamente en empresas B2B del sector tecnológico",
      problemSolved: "Las empresas tech B2B tienen dificultades para generar leads cualificados con agencias generalistas",
      targetMarket: "Empresas de software B2B con 10-100 empleados, facturación 1-10M€, sin equipo de marketing interno",
      marketValidation: "20 entrevistas con CTOs y CEOs, 5 proyectos piloto completados con éxito",
      businessModel: "Retainer mensual (2.500-5.000€) + proyectos puntuales + comisión por lead cualificado",
      valueProposition: "Especialización B2B tech, metodología propia de generación de leads, equipo senior",
      actionPlan: "1. Lanzar web renovada\n2. Crear 3 casos de estudio\n3. Implementar CRM\n4. Iniciar outbound",
      dueDate: new Date("2026-03-31")
    },
    {
      title: "Curso Online de Ventas Consultivas",
      description: "Programa formativo para equipos de ventas B2B enfocado en venta consultiva",
      status: "development",
      category: "producto",
      tags: ["formación", "ventas", "online"],
      priority: "medium",
      progress: 40,
      currentStep: 3,
      concept: "Curso online de 8 semanas que enseña metodología de venta consultiva para vendedores B2B",
      problemSolved: "Los vendedores B2B no saben cómo vender soluciones complejas sin parecer agresivos",
      targetMarket: "Vendedores B2B con 2-5 años de experiencia que quieren mejorar su cierre",
      marketValidation: "Encuesta a 50 vendedores, 78% interesados en formación específica de venta consultiva",
      dueDate: new Date("2026-06-30")
    },
    {
      title: "Plataforma SaaS de Propuestas Comerciales",
      description: "Software para crear y gestionar propuestas comerciales profesionales automáticamente",
      status: "idea",
      category: "producto",
      tags: ["SaaS", "propuestas", "automatización"],
      priority: "high",
      progress: 15,
      currentStep: 1,
      concept: "Plataforma que permite crear propuestas comerciales profesionales en minutos usando IA y plantillas",
      problemSolved: "Los equipos de ventas pierden horas creando propuestas desde cero"
    },
    {
      title: "Consultoría de Transformación Digital",
      description: "Servicios de consultoría para digitalizar procesos comerciales en PYMEs",
      status: "completed",
      category: "consultoria",
      tags: ["consultoría", "digital", "PYMEs"],
      priority: "low",
      progress: 100,
      currentStep: 5,
      concept: "Consultoría especializada en digitalizar el proceso comercial de PYMEs industriales",
      problemSolved: "Las PYMEs industriales tienen procesos comerciales obsoletos y manuales",
      targetMarket: "PYMEs industriales con 20-100 empleados, procesos comerciales manuales",
      marketValidation: "10 proyectos completados, 90% satisfacción, 3 referidos por cliente",
      businessModel: "Proyecto de diagnóstico (3.000€) + implementación (15.000-30.000€) + soporte mensual",
      valueProposition: "Metodología probada, resultados medibles en 90 días, equipo especializado en industria",
      actionPlan: "Proyecto completado - modo mantenimiento",
      milestones: "Todos los hitos completados exitosamente",
      resources: "Equipo de 3 consultores, herramientas propias",
      metrics: "ROI promedio 300% para clientes, NPS 72"
    }
  ];

  for (const projectData of projects) {
    await prisma.project.create({
      data: {
        ...projectData,
        userId: user.id
      }
    });
  }

  console.log("Projects created:", projects.length);

  // Create sample notes
  const notes = [
    {
      title: "Ideas para webinar de ventas",
      content: "Temas potenciales:\n- Cómo calificar leads en 5 minutos\n- Técnicas de cierre para tickets altos\n- Manejo de objeciones de precio\n\nFormato: 45 min + 15 min Q&A",
      category: "marketing",
      tags: ["webinar", "ventas", "contenido"]
    },
    {
      title: "Competencia - Análisis HubSpot",
      content: "Puntos fuertes:\n- Marca reconocida\n- Integraciones amplias\n\nDebilidades:\n- Precio alto para PYMEs\n- Complejidad de implementación\n- Soporte limitado en español",
      category: "marketing",
      tags: ["competencia", "análisis"]
    },
    {
      title: "Feedback cliente - Empresa ABC",
      content: "Reunión post-proyecto:\n- Muy satisfechos con resultados\n- Sugieren más formación al equipo\n- Interesados en fase 2\n- Posible caso de estudio",
      category: "ventas",
      tags: ["feedback", "cliente"]
    }
  ];

  for (const noteData of notes) {
    await prisma.note.create({
      data: {
        ...noteData,
        userId: user.id
      }
    });
  }

  console.log("Notes created:", notes.length);

  // Create sample links
  const links = [
    {
      url: "https://www.hubspot.com/state-of-marketing",
      title: "State of Marketing Report 2025 - HubSpot",
      description: "Informe anual sobre tendencias de marketing digital",
      category: "marketing",
      tags: ["tendencias", "informe", "marketing"]
    },
    {
      url: "https://www.gartner.com/en/sales",
      title: "Gartner Sales Research",
      description: "Investigación sobre mejores prácticas en ventas B2B",
      category: "ventas",
      tags: ["research", "ventas", "B2B"]
    },
    {
      url: "https://www.linkedin.com/business/sales/blog",
      title: "LinkedIn Sales Blog",
      description: "Artículos sobre social selling y ventas digitales",
      category: "ventas",
      tags: ["LinkedIn", "social selling"]
    }
  ];

  for (const linkData of links) {
    await prisma.link.create({
      data: {
        ...linkData,
        userId: user.id
      }
    });
  }

  console.log("Links created:", links.length);

  // ===========================================================================
  // V4 SEED: DecisionLog, InboxItem, KnowledgeBase, AgileTask
  // ===========================================================================

  // Upsert Diego's account for V4 testing
  const hashedPasswordDiego = await bcrypt.hash("diego123", 10);
  const diego = await prisma.user.upsert({
    where: { email: "diego@vexandco.com" },
    update: {},
    create: {
      email: "diego@vexandco.com",
      password: hashedPasswordDiego,
      name: "Diego"
    }
  });
  console.log("Diego user upserted:", diego.email);

  // Get or create a project for V4 seed data
  let seedProject = await prisma.project.findFirst({
    where: { userId: diego.id }
  });

  if (!seedProject) {
    seedProject = await prisma.project.create({
      data: {
        title: "Proyecto Lab V4 — Demo",
        description: "Proyecto de demostración para Sprint 1",
        userId: diego.id,
        status: "development",
        conceptStatus: "YELLOW",
        marketStatus: "RED",
        businessStatus: "RED",
        executionStatus: "RED"
      }
    });
    console.log("Seed project created:", seedProject.id);
  }

  // DecisionLogs
  const decisionData = [
    {
      decision: "Usar Raindrop.io como fuente primaria de ingesta de contenido",
      context: "El usuario evaluó Pocket, Instapaper y Raindrop. Raindrop tiene mejor API y colecciones.",
      outcome: "APPROVED" as const,
      agentSource: "strategist"
    },
    {
      decision: "Integrar Google Drive como fuente de documentos en Sprint 1",
      context: "La integración requiere OAuth adicional. El equipo prefiere esperar al Sprint 2.",
      outcome: "REJECTED" as const,
      agentSource: "architect"
    },
    {
      decision: "Añadir notificaciones por email para inbox no procesado después de 48h",
      context: "El usuario no ha confirmado si quiere emails. Pendiente de decisión.",
      outcome: "DEFERRED" as const,
      agentSource: "operations"
    }
  ];

  for (const d of decisionData) {
    await prisma.decisionLog.create({
      data: {
        ...d,
        projectId: seedProject.id,
        userId: diego.id
      }
    });
  }
  console.log("DecisionLogs created:", decisionData.length);

  // InboxItems
  const inboxData = [
    {
      type: "url",
      rawContent: "Artículo sobre arquitectura multi-agente con LLMs en producción.",
      sourceUrl: "https://example.com/multi-agent-llm",
      sourceTitle: "Multi-Agent LLM Architecture",
      tags: ["ai", "architecture", "agents"],
      status: "unprocessed"
    },
    {
      type: "text",
      rawContent: "Nota rápida: revisar el patrón supervisor en LangGraph vs CrewAI para el sprint 2. Prioridad alta.",
      tags: ["langchain", "research"],
      status: "processed"
    },
    {
      type: "document",
      rawContent: "PRD completo del sistema de ingesta V4 con Raindrop y Jina Reader.",
      sourceTitle: "PRD Ingesta V4",
      tags: ["prd", "ingesta"],
      status: "unprocessed"
    },
    {
      type: "url",
      rawContent: "Guía oficial de Prisma para queries con Promise.all y optimización N+1.",
      sourceUrl: "https://www.prisma.io/docs/guides",
      sourceTitle: "Prisma Performance Guide",
      tags: ["prisma", "performance"],
      status: "unprocessed"
    },
    {
      type: "text",
      rawContent: "Idea: usar Jina Reader para extraer contenido limpio de URLs del inbox automáticamente antes de pasarle el contenido a Gemini.",
      tags: ["jina", "automation", "idea"],
      status: "unprocessed"
    }
  ];

  for (const item of inboxData) {
    await prisma.inboxItem.create({
      data: {
        ...item,
        userId: diego.id
      }
    });
  }
  console.log("InboxItems created:", inboxData.length);

  // KnowledgeBase articles
  const kbData = [
    {
      title: "Patrón Supervisor: Arquitectura Multi-Agente",
      content: "El patrón supervisor consiste en un agente orquestador central que lee el estado compartido y delega tareas a agentes especializados. Cada agente tiene un dominio de expertise único. El supervisor nunca ejecuta — solo enruta.",
      contentType: "article",
      category: "architecture",
      tags: ["multi-agent", "supervisor", "architecture"],
      status: "published",
      summary: "Guía del patrón de orquestación central para sistemas multi-agente."
    },
    {
      title: "Human-in-the-Loop: DecisionLog Pattern",
      content: "Para evitar que los agentes repitan sugerencias rechazadas, cada decisión del usuario se registra en DecisionLog con su outcome (APPROVED/REJECTED/DEFERRED). Antes de generar una nueva sugerencia, el agente consulta el historial de decisiones del proyecto.",
      contentType: "reference",
      category: "patterns",
      tags: ["hitl", "decision-log", "agents"],
      status: "published",
      summary: "Cómo implementar memoria de decisiones para Human-in-the-Loop."
    }
  ];

  for (const kb of kbData) {
    await prisma.knowledgeBase.create({
      data: {
        ...kb,
        authorId: diego.id
      }
    });
  }
  console.log("KnowledgeBase articles created:", kbData.length);

  // AgileTasks for seedProject
  const agileData = [
    {
      title: "Diseñar schema de ProjectMemory",
      description: "Definir la estructura del JSON que devuelve /api/projects/[id]/memory",
      status: "done",
      priority: "high",
      type: "task",
      labels: ["backend", "architecture"]
    },
    {
      title: "Implementar endpoint /api/inbox con filtros",
      description: "GET con filtros de status y type, POST con validación de tipos",
      status: "in-progress",
      priority: "high",
      type: "feature",
      labels: ["backend", "api"]
    },
    {
      title: "UI: Inbox view con lista y acciones",
      description: "Página /inbox con listado, filtros y botón de procesamiento IA",
      status: "backlog",
      priority: "medium",
      type: "feature",
      labels: ["frontend", "ui"]
    }
  ];

  for (const task of agileData) {
    await prisma.agileTask.create({
      data: {
        ...task,
        projectId: seedProject.id,
        assigneeId: diego.id,
        blockedBy: [],
        labels: task.labels
      }
    });
  }
  console.log("AgileTasks created:", agileData.length);

  console.log("Database seeded successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });