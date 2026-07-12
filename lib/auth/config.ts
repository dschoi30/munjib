import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "@/lib/db/client";
import { authorizeExistingGoogleAccount, isGoogleProviderAccountUnclaimed } from "@/lib/auth/google-existing-account";
import { closedSignupAdapter } from "@/lib/auth/closed-signup-adapter";
import { authDownstreamHooks } from "@/lib/auth/downstream/contract";
import { minimalGooglePersistenceAdapter } from "@/lib/auth/minimal-google-account";
import { sanitizeGoogleJwtToken, sanitizeInternalSessionImage } from "@/lib/auth/session-image";
import type { AuthRuntimeConfig } from "@/lib/auth/runtime";
import { verifyPassword } from "@/lib/auth/passwords";

function readProcessEnv(name: string): string | undefined {
  return process.env[name];
}

export function resolveAuthSecret() {
  const secret = readProcessEnv("NEXTAUTH_SECRET");
  if (secret) return secret;
  return readProcessEnv("NODE_ENV") === "production" ? undefined : "obsidian-clone-development-secret";
}

export function resolveAuthCookieSecure() {
  const secureOverride = readProcessEnv("NEXTAUTH_COOKIE_SECURE")?.trim().toLowerCase();
  if (secureOverride === "true") return true;
  if (secureOverride === "false") return false;
  return readProcessEnv("NODE_ENV") === "production";
}

export function resolveDevLoginEnabled() {
  const override = readProcessEnv("MUNJIB_ENABLE_DEV_LOGIN")?.trim().toLowerCase();
  if (override === "true" || override === "1" || override === "yes") return true;
  if (override === "false" || override === "0" || override === "no") return false;
  return readProcessEnv("NODE_ENV") !== "production";
}

export function resolveGoogleAuthCredentials() {
  const clientId = readProcessEnv("GOOGLE_CLIENT_ID")?.trim();
  const clientSecret = readProcessEnv("GOOGLE_CLIENT_SECRET")?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

function credentialsProvider(options: Parameters<typeof CredentialsProvider>[0]) {
  const provider = CredentialsProvider(options);
  return { ...provider, ...options, options };
}

function resolveDefaultRuntime(): AuthRuntimeConfig {
  const credentials = resolveGoogleAuthCredentials();
  return {
    deploymentEnvironment: readProcessEnv("NODE_ENV") === "production" ? "production" : "development",
    secret: resolveAuthSecret() ?? "",
    googleClientId: credentials?.clientId,
    googleClientSecret: credentials?.clientSecret,
    canonicalOrigin: readProcessEnv("NEXTAUTH_URL")?.trim() ?? "",
    secureCookies: resolveAuthCookieSecure(),
    developmentLoginEnabled: resolveDevLoginEnabled(),
    passwordSignupEnabled: false,
    oauthSignupEnabled: false,
  };
}

async function resolveAuthorizationBoundSessionImage(userId: string): Promise<string | null> {
  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: { image: true },
  });
  if (!current) return null;
  const attachmentDelegate = (prisma as unknown as {
    attachment?: { findMany?: (input: unknown) => Promise<Array<{ id: string }>> };
  }).attachment;
  const attachmentIds = attachmentDelegate?.findMany
    ? await attachmentDelegate
        .findMany({ where: { uploadedById: userId }, select: { id: true } })
        .then((rows) => new Set(rows.map((row) => row.id)))
        .catch(() => new Set<string>())
    : new Set<string>();
  const reducedImage = await authDownstreamHooks.reduceSessionImage({
    userId,
    databaseValue: current.image,
  });
  return sanitizeInternalSessionImage(reducedImage ?? current.image, attachmentIds);
}

