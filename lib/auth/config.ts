import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "@/lib/db/client";
import { verifyPassword } from "@/lib/auth/passwords";

export function resolveAuthSecret() {
  if (process.env.NEXTAUTH_SECRET) return process.env.NEXTAUTH_SECRET;
  if (process.env.NODE_ENV === "production") return undefined;
  return "obsidian-clone-development-secret";
}

export function resolveAuthCookieSecure() {
  const secureOverride = process.env.NEXTAUTH_COOKIE_SECURE?.trim().toLowerCase();
  if (secureOverride === "true") return true;
  if (secureOverride === "false") return false;
  return process.env.NODE_ENV === "production";
}

export function resolveDevLoginEnabled() {
  const override = process.env.MUNJIB_ENABLE_DEV_LOGIN?.trim().toLowerCase();
  if (override === "true" || override === "1" || override === "yes") return true;
  if (override === "false" || override === "0" || override === "no") return false;
  return process.env.NODE_ENV !== "production";
}

export function resolveGoogleAuthCredentials() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

const googleAuthCredentials = resolveGoogleAuthCredentials();

function credentialsProvider(options: Parameters<typeof CredentialsProvider>[0]) {
  const provider = CredentialsProvider(options);
  return { ...provider, ...options, options };
}

export const authOptions: NextAuthOptions = {
  secret: resolveAuthSecret(),
  session: { strategy: "jwt" },
  adapter: PrismaAdapter(prisma) as Adapter,
  cookies: {
    sessionToken: {
      name: "munjib.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: resolveAuthCookieSecure(),
      },
    },
  },
  pages: { signIn: "/login" },
  providers: [
    credentialsProvider({
      id: "password",
      name: "Email password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.toLowerCase().trim();
        const password = credentials?.password;
        if (!email || typeof password !== "string" || password.length === 0) return null;

        const user = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            name: true,
            image: true,
            passwordHash: true,
          },
        });
        if (!user?.passwordHash) return null;

        const verified = await verifyPassword(password, user.passwordHash);
        if (!verified) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
    credentialsProvider({
      id: "trial",
      name: "Trial Login",
      credentials: {},
      async authorize() {
        const user = await prisma.user.findUnique({
          where: { email: "legacy-account-2@example.invalid" },
          select: { id: true, email: true, name: true, image: true },
        });
        if (!user) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
    credentialsProvider({
      id: "development-login",
      name: "Development Login",
      credentials: {
        email: { label: "Email", type: "email" },
      },
      async authorize(credentials) {
        if (!resolveDevLoginEnabled()) return null;

        const email = credentials?.email?.toLowerCase().trim();
        if (!email) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
    ...(googleAuthCredentials
      ? [
          GoogleProvider({
            clientId: googleAuthCredentials.clientId,
            clientSecret: googleAuthCredentials.clientSecret,
          }),
        ]
      : []),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== "google") return true;
      return (profile as { email_verified?: boolean } | undefined)?.email_verified === true;
    },
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
