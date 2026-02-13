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