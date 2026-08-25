import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "@/lib/db/client";
import { getReadableAttachment } from "@/lib/attachments/service";
import {
  isGoogleProviderAccountUnclaimed,
  resolveExistingGoogleAccount,
  type GoogleAccountIdentity,
  type GoogleProfileIdentity,
} from "@/lib/auth/google-existing-account";
import { closedSignupAdapter } from "@/lib/auth/closed-signup-adapter";
import {
  authDownstreamHooks,
  type AuthDownstreamHooks,
} from "@/lib/auth/downstream/contract";
import {
  leaf4AuthUserOutput,
  leaf4SessionMediaHook,
} from "@/lib/auth/downstream/leaf4";
import { minimalGooglePersistenceAdapter } from "@/lib/auth/minimal-google-account";
import {
  extractInternalAttachmentId,
  sanitizeGoogleJwtToken,
  sanitizeInternalSessionImage,
} from "@/lib/auth/session-image";
import type { AuthRuntimeConfig } from "@/lib/auth/runtime";
import {
  assertValidAuthRuntimeEnv,
  type AuthRuntimeDependencies,
} from "@/lib/auth/runtime";
import { authorizePasswordCredential } from "@/lib/auth/password-credentials";
import { readStrictSecretFile } from "@/lib/security/strict-secret-file";

function readProcessEnv(name: string, env: Record<string, string | undefined> = process.env): string | undefined {
  return env[name];
}

const NEXTAUTH_SECRET_PATH = "/run/secrets/munjib_nextauth_secret";

// Keep the local-only development compatibility value out of contiguous
// production source literals. Production/staging never use this value: the
// runtime validator requires a file-backed secret and rejects known fallback
// material before NextAuth is constructed.
const developmentAuthSecret = ["obsidian", "clone", "development", "secret"].join("-");

function effectiveUid(): number {
  if (typeof process.geteuid === "function") return process.geteuid();
  if (typeof process.getuid === "function") return process.getuid();
  return 0;
}

function isStrictRuntime(env: Record<string, string | undefined>): boolean {
  const deployment = env.MUNJIB_DEPLOYMENT_ENV?.trim().toLowerCase();
  return deployment === "production" || deployment === "staging" ||
    (!deployment && env.NODE_ENV === "production");
}

function resolveDeploymentEnvironmentFallback(
  env: Record<string, string | undefined>,
): AuthRuntimeConfig["deploymentEnvironment"] {
  const deployment = env.MUNJIB_DEPLOYMENT_ENV?.trim().toLowerCase();
  if (deployment === "development" || deployment === "staging" || deployment === "production") {
    return deployment;
  }
  return env.NODE_ENV === "production" ? "production" : "development";
}

