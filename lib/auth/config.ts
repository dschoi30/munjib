import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/db/client";

export function resolveAuthSecret() {
  if (process.env.NEXTAUTH_SECRET) return process.env.NEXTAUTH_SECRET;
  if (process.env.NODE_ENV === "production") return undefined;
  return "obsidian-clone-development-secret";
}

export const authOptions: NextAuthOptions = {
  secret: resolveAuthSecret(),
  session: { strategy: "jwt" },
  cookies: {
    sessionToken: {
      name: "munjib.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Development Login",
      credentials: {
        email: { label: "Email", type: "email" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.toLowerCase().trim();
        if (!email) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.avatarUrl,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
};