export function buildAuthOptions(runtime: AuthRuntimeConfig): NextAuthOptions {
  const baseAdapter = PrismaAdapter(prisma) as Adapter;
  const guardedCandidateAdapter = closedSignupAdapter(baseAdapter, authDownstreamHooks);
  const adapter = minimalGooglePersistenceAdapter(guardedCandidateAdapter);

  const providers = [
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
          select: { id: true, email: true, name: true, image: true, passwordHash: true },
        });
        if (!user?.passwordHash) return null;
        const verified = await verifyPassword(password, user.passwordHash);
        if (!verified) return null;
        await authDownstreamHooks.assertDurableAuthState({ userId: user.id, surface: "PASSWORD" });
        if (!(await authDownstreamHooks.admitPasswordCredentials({ userId: user.id, email }))) {
          return null;
        }
        return { id: user.id, email: user.email, name: user.name, image: null };
      },
    }),
  ];

  if (runtime.deploymentEnvironment === "development") {
    providers.push(
      credentialsProvider({
        id: "trial",
        name: "Trial Login",
        credentials: {},
        async authorize() {
          const user = await prisma.user.findUnique({
            where: { email: "mjtrial@munjib.com" },
            select: { id: true, email: true, name: true, image: true },
          });
          if (!user) return null;
          await authDownstreamHooks.assertDurableAuthState({ userId: user.id, surface: "PROVISIONING" });
          return { id: user.id, email: user.email, name: user.name, image: null };
        },
      }),
      credentialsProvider({
        id: "development-login",
        name: "Development Login",
        credentials: { email: { label: "Email", type: "email" } },
        async authorize(credentials) {
          if (!runtime.developmentLoginEnabled || !resolveDevLoginEnabled()) return null;
          const email = credentials?.email?.toLowerCase().trim();
          if (!email) return null;
          const user = await prisma.user.findUnique({ where: { email } });
          if (!user) return null;
          await authDownstreamHooks.assertDurableAuthState({ userId: user.id, surface: "PROVISIONING" });
          return { id: user.id, email: user.email, name: user.name, image: null };
        },
      }),
    );
  }

  if (runtime.googleClientId && runtime.googleClientSecret) {
    providers.push(
      GoogleProvider({
        clientId: runtime.googleClientId,
        clientSecret: runtime.googleClientSecret,
        checks: ["pkce", "state"],
      }) as never,
    );
  }

  return {
    secret: runtime.secret,
    session: { strategy: "jwt" },
    adapter,
    cookies: {
      sessionToken: {
        name: "munjib.session-token",
        options: { httpOnly: true, sameSite: "lax", path: "/", secure: runtime.secureCookies },
      },
    },
    pages: { signIn: "/login" },
    providers,
    callbacks: {
      async signIn({ account, profile }) {
        if (account?.provider !== "google") return true;
        if (!(await authDownstreamHooks.guardOAuthStart({ provider: "google" }))) return false;
        const guardedIdentity = await authDownstreamHooks.guardOAuthIdentity({
          account,
          profile: profile as { email?: string; email_verified?: boolean } | undefined,
        });
        if (!guardedIdentity) return false;
        const existing = await authorizeExistingGoogleAccount({
          account,
          profile: profile as { email?: string; email_verified?: boolean } | undefined,
        });
        if (existing) return true;
        if (!(await isGoogleProviderAccountUnclaimed(account))) return false;
        return authDownstreamHooks.authorizeCandidateGoogle({
          guardedIdentity,
          account,
          profile: profile as { email?: string; email_verified?: boolean },
        });
      },
      async jwt({ token, user }) {
        if (user?.id) token.sub = user.id;
        const reduced = sanitizeGoogleJwtToken(token as Record<string, unknown>);
        return authDownstreamHooks.resolveJwtClaims(reduced) as typeof token;
      },
      async session({ session, token }) {
        const userId = token.sub;
        if (session.user && userId) {
          session.user.id = userId;
          session.user.image = await resolveAuthorizationBoundSessionImage(userId);
          await authDownstreamHooks.resolveSessionOutput({ userId });
        }
        return session;
      },
    },
  };
}

export const authOptions: NextAuthOptions = buildAuthOptions(resolveDefaultRuntime());
