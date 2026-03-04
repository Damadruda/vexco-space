import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth-options";
import { AuthLayoutClient } from "./auth-layout-client";

// 🔧 DEV BYPASS — desactivar antes de producción
const DEV_BYPASS = process.env.NODE_ENV === "development";

export default async function AuthenticatedLayout({
  children
}: {
  children: React.ReactNode;
}) {
  if (!DEV_BYPASS) {
    const session = await getServerSession(authOptions);
    if (!session) {
      redirect("/login");
    }
  }

  return <AuthLayoutClient>{children}</AuthLayoutClient>;
}