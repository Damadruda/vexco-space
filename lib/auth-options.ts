import { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "@/lib/db";

// Dominio permitido para Google SSO
const ALLOWED_DOMAIN = "vexandco.com";

/**
 * Helper function to update tokens in the database
 * This ensures the Account table always has the latest access_token
 */
async function updateAccountTokens(
  userId: string,
  accessToken: string,
  refreshToken?: string,
  expiresAt?: number
) {
  try {
    await prisma.account.updateMany({
      where: {
        userId: userId,
        provider: "google",
      },
      data: {
        access_token: accessToken,
        ...(refreshToken && { refresh_token: refreshToken }),
        ...(expiresAt && { expires_at: expiresAt }),
      },
    });
    console.log("[AUTH] Token actualizado en base de datos para userId:", userId);
  } catch (error) {
    console.error("[AUTH] Error actualizando token en DB:", error);
  }
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: "openid email profile https://www.googleapis.com/auth/drive.readonly",
          access_type: "offline",
          prompt: "consent",
          response_type: "code",
        },
      },
    })
  ],
  session: {
    strategy: "jwt"
  },
  callbacks: {
    async signIn({ account, profile, user }) {
      // Validación del lado del servidor para Google SSO
      if (account?.provider === "google") {
        const email = profile?.email;
        const emailVerified = (profile as any)?.email_verified;
        
        // Verificar que el email esté verificado y pertenezca al dominio permitido
        if (!emailVerified || !email?.endsWith(`@${ALLOWED_DOMAIN}`)) {
          console.log(`[AUTH] Acceso denegado para: ${email}. Solo se permite @${ALLOWED_DOMAIN}`);
          return false;
        }
        
        // Log de tokens recibidos (para debugging)
        console.log("[AUTH] SignIn exitoso para:", email);
        console.log("[AUTH] Token preview (primeros 10 chars):", account.access_token?.substring(0, 10));
        console.log("[AUTH] Refresh token existe:", !!account.refresh_token);
        
        // CRITICAL: Actualizar tokens en la base de datos inmediatamente al hacer signIn
        // Esto asegura que el nuevo access_token con permisos de Drive se guarda
        if (user?.id && account.access_token) {
          // Use setTimeout to ensure the Account record exists first (PrismaAdapter creates it)
          setTimeout(async () => {
            await updateAccountTokens(
              user.id,
              account.access_token!,
              account.refresh_token ?? undefined,
              account.expires_at ?? undefined
            );
          }, 1000);
        }
      }
      return true;
    },
    async jwt({ token, user, account, trigger }) {
      if (user) {
        token.id = user.id;
      }
      
      // Guardar access_token de Google para usar con Google Drive
      if (account?.provider === "google") {
        console.log("[JWT] Nuevo login detectado, guardando tokens");
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.accessTokenExpires = account.expires_at ? account.expires_at * 1000 : Date.now() + 3600 * 1000;
        
        // CRITICAL: Guardar token en la base de datos
        if (token.id && account.access_token) {
          await updateAccountTokens(
            token.id as string,
            account.access_token,
            account.refresh_token ?? undefined,
            account.expires_at ?? undefined
          );
        }
      }
      
      // Refresh token if NOT expired
      if (token.accessTokenExpires && Date.now() < (token.accessTokenExpires as number)) {
        return token;
      }
      
      // Token has expired, try to refresh it
      if (token.refreshToken) {
        console.log("[JWT] Token expirado, intentando refresh...");
        try {
          const response = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: process.env.GOOGLE_CLIENT_ID!,
              client_secret: process.env.GOOGLE_CLIENT_SECRET!,
              grant_type: "refresh_token",
              refresh_token: token.refreshToken as string,
            }),
          });
          
          const refreshedTokens = await response.json();
          
          if (!response.ok) {
            console.error("[JWT] Error en refresh:", refreshedTokens);
            throw refreshedTokens;
          }
          
          console.log("[JWT] Refresh exitoso, nuevo token preview:", refreshedTokens.access_token?.substring(0, 10));
          
          const newAccessToken = refreshedTokens.access_token;
          const newExpiresAt = Math.floor(Date.now() / 1000) + refreshedTokens.expires_in;
          const newRefreshToken = refreshedTokens.refresh_token ?? token.refreshToken;
          
          // CRITICAL: Guardar el token refrescado en la base de datos
          if (token.id) {
            await updateAccountTokens(
              token.id as string,
              newAccessToken,
              newRefreshToken as string,
              newExpiresAt
            );
          }
          
          return {
            ...token,
            accessToken: newAccessToken,
            accessTokenExpires: newExpiresAt * 1000,
            refreshToken: newRefreshToken,
          };
        } catch (error) {
          console.error("[JWT] Error refreshing access token", error);
          return { ...token, error: "RefreshAccessTokenError" };
        }
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
