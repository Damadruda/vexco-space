import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth-options";
import { AuthLayoutClient } from "./auth-layout-client";

export default async function AuthenticatedLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  
  if (!session) {
    redirect("/login");
  }
  
  return <AuthLayoutClient>{children}</AuthLayoutClient>;
}