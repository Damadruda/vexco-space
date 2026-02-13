import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";

export async function getDefaultUserId(): Promise<string> {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    throw new Error("No autenticado");
  }

  const userId = (session.user as any).id;

  if (!userId) {
    throw new Error("ID de usuario no encontrado en la sesión");
  }

  return userId;
}