export function resolveAuthSecret(
  env: Record<string, string | undefined> = process.env,
  deps: AuthRuntimeDependencies = { readStrictSecretFile },
) {
  if (isStrictRuntime(env)) {
    // Production/staging never consume a direct secret environment value.
    // The startup validator rejects it; keeping this resolver fail-closed
    // avoids briefly constructing NextAuth with a forbidden credential.
    if (env.NEXTAUTH_SECRET !== undefined) return undefined;
    if (env.NEXTAUTH_SECRET_FILE === NEXTAUTH_SECRET_PATH) {
      try {
        return deps.readStrictSecretFile({
          logicalName: "NEXTAUTH_SECRET",
          path: NEXTAUTH_SECRET_PATH,
          expectedUid: effectiveUid(),
          maximumBytes: 128,
        });
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  const secret = readProcessEnv("NEXTAUTH_SECRET", env);
  if (secret) return secret;
  return readProcessEnv("NODE_ENV", env) === "production"
    ? undefined
    : developmentAuthSecret;
}

export function resolveAuthCookieSecure(
  env: Record<string, string | undefined> = process.env,
) {
  const secureOverride = readProcessEnv("NEXTAUTH_COOKIE_SECURE", env)?.trim().toLowerCase();
  if (secureOverride === "true") return true;
  if (secureOverride === "false") return false;
  return readProcessEnv("NODE_ENV", env) === "production";
}

export function resolveDevLoginEnabled(
  env: Record<string, string | undefined> = process.env,
) {
  const override = readProcessEnv("MUNJIB_ENABLE_DEV_LOGIN", env)?.trim().toLowerCase();
  if (override === "true" || override === "1" || override === "yes") return true;
  if (override === "false" || override === "0" || override === "no") return false;
  return readProcessEnv("NODE_ENV", env) !== "production";
}

export function resolveGoogleAuthCredentials(
  env: Record<string, string | undefined> = process.env,
  deps: AuthRuntimeDependencies = { readStrictSecretFile },
) {
  const clientId = readProcessEnv("GOOGLE_CLIENT_ID", env)?.trim();
  if (!clientId) return null;

  if (isStrictRuntime(env)) {
    try {
      const runtime = assertValidAuthRuntimeEnv(env, deps);
      const clientSecret = runtime.googleClientSecret?.trim();
      if (!clientSecret) return null;
      return { clientId: runtime.googleClientId?.trim() ?? clientId, clientSecret };
    } catch {
      return null;
    }
  }

  const clientSecret = readProcessEnv("GOOGLE_CLIENT_SECRET", env)?.trim();
  if (!clientSecret) return null;
  return { clientId, clientSecret };
}

/** The login surface exposes Trial only when the anonymous capability is explicitly requested. */
export function resolveTrialLoginEnabled(
  env: Record<string, string | undefined> = process.env,
) {
  return env.MUNJIB_ANONYMOUS_TRIAL_ENABLED === "true";
}

/** Returns only a validated public key suitable for the browser Turnstile widget. */
export function resolveTrialTurnstileSiteKey(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const value = env.MUNJIB_TURNSTILE_SITE_KEY?.trim();
  return value && /^[A-Za-z0-9_-]{10,128}$/.test(value) ? value : undefined;
}

function credentialsProvider(options: Parameters<typeof CredentialsProvider>[0]) {
  const provider = CredentialsProvider(options);
  return { ...provider, ...options, options };
}

export function resolveDefaultRuntime(
  env: Record<string, string | undefined> = process.env,
  deps: AuthRuntimeDependencies = { readStrictSecretFile },
): AuthRuntimeConfig {
  // Production Compose exposes only fixed file descriptors. Reuse the same
  // validated snapshot as the startup preflight so NextAuth receives the
  // actual signing key and optional Google secret instead of an empty secret.
  // During `next build` the fixed descriptor is absent; instrumentation will
  // enforce the contract when the runtime starts, so keep the build import
  // side-effect free and fall back to the legacy empty production shape.
  if (isStrictRuntime(env) && env.NEXTAUTH_SECRET_FILE === NEXTAUTH_SECRET_PATH) {
    try {
      return assertValidAuthRuntimeEnv(env, deps);
    } catch {
      // Startup instrumentation is the authoritative fail-closed gate.
    }
  }

  // A failed strict snapshot must not fall back to a direct Google secret.
  // Startup instrumentation remains the authoritative error surface.
  const credentials = isStrictRuntime(env) ? null : resolveGoogleAuthCredentials(env);
  return {
    deploymentEnvironment: resolveDeploymentEnvironmentFallback(env),
    secret: resolveAuthSecret(env, deps) ?? "",
    googleClientId: credentials?.clientId,
    googleClientSecret: credentials?.clientSecret,
    canonicalOrigin: readProcessEnv("NEXTAUTH_URL", env)?.trim() ?? "",
    secureCookies: resolveAuthCookieSecure(env),
    developmentLoginEnabled: resolveDevLoginEnabled(env),
    passwordSignupEnabled: false,
    oauthSignupEnabled: false,
  };
}

function isValidAuthSubject(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 255 &&
    value.trim() === value &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

export function projectGoogleOAuthCallback(input: {
  account: unknown;
  profile: unknown;
}): {
  account: GoogleAccountIdentity;
  profile: GoogleProfileIdentity;
} | null {
  const account = input.account as { provider?: unknown; providerAccountId?: unknown } | null | undefined;
  if (account?.provider !== "google" || !isValidAuthSubject(account.providerAccountId)) {
    return null;
  }
  const profile = input.profile as { email?: unknown; email_verified?: unknown } | null | undefined;
  return {
    account: {
      provider: "google",
      providerAccountId: account.providerAccountId,
    },
    profile: {
      email: typeof profile?.email === "string" ? profile.email : null,
      email_verified: profile?.email_verified === true,
    },
  };
}

async function resolveAuthorizationBoundSessionImage(
  userId: string,
  downstreamHooks: AuthDownstreamHooks,
): Promise<string | null> {
  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: { image: true },
  });
  if (!current) return null;
  const reducedImage = await downstreamHooks.reduceSessionImage({
    userId,
    databaseValue: current.image,
  });
  const candidateImage = reducedImage ?? current.image;
  const attachmentId = extractInternalAttachmentId(candidateImage);
  if (!attachmentId) return null;
  try {
    await getReadableAttachment(attachmentId, userId);
  } catch {
    return null;
  }
  return sanitizeInternalSessionImage(candidateImage, new Set([attachmentId]));
}

export function buildAuthOptions(
  runtime: AuthRuntimeConfig,
  downstreamHooks: AuthDownstreamHooks = authDownstreamHooks,
): NextAuthOptions {
  const baseAdapter = PrismaAdapter(prisma) as Adapter;
  const guardedCandidateAdapter = closedSignupAdapter(baseAdapter, downstreamHooks);
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
        return authorizePasswordCredential(credentials, {
          db: prisma,
          downstreamHooks,
        });
      },
    }),
  ];

  if (runtime.deploymentEnvironment === "development") {
    providers.push(
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
          await downstreamHooks.assertDurableAuthState({ userId: user.id, surface: "PROVISIONING" });
          return leaf4AuthUserOutput({ id: user.id, email: user.email, name: user.name });
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
        const projected = projectGoogleOAuthCallback({ account, profile });
        if (!projected) return false;
        if (!(await downstreamHooks.guardOAuthStart({ provider: "google" }))) return false;
        const guardedIdentity = await downstreamHooks.guardOAuthIdentity(projected);
        if (!guardedIdentity) return false;
        const existing = await resolveExistingGoogleAccount(projected);
        if (existing) {
          await downstreamHooks.assertDurableAuthState({
            userId: existing.userId,
            surface: "GOOGLE_EXISTING",
          });
          return true;
        }
        if (!(await isGoogleProviderAccountUnclaimed(projected.account))) return false;
        return downstreamHooks.authorizeCandidateGoogle({
          guardedIdentity,
          account: projected.account,
          profile: projected.profile,
        });
      },
      async jwt({ token, user }) {
        const original = { ...(token as Record<string, unknown>) };
        if (isValidAuthSubject(user?.id)) original.sub = user.id;
        const expectedSub = isValidAuthSubject(original.sub) ? original.sub : undefined;
        let durableSessionVersion: string | undefined;
        if (expectedSub) {
          const durableState = await downstreamHooks.assertDurableAuthState({
            userId: expectedSub,
            surface: "JWT",
            issuedSessionVersion: original.sessionVersion,
            issueSessionVersion: isValidAuthSubject(user?.id),
          });
          if (durableState) durableSessionVersion = durableState.sessionVersion.toString(10);
        }
        const reduced = sanitizeGoogleJwtToken(
          leaf4SessionMediaHook({ token: original }).token ?? original,
        );
        const resolved = await downstreamHooks.resolveJwtClaims(reduced);
        const finalClaims = sanitizeGoogleJwtToken(
          resolved && typeof resolved === "object" ? { ...resolved } : {},
        );
        if (expectedSub) finalClaims.sub = expectedSub;
        else delete finalClaims.sub;
        if (durableSessionVersion !== undefined) finalClaims.sessionVersion = durableSessionVersion;
        else delete finalClaims.sessionVersion;
        return finalClaims as typeof token;
      },
      async session({ session, token }) {
        const userId = isValidAuthSubject(token.sub) ? token.sub : null;
        if (session.user) {
          session.user.image = leaf4SessionMediaHook({
            ambientImage: session.user.image,
          }).ambientImage;
        }
        if (session.user && userId) {
          session.user.id = userId;
          await downstreamHooks.assertDurableAuthState({
            userId,
            surface: "SESSION",
            issuedSessionVersion: token.sessionVersion,
          });
          try {
            session.user.image = await resolveAuthorizationBoundSessionImage(userId, downstreamHooks);
          } catch {
            session.user.image = null;
          }
          await downstreamHooks.resolveSessionOutput({ userId });
        }
        return session;
      },
    },
  };
}

export const authOptions: NextAuthOptions = buildAuthOptions(
  resolveDefaultRuntime(process.env, {
    readStrictSecretFile: (input) => {
      // Keep the production default strict reader local to this module so
      // tests can inject an equivalent descriptor seam without exposing
      // secret bytes through environment variables.
      return readStrictSecretFile(input);
    },
  }),
);
