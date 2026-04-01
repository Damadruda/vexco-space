import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.styleVariant.upsert({
    where: { id: "quiet-luxury-default" },
    update: {},
    create: {
      id: "quiet-luxury-default",
      name: "Quiet Luxury",
      description:
        "Estándar corporativo Vex&Co — Cormorant Garamond + Inter, paleta neutra con acento dorado, márgenes generosos, tipografía como protagonista",
      isDefault: true,
      cssOverrides: {},
      designPrinciples:
        "Espacio generoso. Tipografía como elemento principal. Color mínimo (monocromático + acento dorado sutil). Sin bordes gruesos, sin sombras, sin gradientes. Líneas finas. Inspiración: Pentagram, Linear, Stripe.",
      source: "corporate",
      isActive: true,
    },
  });

  console.log("Quiet Luxury seed completed");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
