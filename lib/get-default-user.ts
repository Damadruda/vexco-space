import { prisma } from "@/lib/db";

let cachedUserId: string | null = null;

export async function getDefaultUserId(): Promise<string> {
  if (cachedUserId) return cachedUserId;
  
  const user = await prisma.user.findFirst({
    orderBy: { createdAt: "asc" }
  });
  
  if (!user) {
    throw new Error("No hay usuarios en la base de datos. Ejecute el seed primero.");
  }
  
  cachedUserId = user.id;
  return user.id;
}
