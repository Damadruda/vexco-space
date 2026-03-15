import type { Metadata } from "next";
import { Cormorant_Garamond, Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-heading",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-body",
  display: "swap",
});

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXTAUTH_URL || "http://localhost:3000"),
  title: "Vex&Co Lab - Dashboard de Gestión para Emprendedores",
  description: "Organiza tus ideas, estructura tus proyectos y alcanza tus metas con Vex&Co Lab",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg"
  },
  openGraph: {
    title: "Vex&Co Lab - Dashboard de Gestión para Emprendedores",
    description: "Organiza tus ideas, estructura tus proyectos y alcanza tus metas con Vex&Co Lab",
    images: ["/og-image.png"]
  }
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head />
      <body className={`${cormorant.variable} ${inter.variable} font-body`} suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}