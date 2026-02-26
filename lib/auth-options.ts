import { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "@/lib/db";

// Dominio permitido para Google SSO
const ALLOWED_DOMAIN = "vexandco.com";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
  GoogleProvider({
  clientId: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  authorization: {
    params: {
      // ESTA LÍNEA ES LA MÁS IMPORTANTE
      scope: "openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/drive.readonly",
      prompt: "consent",
      access_type: "offline",
      response_type: "code"
    }
  }
})
  ],
  session: {
    strategy: "jwt"
  },
  callbacks: {
    async signIn({ account, profile }) {
      // Validación del lado del servidor para Google SSO
      if (account?.provider === "google") {
        const email = profile?.email;
        const emailVerified = (profile as any)?.email_verified;
        
        // Verificar que el email esté verificado y pertenezca al dominio permitido
        if (!emailVerified || !email?.endsWith(`@${ALLOWED_DOMAIN}`)) {
          console.log(`Acceso denegado para: ${email}. Solo se permite @${ALLOWED_DOMAIN}`);
          return false;
        }
      }
      return true;
    },
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id;
      }
      // Guardar access_token de Google para usar con Google Drive
      if (account?.provider === "google") {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).accessToken = token.accessToken;
      }
      return session;
    }
  },
  cookies: {
    sessionToken: {
      name: `__Secure-next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: true,
      },
    },
    callbackUrl: {
      name: `__Secure-next-auth.callback-url`,
      options: {
        sameSite: "lax",
        path: "/",
        secure: true,
      },
    },
    csrfToken: {
      name: `__Host-next-auth.csrf-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: true,
      },
    },
  },
  pages: {
    signIn: "/login",
    error: "/login"
  },
  secret: process.env.NEXTAUTH_SECRET
};
