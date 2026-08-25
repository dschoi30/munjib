# Fail-Closed Authentication Runtime Implementation Plan

**Tracking:** Issue #155 · remote branch `issue-155-security-auth-runtime`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make production authentication fail closed for weak runtime configuration, password signup, unlinked OAuth identities, development login, and production seed/bootstrap misuse while preserving existing password and already-linked Google users.

**Architecture:** One runtime parser validates deployment identity, strict file-backed production signing/provider secrets, canonical origin, secure cookies, and provider flags. It reads protected files once through an O_NOFOLLOW, same-FD, owner/mode/size-bounded helper and passes values directly to NextAuth/provider construction without exporting or printing them. Password verification parses one canonical parameter-pinned scrypt envelope, performs bounded dummy work for unknown or malformed accounts, and compare-and-swap upgrades the exact legacy envelope before session issuance. NextAuth uses both a closed-signup callback policy and a custom minimal-identity adapter: production Google login succeeds only when the exact `(provider, providerAccountId)` already exists, while token/profile-media persistence, `createUser`, and new Google `linkAccount` calls are rejected before persistence. Startup, Compose, deployment, seed, browser smoke tests, and the implementation handoff consume the same contract.

**Tech Stack:** Next.js 15 App Router, NextAuth v4 JWT sessions, Prisma 6/PostgreSQL, TypeScript, Node crypto, Vitest, Playwright, Docker Compose, GitHub Actions

## Global Constraints

- This is Leaf 1. Leaf 2 Trial isolation and Leaf 13 immutable delivery/recovery gates build on it; this leaf does not remove Trial data.
- Production signup is closed for both password creation and every unlinked OAuth identity. A provider-verified email is necessary but never sufficient in `closed`.
- Existing password users and token-free Google users with an exact existing `Account(provider="google", providerAccountId)` continue to authenticate. Eligibility queries must select every OAuth token/expiry column and reject the row when any is non-null. A legacy token-bearing Google row remains edge-contained and is later journal-revoked rather than silently treated as safe identity state.
- Closed mode must reject an unlinked Google identity before a `User` or `Account` row is created, even if NextAuth callback ordering changes.
- New Account writes persist only `userId`, `type`, `provider`, and `providerAccountId`. Google `access_token`, `refresh_token`, `id_token`, `session_state`, `scope`, `token_type`, and `expires_at` are never persisted, refreshed, returned, logged, or placed in a journal payload. Existing token-bearing rows remain behind the Google edge containment until the verified recovery gate and journal are ready, then use the existing `AUTH_OAUTH_ACCOUNT_REVOKED` deny event during bounded scrub/revocation; this leaf does not add a twenty-seventh journal kind.
- Google `profile.image` and `picture` are untrusted remote media. They are never persisted to `User.image`, copied into a JWT, or emitted in a session. Historical external `User.image` may remain in PostgreSQL but resolves to `null`; an internal attachment URL passes the session-image sanitizer only when its exact attachment ID is also present in a server-built authorization allowlist for that user and request. Path shape alone is never authorization.
- Staging/production read `NEXTAUTH_SECRET_FILE` and, when Google is enabled, `GOOGLE_CLIENT_SECRET_FILE`. Direct `NEXTAUTH_SECRET`/`GOOGLE_CLIENT_SECRET` values are allowed only in explicit development/test fixtures and are rejected in strict deployments.
- Production rejects missing, symlinked, non-regular, wrong-owner/mode, multi-linked, oversized, whitespace-bearing, short-read, non-canonical, recognizable-fallback, and low-entropy secret files. `NEXTAUTH_SECRET` decodes from base64url to at least 32 bytes.
- Test fixtures use `randomBytes(32).toString("base64url")`; repeated-character fixtures are forbidden except as explicit negative cases.
- Production uses one canonical HTTPS origin, Secure cookies, disabled development login, and no Compose value interpolation/default for secret material. Compose mounts fixed-path read-only secret files.
- Startup, tools, seed, deployment, and NextAuth use the same runtime validator. No caller reimplements a weaker subset.
- Password signup remains closed until the approved invitation leaf. Password reset and public password verification remain out of scope.
- Password verification accepts only a canonical current scrypt envelope or the exact bounded legacy `scrypt:salt:key` migration envelope. Password bytes are neither trimmed nor Unicode-normalized. Unknown, passwordless, and malformed-hash accounts perform the same dummy scrypt work and return the same public credential outcome.
- Before Leaf 8 adds distributed admission, a fixed process-local resource guard permits at most two active scrypt calls, eight bounded waiters, and a two-second wait. Saturation fails closed without retaining unbounded password closures. Leaf 8 retains this CPU/memory guard; it does not treat it as rate-limit authority.
- MFA, password reset, public password verification, and recovery-factor enrollment are not introduced by this leaf.
- Leaf 1 exclusively owns protected `lib/auth/config.ts`, the password verifier, and `lib/auth/session-image.ts`. It creates frozen downstream hook contracts plus separate default `lib/auth/downstream/leaf2.ts`, `lib/auth/downstream/leaf4.ts`, `lib/auth/downstream/leaf8.ts`, and `lib/auth/downstream/leaf7.ts` slots. Later leaves may change only their assigned slot/helper paths and capability fragment; they never edit or republish Leaf 1 protected artifacts.
- Compose config output, `docker inspect`, argv, process diagnostics, logs, wiki, commits, PRs, tests, and preflight output never contain secrets, OAuth tokens, cookies, raw provider payloads, production account values, or exact production counts.
- Every task writes a real durable wiki/log delta, runs hook installation and staged wiki sync gates, and ends in a commit.
- Secret scans use `rg -q` inside a stable shell conditional; they never print matching secret material.

---

## File Structure

- `lib/runtime/deployment-env.ts`: strict deployment identity.
- `lib/security/strict-secret-file.ts`: no-follow, same-FD, owner/mode/size-bounded secret loading.
- `lib/auth/runtime.ts`: file-backed signing/provider secrets, canonical-origin, cookie, development-login, closed-signup runtime inspection, and domain-separated internal subkey derivation from an already validated runtime config.
- `lib/auth/google-existing-account.ts`: exact linked-Google eligibility.
- `lib/auth/minimal-google-account.ts`, `lib/auth/closed-signup-adapter.ts`, and `lib/auth/session-image.ts`: token-zero minimal provider identity, an adapter-wide explicit write allowlist, closed persistence, and authorization-bound internal session images.
- `lib/auth/passwords.ts`, `lib/auth/password-work-limit.ts`, and `lib/auth/password-credentials.ts`: canonical/legacy hash parsing, fixed scrypt work, dummy verification, bounded concurrency, and pre-session compare-and-swap upgrade.
- `lib/auth/downstream/contract.ts`, `lib/auth/downstream/leaf2.ts`, `lib/auth/downstream/leaf4.ts`, `lib/auth/downstream/leaf8.ts`, and `lib/auth/downstream/leaf7.ts`: frozen Leaf 1 callback contract plus separately owned default durable-auth-state, media-output, abuse/session, and closed-signup extension slots.
- `lib/auth/config.ts`: providers and callbacks built from one runtime snapshot.
- `app/api/auth/signup/route.ts` and `app/login/login-form.tsx`: stable closed password-signup behavior.
- `instrumentation.ts` and `scripts/security/auth-preflight.ts`: startup and operator enforcement.
- `lib/security/production-seed-guard.ts`, `scripts/security/bootstrap-owner.ts`, and seed/CLI tests: production mutation separation.
- Compose, workflow, Playwright, wiki, and contract tests: deploy/browser/durable enforcement.

### Task 1: Define strict secret-file and deployment runtime validation

**Files:**
- Create: `lib/runtime/deployment-env.ts`
- Create: `lib/security/strict-secret-file.ts`
- Create: `lib/auth/runtime.ts`
- Create: `tests/security/strict-secret-file.test.ts`
- Create: `tests/auth/runtime.test.ts`
- Modify: `wiki/Auth And Permissions Workflow.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`

**Interfaces:**
- Consumes in staging/production: `MUNJIB_DEPLOYMENT_ENV`, `NEXTAUTH_SECRET_FILE`, optional `GOOGLE_CLIENT_ID` plus `GOOGLE_CLIENT_SECRET_FILE`, `NEXTAUTH_URL`, `NEXTAUTH_COOKIE_SECURE`, and `MUNJIB_ENABLE_DEV_LOGIN`.
- Consumes in explicit development/test only: in-memory `NEXTAUTH_SECRET` and optional `GOOGLE_CLIENT_SECRET` fixtures.
- Produces: `readStrictSecretFile(input)`, `parseDeploymentEnvironment(env)`, `inspectAuthRuntimeEnv(env, deps)`, `assertValidAuthRuntimeEnv(env, deps)`, `deriveAuthRuntimeSubkey(runtime,"document-cursor-v1")`, `AuthRuntimeConfig`, and stable error codes.

- [ ] **Step 1: Write the failing runtime tests**

```ts
// tests/auth/runtime.test.ts
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  assertValidAuthRuntimeEnv,
  inspectAuthRuntimeEnv,
} from "@/lib/auth/runtime";

const generatedSecret = () => randomBytes(32).toString("base64url");
const nextAuthSecretPath = "/run/secrets/munjib_nextauth_secret";
const productionEnv = () => ({
  MUNJIB_DEPLOYMENT_ENV: "production",
  NEXTAUTH_SECRET_FILE: nextAuthSecretPath,
  NEXTAUTH_URL: "https://munjib.example",
  NEXTAUTH_COOKIE_SECURE: "true",
  MUNJIB_ENABLE_DEV_LOGIN: "false",
});
const deps = (secret = generatedSecret()) => ({
  readStrictSecretFile: ({ path }: { path: string }) => {
    if (path !== nextAuthSecretPath) throw new Error("SECRET_FILE_UNAVAILABLE");
    return secret;
  },
});

describe("auth runtime", () => {
  it("accepts a generated base64url secret and closes production signup", () => {
    expect(assertValidAuthRuntimeEnv(productionEnv(), deps())).toMatchObject({
      deploymentEnvironment: "production",
      canonicalOrigin: "https://munjib.example",
      secureCookies: true,
      developmentLoginEnabled: false,
      passwordSignupEnabled: false,
      oauthSignupEnabled: false,
    });
  });

  it.each([
    ["blank", "", "AUTH_SECRET_REQUIRED"],
    ["short", "c2hvcnQ", "AUTH_SECRET_FORMAT_INVALID"],
    [
      "known fallback",
      Buffer.from("obsidian-clone-development-secret".padEnd(32, "!")).toString("base64url"),
      "AUTH_SECRET_FALLBACK",
    ],
    ["repeated", "A".repeat(43), "AUTH_SECRET_LOW_ENTROPY"],
    ["non-canonical", `${generatedSecret()}=`, "AUTH_SECRET_FORMAT_INVALID"],
  ])("rejects %s production secret", (_label, secret, code) => {
    const inspection = inspectAuthRuntimeEnv(productionEnv(), deps(secret));
    expect(inspection.errors).toContain(code);
  });

  it("rejects direct production secret values and a missing secret-file path", () => {
    expect(
      inspectAuthRuntimeEnv(
        { ...productionEnv(), NEXTAUTH_SECRET: generatedSecret() },
        deps(),
      ).errors,
    ).toContain("AUTH_SECRET_ENV_FORBIDDEN");
    expect(
      inspectAuthRuntimeEnv(
        { ...productionEnv(), NEXTAUTH_SECRET_FILE: undefined },
        deps(),
      ).errors,
    ).toContain("AUTH_SECRET_FILE_REQUIRED");
  });

  it("requires a file-backed Google secret when Google is enabled", () => {
    expect(
      inspectAuthRuntimeEnv(
        { ...productionEnv(), GOOGLE_CLIENT_ID: "client-id" },
        deps(),
      ).errors,
    ).toContain("GOOGLE_CLIENT_SECRET_FILE_REQUIRED");
  });

  it("rejects insecure production origin, cookies, and development login", () => {
    expect(
      inspectAuthRuntimeEnv(
        {
          ...productionEnv(),
          NEXTAUTH_URL: "http://munjib.example",
          NEXTAUTH_COOKIE_SECURE: "false",
          MUNJIB_ENABLE_DEV_LOGIN: "true",
        },
        deps(),
      ).errors,
    ).toEqual(
      expect.arrayContaining([
        "AUTH_URL_HTTPS_REQUIRED",
        "AUTH_COOKIE_NOT_SECURE",
        "DEVELOPMENT_LOGIN_ENABLED",
      ]),
    );
  });
});
```

`tests/security/strict-secret-file.test.ts` separately covers final-component symlinks, a symlinked/untrusted parent, path swap, non-regular files, `nlink !== 1`, wrong effective owner, any group/world bit, mode other than `0400`, zero/oversize files, embedded NUL/BOM/whitespace/newline, short read, appended bytes after `fstat`, and same-FD success. Error objects contain stable codes and the logical secret name only, never the path contents, bytes, digest, length, owner, or mode.

- [ ] **Step 2: Run the tests and confirm RED**

Run: `pnpm exec vitest run tests/security/strict-secret-file.test.ts tests/auth/runtime.test.ts`

Expected: FAIL because the strict file reader, file-only production contract, and generated-secret validation do not exist.

- [ ] **Step 3: Implement strict deployment parsing**

```ts
// lib/runtime/deployment-env.ts
export type DeploymentEnvironment = "development" | "staging" | "production";

export function parseDeploymentEnvironment(
  env: Record<string, string | undefined>,
): DeploymentEnvironment {
  const value = env.MUNJIB_DEPLOYMENT_ENV?.trim().toLowerCase();
  if (value === "development" || value === "staging" || value === "production") {
    return value;
  }
  throw new Error(value ? "DEPLOYMENT_ENV_INVALID" : "DEPLOYMENT_ENV_REQUIRED");
}
```

- [ ] **Step 4: Implement the strict same-FD secret reader**

`readStrictSecretFile` accepts only a logical secret name, an allowlisted absolute path directly below `/run/secrets`, expected effective UID, and maximum bytes. It:

1. `lstat`s each fixed parent component and rejects symlinks or group/world-writable parents;
2. opens the final component once with `O_RDONLY | O_NOFOLLOW | O_CLOEXEC`;
3. `fstat`s that descriptor and requires a regular file, `nlink === 1`, owner equal to the Web process UID, and exact mode `0400`;
4. requires size within the caller's bound, reads exactly that many bytes from the same descriptor, then attempts one extra byte to detect growth;
5. rejects short read, NUL, BOM, control characters, leading/trailing whitespace, and any newline;
6. closes the descriptor in `finally` and returns an in-memory string without mutating `process.env`.

Errors expose only stable codes such as `SECRET_FILE_SYMLINK`, `SECRET_FILE_OWNER_INVALID`, and `SECRET_FILE_CONTENT_INVALID`. The implementation never includes the file value, path, digest, size, UID, or mode in errors or logs.

- [ ] **Step 5: Implement canonical secret and runtime validation**

```ts
// lib/auth/runtime.ts
import { parseDeploymentEnvironment } from "@/lib/runtime/deployment-env";
import { readStrictSecretFile } from "@/lib/security/strict-secret-file";

type Env = Record<string, string | undefined>;
export type AuthRuntimeErrorCode =
  | "DEPLOYMENT_ENV_REQUIRED"
  | "DEPLOYMENT_ENV_INVALID"
  | "AUTH_SECRET_FILE_REQUIRED"
  | "AUTH_SECRET_FILE_INVALID"
  | "AUTH_SECRET_ENV_FORBIDDEN"
  | "AUTH_SECRET_REQUIRED"
  | "AUTH_SECRET_FORMAT_INVALID"
  | "AUTH_SECRET_FALLBACK"
  | "AUTH_SECRET_LOW_ENTROPY"
  | "AUTH_URL_REQUIRED"
  | "AUTH_URL_INVALID"
  | "AUTH_URL_HTTPS_REQUIRED"
  | "AUTH_COOKIE_FLAG_INVALID"
  | "AUTH_COOKIE_NOT_SECURE"
  | "DEVELOPMENT_LOGIN_FLAG_INVALID"
  | "DEVELOPMENT_LOGIN_ENABLED"
  | "GOOGLE_CLIENT_SECRET_FILE_REQUIRED"
  | "GOOGLE_CLIENT_SECRET_FILE_INVALID"
  | "GOOGLE_CLIENT_SECRET_ENV_FORBIDDEN";

export type AuthRuntimeConfig = {
  deploymentEnvironment: "development" | "staging" | "production";
  secret: string;
  googleClientId?: string;
  googleClientSecret?: string;
  canonicalOrigin: string;
  secureCookies: boolean;
  developmentLoginEnabled: boolean;
  passwordSignupEnabled: false;
  oauthSignupEnabled: false;
};

export class AuthRuntimeConfigurationError extends Error {
  constructor(readonly codes: AuthRuntimeErrorCode[]) {
    super(`AUTH_RUNTIME_INVALID:${codes.join(",")}`);
  }
}

const knownFallbacks = [
  "obsidian-clone-development-secret",
  "development-secret",
  "local-development-only",
  "change-me",
];

function inspectSecret(value: string | undefined) {
  const secret = value;
  if (!secret) return { secret: "", error: "AUTH_SECRET_REQUIRED" as const };
  if (secret !== secret.trim()) {
    return { secret, error: "AUTH_SECRET_FORMAT_INVALID" as const };
  }
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(secret)) {
    return { secret, error: "AUTH_SECRET_FORMAT_INVALID" as const };
  }
  let decoded: Buffer;
  try {
    decoded = Buffer.from(secret, "base64url");
  } catch {
    return { secret, error: "AUTH_SECRET_FORMAT_INVALID" as const };
  }
  if (decoded.length < 32 || decoded.toString("base64url") !== secret) {
    return { secret, error: "AUTH_SECRET_FORMAT_INVALID" as const };
  }
  const decodedText = decoded.toString("utf8").toLowerCase();
  if (knownFallbacks.some((fallback) => decodedText.includes(fallback))) {
    return { secret, error: "AUTH_SECRET_FALLBACK" as const };
  }
  if (new Set(secret).size < 12 || /^(.)\1+$/.test(secret)) {
    return { secret, error: "AUTH_SECRET_LOW_ENTROPY" as const };
  }
  return { secret };
}

function parseBoolean(
  raw: string | undefined,
  fallback: boolean,
  invalid: AuthRuntimeErrorCode,
  errors: AuthRuntimeErrorCode[],
) {
  if (raw === undefined || raw.trim() === "") return fallback;
  if (raw.trim().toLowerCase() === "true") return true;
  if (raw.trim().toLowerCase() === "false") return false;
  errors.push(invalid);
  return fallback;
}

type RuntimeDeps = {
  readStrictSecretFile: typeof readStrictSecretFile;
};

const defaultDeps: RuntimeDeps = { readStrictSecretFile };

export function inspectAuthRuntimeEnv(
  env: Env,
  deps: RuntimeDeps = defaultDeps,
) {
  const errors: AuthRuntimeErrorCode[] = [];
  let deploymentEnvironment: AuthRuntimeConfig["deploymentEnvironment"] = "development";
  try {
    deploymentEnvironment = parseDeploymentEnvironment(env);
  } catch (error) {
    errors.push(
      error instanceof Error && error.message === "DEPLOYMENT_ENV_INVALID"
        ? "DEPLOYMENT_ENV_INVALID"
        : "DEPLOYMENT_ENV_REQUIRED",
    );
  }
  const strict = deploymentEnvironment !== "development";
  let loadedNextAuthSecret: string | undefined;
  let loadedGoogleSecret: string | undefined;
  if (strict) {
    if (env.NEXTAUTH_SECRET !== undefined) errors.push("AUTH_SECRET_ENV_FORBIDDEN");
    if (env.GOOGLE_CLIENT_SECRET !== undefined) {
      errors.push("GOOGLE_CLIENT_SECRET_ENV_FORBIDDEN");
    }
    if (env.NEXTAUTH_SECRET_FILE !== "/run/secrets/munjib_nextauth_secret") {
      errors.push("AUTH_SECRET_FILE_REQUIRED");
    } else {
      try {
        loadedNextAuthSecret = deps.readStrictSecretFile({
          logicalName: "NEXTAUTH_SECRET",
          path: env.NEXTAUTH_SECRET_FILE,
          expectedUid: process.geteuid?.() ?? process.getuid(),
          maximumBytes: 128,
        });
      } catch {
        errors.push("AUTH_SECRET_FILE_INVALID");
      }
    }
    if (env.GOOGLE_CLIENT_ID) {
      if (
        env.GOOGLE_CLIENT_SECRET_FILE !==
        "/run/secrets/munjib_google_client_secret"
      ) {
        errors.push("GOOGLE_CLIENT_SECRET_FILE_REQUIRED");
      } else {
        try {
          loadedGoogleSecret = deps.readStrictSecretFile({
            logicalName: "GOOGLE_CLIENT_SECRET",
            path: env.GOOGLE_CLIENT_SECRET_FILE,
            expectedUid: process.geteuid?.() ?? process.getuid(),
            maximumBytes: 256,
          });
        } catch {
          errors.push("GOOGLE_CLIENT_SECRET_FILE_INVALID");
        }
      }
    }
  } else {
    loadedNextAuthSecret = env.NEXTAUTH_SECRET;
    loadedGoogleSecret = env.GOOGLE_CLIENT_SECRET;
  }
  const secretResult = inspectSecret(loadedNextAuthSecret);
  if (strict && secretResult.error) errors.push(secretResult.error);
  if (
    loadedGoogleSecret !== undefined &&
    (!/^[\x21-\x7e]{16,256}$/.test(loadedGoogleSecret) ||
      /change.?me|development|example/i.test(loadedGoogleSecret))
  ) {
    errors.push("GOOGLE_CLIENT_SECRET_FILE_INVALID");
  }
  const rawOrigin = env.NEXTAUTH_URL?.trim();
  let canonicalOrigin = "";
  if (!rawOrigin) {
    errors.push("AUTH_URL_REQUIRED");
  } else {
    try {
      const parsed = new URL(rawOrigin);
      if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
        errors.push("AUTH_URL_INVALID");
      }
      if (strict && parsed.protocol !== "https:") errors.push("AUTH_URL_HTTPS_REQUIRED");
      canonicalOrigin = parsed.origin;
    } catch {
      errors.push("AUTH_URL_INVALID");
    }
  }
  const secureCookies = parseBoolean(
    env.NEXTAUTH_COOKIE_SECURE,
    strict,
    "AUTH_COOKIE_FLAG_INVALID",
    errors,
  );
  const requestedDevelopmentLogin = parseBoolean(
    env.MUNJIB_ENABLE_DEV_LOGIN,
    deploymentEnvironment === "development",
    "DEVELOPMENT_LOGIN_FLAG_INVALID",
    errors,
  );
  if (strict && !secureCookies) errors.push("AUTH_COOKIE_NOT_SECURE");
  if (deploymentEnvironment !== "development" && requestedDevelopmentLogin) {
    errors.push("DEVELOPMENT_LOGIN_ENABLED");
  }
  return {
    config: {
      deploymentEnvironment,
      secret: secretResult.secret,
      googleClientId: env.GOOGLE_CLIENT_ID,
      googleClientSecret: loadedGoogleSecret,
      canonicalOrigin,
      secureCookies,
      developmentLoginEnabled:
        deploymentEnvironment === "development" && requestedDevelopmentLogin,
      passwordSignupEnabled: false,
      oauthSignupEnabled: false,
    } satisfies AuthRuntimeConfig,
    errors: Array.from(new Set(errors)),
  };
}

export function assertValidAuthRuntimeEnv(
  env: Env,
  deps: RuntimeDeps = defaultDeps,
) {
  const inspection = inspectAuthRuntimeEnv(env, deps);
  if (inspection.errors.length > 0) {
    throw new AuthRuntimeConfigurationError(inspection.errors);
  }
  return inspection.config;
}
```

Also export `deriveAuthRuntimeSubkey(runtime, "document-cursor-v1")`. It accepts only
an already validated `AuthRuntimeConfig`, computes HMAC-SHA-256 over the fixed bytes
`munjib-auth-runtime-subkey-v1\0document-cursor-v1` with `runtime.secret`, returns the
32-byte result, and never reads `process.env`, opens the secret file, returns the root
secret, or logs either value. Task 1 tests prove deterministic output, exact 32-byte
length, domain separation, changed-root-secret separation, and a source contract that
the helper has no environment/file access. Later consumers cache only the derived
subkey and may inject a synthetic 32-byte key in tests.

- [ ] **Step 6: Run GREEN verification**

Run:

```bash
pnpm exec vitest run tests/security/strict-secret-file.test.ts tests/auth/runtime.test.ts
pnpm exec tsc --noEmit
```

Expected: PASS; strict same-FD files and explicit development fixtures pass, while production env values, insecure files, weak/fallback/repeated signing secrets, and incomplete Google configuration fail with stable codes.

- [ ] **Step 7: Record the Task 1 wiki delta and commit**

Append to `wiki/Auth And Permissions Workflow.md`:

```md
### Fail-closed auth runtime

`MUNJIB_DEPLOYMENT_ENV` selects one strict runtime contract. Staging and production
load `NEXTAUTH_SECRET_FILE` and optional `GOOGLE_CLIENT_SECRET_FILE` through the
same no-follow, same-FD, owner/mode/size-bounded reader; direct secret environment
values are forbidden. The runtime also requires one canonical origin, Secure cookies,
disabled development login, and closed password/OAuth signup.
```

Append to `wiki/log.md`:

```md
- 2026-07-12: Added the strict file-backed signing/provider-secret and deployment auth runtime contract; evidence: `lib/security/strict-secret-file.ts`, `lib/auth/runtime.ts`, and their tests.
```

Run:

```bash
git add lib/runtime/deployment-env.ts lib/security/strict-secret-file.ts lib/auth/runtime.ts tests/security/strict-secret-file.test.ts tests/auth/runtime.test.ts wiki/Auth\ And\ Permissions\ Workflow.md wiki/log.md
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "feat(auth): validate fail-closed runtime"
```

Expected: wiki gates PASS and one commit is created.

### Task 2: Close password and unlinked OAuth signup at callback and adapter boundaries

**Files:**
- Create: `lib/auth/google-existing-account.ts`
- Create: `lib/auth/minimal-google-account.ts`
- Create: `lib/auth/closed-signup-adapter.ts`
- Create: `lib/auth/candidate-persistence-context.ts`
- Create: `lib/auth/session-image.ts`
- Create: `lib/auth/downstream/contract.ts`
- Create: `lib/auth/downstream/leaf2.ts`
- Create: `lib/auth/downstream/leaf4.ts`
- Create: `lib/auth/downstream/leaf8.ts`
- Create: `lib/auth/downstream/leaf7.ts`
- Modify: `lib/auth/config.ts`
- Modify: `app/api/auth/signup/route.ts`
- Modify: `app/login/login-form.tsx`
- Create: `tests/auth/google-existing-account.test.ts`
- Create: `tests/auth/minimal-google-account.test.ts`
- Create: `tests/auth/google-token-zero-adapter.test.ts`
- Create: `tests/auth/session-image.test.ts`
- Create: `tests/auth/google-profile-image.test.ts`
- Create: `tests/auth/closed-signup-adapter.test.ts`
- Create: `tests/auth/candidate-persistence-context.test.ts`
- Modify: `tests/auth/config.test.ts`
- Modify: `tests/auth/signup-route.test.ts`
- Modify: `tests/components/login-form.test.tsx`
- Create: `tests/security/closed-oauth-source-contract.test.ts`
- Create: `tests/security/google-account-persistence-source-contract.test.ts`
- Create: `tests/security/auth-downstream-extension-contract.test.ts`
- Modify: `wiki/Auth And Permissions Workflow.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`

**Interfaces:**
- Consumes: `AuthRuntimeConfig.oauthSignupEnabled=false`, Google `email_verified`, exact `(provider, providerAccountId)`, and a server-built set of attachment IDs authorized for the current user/request.
- Produces: `authorizeExistingGoogleAccount`, `isGoogleProviderAccountUnclaimed`, `minimalGoogleAccountData`, `minimalGooglePersistenceAdapter`, `sanitizeInternalSessionImage`, frozen `AuthDownstreamHooks`, default Leaf 2/4/8/7 slots, `runCandidatePersistenceRequestScope()`, guarded current-cell initialization/transition accessors, `closedSignupAdapter`, `buildAuthOptions`, and stable `SIGNUP_NOT_ALLOWED`.

- [ ] **Step 1: Write failing exact-link and zero-persistence tests**

```ts
// tests/auth/google-existing-account.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  account: { findUnique: vi.fn() },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));

import { authorizeExistingGoogleAccount } from "@/lib/auth/google-existing-account";

beforeEach(() => vi.clearAllMocks());

describe("closed Google login", () => {
  it("allows only an exact already-linked provider account", async () => {
    db.account.findUnique.mockResolvedValue({
      userId: "user-1",
      access_token: null,
      refresh_token: null,
      id_token: null,
      session_state: null,
      scope: null,
      token_type: null,
      expires_at: null,
    });
    await expect(
      authorizeExistingGoogleAccount({
        account: { provider: "google", providerAccountId: "google-subject-1" },
        profile: { email: "member@example.test", email_verified: true },
      }),
    ).resolves.toBe(true);
    expect(db.account.findUnique).toHaveBeenCalledWith({
      where: {
        provider_providerAccountId: {
          provider: "google",
          providerAccountId: "google-subject-1",
        },
      },
      select: {
        userId: true,
        access_token: true,
        refresh_token: true,
        id_token: true,
        session_state: true,
        scope: true,
        token_type: true,
        expires_at: true,
      },
    });
  });

  it("denies verified email when the exact account is not linked", async () => {
    db.account.findUnique.mockResolvedValue(null);
    await expect(
      authorizeExistingGoogleAccount({
        account: { provider: "google", providerAccountId: "unlinked-subject" },
        profile: { email: "member@example.test", email_verified: true },
      }),
    ).resolves.toBe(false);
  });

  it("denies an unverified Google profile before lookup", async () => {
    await expect(
      authorizeExistingGoogleAccount({
        account: { provider: "google", providerAccountId: "google-subject-1" },
        profile: { email: "member@example.test", email_verified: false },
      }),
    ).resolves.toBe(false);
    expect(db.account.findUnique).not.toHaveBeenCalled();
  });
});
```

```ts
// tests/auth/closed-signup-adapter.test.ts
import { describe, expect, it, vi } from "vitest";
import { closedSignupAdapter } from "@/lib/auth/closed-signup-adapter";
import { leaf7AuthHooks } from "@/lib/auth/downstream/leaf7";

describe("closed signup adapter", () => {
  it("rejects createUser and a new Google link before delegate persistence", async () => {
    const delegate = {
      createUser: vi.fn(),
      linkAccount: vi.fn(),
    };
    const adapter = closedSignupAdapter(delegate, leaf7AuthHooks);
    await expect(adapter.createUser?.({ email: "new@example.test" } as never))
      .rejects.toThrow("AUTH_SIGNUP_CLOSED");
    await expect(
      adapter.linkAccount?.({
        provider: "google",
        providerAccountId: "unlinked-subject",
      } as never),
    ).rejects.toThrow("AUTH_SIGNUP_CLOSED");
    expect(delegate.createUser).not.toHaveBeenCalled();
    expect(delegate.linkAccount).not.toHaveBeenCalled();
  });
});
```

Add token/media persistence tests that pass Google callback, Account, and profile
objects containing synthetic values in every token field plus `image` and `picture`.
The custom adapter must perform zero delegated Account/User write in closed mode. The
minimal allowlist helper must return exactly `userId`, `type`, `provider`, and
`providerAccountId`, even when the input contains extra token/media keys. Existing
exact-account login performs only the identity lookup and cannot refresh an Account
row. Seed a matching legacy Account once for each token/expiry column and prove every
such row is denied before a session; a row is eligible only when all seven columns are
SQL `NULL`. The Leaf 7 candidate hook is reached only after a separate exact provider-ID
query proves no Account row exists at all; token-bearing, token-free, and concurrently
inserted conflicts never fall through as an "unlinked" candidate.

`sanitizeInternalSessionImage(value, authorizedAttachmentIds)` accepts only the
canonical relative `/api/attachments/<opaque-id>` form with no query or fragment and
only when the exact decoded ID is in the immutable server-built allowlist. An empty or
missing allowlist returns `null`, including for a shape-valid path. It also returns
`null` for HTTP(S), scheme-relative, `data:`, `blob:`, arbitrary same-origin,
encoded-separator, and malformed values. JWT tests require deletion of provider
`picture` claims; session tests require the authorization-bound database value and
never a token or profile value. The callback cannot accept an allowlist from JWT,
profile, cookie, query, or client input.

```ts
// tests/security/closed-oauth-source-contract.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("closed OAuth source contract", () => {
  it("uses both exact-account callback policy and adapter persistence guard", () => {
    const config = readFileSync("lib/auth/config.ts", "utf8");
    expect(config).toContain("authorizeExistingGoogleAccount");
    expect(config).toContain("closedSignupAdapter");
    expect(config).not.toContain("return profile.email_verified");
    expect(config).not.toContain("allowDangerousEmailAccountLinking");
    expect(config).not.toContain("process.env.NEXTAUTH_SECRET");
    expect(config).not.toContain("process.env.GOOGLE_CLIENT_SECRET");
  });
});
```

- [ ] **Step 2: Run RED verification**

Run: `pnpm exec vitest run tests/auth/google-existing-account.test.ts tests/auth/minimal-google-account.test.ts tests/auth/google-token-zero-adapter.test.ts tests/auth/session-image.test.ts tests/auth/google-profile-image.test.ts tests/auth/closed-signup-adapter.test.ts tests/security/closed-oauth-source-contract.test.ts tests/security/google-account-persistence-source-contract.test.ts tests/security/auth-downstream-extension-contract.test.ts`

Expected: FAIL because exact linked-account policy, token-zero persistence, session-image scrubbing, and the adapter guard do not exist.

- [ ] **Step 3: Implement exact existing-account authorization**

```ts
// lib/auth/google-existing-account.ts
import { prisma } from "@/lib/db/client";

type GoogleAccount = {
  provider?: string | null;
  providerAccountId?: string | null;
};
type GoogleProfile = {
  email?: string | null;
  email_verified?: boolean;
};

export async function authorizeExistingGoogleAccount(input: {
  account: GoogleAccount | null | undefined;
  profile: GoogleProfile | null | undefined;
}) {
  if (
    input.account?.provider !== "google" ||
    !input.account.providerAccountId ||
    input.profile?.email_verified !== true
  ) {
    return false;
  }
  const linked = await prisma.account.findUnique({
    where: {
      provider_providerAccountId: {
        provider: "google",
        providerAccountId: input.account.providerAccountId,
      },
    },
    select: {
      userId: true,
      access_token: true,
      refresh_token: true,
      id_token: true,
      session_state: true,
      scope: true,
      token_type: true,
      expires_at: true,
    },
  });
  return Boolean(
    linked &&
    linked.access_token === null &&
    linked.refresh_token === null &&
    linked.id_token === null &&
    linked.session_state === null &&
    linked.scope === null &&
    linked.token_type === null &&
    linked.expires_at === null,
  );
}
```

- [ ] **Step 4: Implement the adapter persistence backstop**

```ts
// lib/auth/closed-signup-adapter.ts
import type { Adapter } from "next-auth/adapters";

export function closedSignupAdapter(
  delegate: Adapter,
  candidatePersistence: CandidateGooglePersistenceHook,
): Adapter {
  return {
    ...delegate,
    async createUser(user) {
      const handled = await candidatePersistence.createCandidateUser({
        email: user.email,
      });
      if (!handled) throw new Error("AUTH_SIGNUP_CLOSED");
      return handled.user;
    },
    async linkAccount(account) {
      const handled = await candidatePersistence.linkCandidateAccount(
        minimalGoogleAccountData(account),
      );
      if (!handled) throw new Error("AUTH_SIGNUP_CLOSED");
      return handled.result;
    },
  };
}
```

The adapter boundary never spreads an OAuth payload. Add the sole future-safe Account
allowlist:

```ts
export function minimalGoogleAccountData(input: {
  userId: string;
  type: string;
  provider: string;
  providerAccountId: string;
}) {
  if (
    input.provider !== "google" ||
    input.type !== "oauth" ||
    !input.userId ||
    !input.providerAccountId
  ) {
    throw new Error("GOOGLE_ACCOUNT_IDENTITY_INVALID");
  }
  return {
    userId: input.userId,
    type: "oauth" as const,
    provider: "google" as const,
    providerAccountId: input.providerAccountId,
  };
}
```

Closed mode still throws before a new link. Leaf 7 may later call this helper inside
its branded grant transaction, but no Google path may call the stock Prisma adapter's
`linkAccount`, spread an Account/profile object, or write `access_token`,
`refresh_token`, `id_token`, `session_state`, `scope`, `token_type`, or `expires_at`.
The source-contract test inventories every Account create/upsert/update and allows
token-column mutation only in the later reviewed `AUTH_OAUTH_ACCOUNT_REVOKED` cleanup
path.

`minimalGooglePersistenceAdapter(delegate)` is the only NextAuth adapter wrapper
allowed around `PrismaAdapter`. It never spreads a provider, Account, User, profile, or
token object into a delegate call. Its write surface is explicit:

- `linkAccount` delegates only `minimalGoogleAccountData(account)`;
- `createUser` delegates only validated normalized email plus `name:null`,
  `emailVerified:null`, and `image:null` (and is still rejected by
  `closedSignupAdapter` in this leaf's production mode);
- provider-driven `updateUser` performs no write and reloads the exact current user by
  required ID; profile name, email, verification time, image, and unknown keys cannot
  mutate an existing user during Google login;
- `unlinkAccount` delegates only exact provider/providerAccountId and `deleteUser`
  only exact user ID; Leaf 8 later places the journal/session invalidation transaction
  in front of those reductions;
- no Account update/upsert/refresh method exists, and every other adapter read method
  delegates unchanged because it accepts no write payload.

The adapter test supplies throwing spies for every underlying Account/User write and
asserts closed login performs none. Separate minimal-mode tests allow only the exact
create/link/unlink/delete shapes above and prove `image`, `picture`, all token/expiry
keys, unknown keys, and object-spread sentinels never reach a delegate. The source
contract inventories every adapter method so adding a new upstream write method fails
until it receives an explicit allowlist or fail-closed override.

The Leaf 1-owned `closedSignupAdapter` invokes a frozen Leaf 7 hook for either
access-increasing method and never delegates those methods to Prisma. The default slot
returns no branded handled result, so Leaf 1 remains closed without a mutable runtime
boolean. Leaf 1 defines, but cannot mint, an opaque `CandidatePersistenceContext`
contract. The context is request-scoped, symbol-branded, stateful, and single-use; it
binds one callback nonce, purpose, grant id, normalized email, provider, exact
providerAccountId, and optional expected user/session registry. An adapter payload,
cookie, provider profile, or module-global value can never construct it.

`lib/auth/candidate-persistence-context.ts` owns a private `AsyncLocalStorage` and an
outer `runCandidatePersistenceRequestScope()` wrapper. The wrapper creates only an
opaque request cell in state `EMPTY`; it cannot mint authorization and its cell is
never returned to a request, callback payload, or downstream module. Leaf 8's bounded
NextAuth route wrapper later invokes this outer scope *before* calling the NextAuth
handler and closes it in `finally`, so NextAuth's `callbacks.signIn` and subsequent
`callbackHandler` adapter calls share one cell despite being separate framework
continuations. Leaf 7's `signIn` extension is the sole code allowed to initialize the
current `EMPTY` cell to a branded `READY` context, and only after its guard and
DB-backed grant checks pass. For a new identity, `createUser` atomically consumes that
exact grant and creates the
minimal User, minimal Account, and proof, then advances the in-memory state
`READY→CREATED`; the following exact `linkAccount` call may only acknowledge those
already-created ids and advances `CREATED→ACKNOWLEDGED` without a second write. An
explicit existing-user link is one atomic `READY→ACKNOWLEDGED` link transaction.
Every callback `finally` closes the scope and marks the object spent, while durable
grant consumption prevents replay after a crash. Missing, closed, wrong-purpose,
cross-request, reused, or mismatched contexts fail before persistence. Leaf 1 tests the
empty/ready/closed state machine without a way to produce a valid Leaf 7 brand. Leaf 7
integration tests execute the real NextAuth `signIn→callbackHandler→createUser→linkAccount`
order through the outer route wrapper, interleave two callbacks at barriers, and prove
their contexts, grants, provider IDs, users, and acknowledgements cannot cross. The
call flows first through Leaf 1's outer token-zero wrapper, so the Leaf 7 hook receives
only the minimal payload and cannot observe or persist provider token/media keys.

`lib/auth/downstream/contract.ts` freezes named, typed hooks for durable user-authentication
state, media/session-output reduction, password admission, OAuth start/identity
admission, authoritative JWT/session resolution, auth mutation, and candidate
signup/link policy. `lib/auth/config.ts` calls those hooks in a fixed order but never
imports a later leaf implementation directly. The default Leaf 2 slot is a no-op
`assertDurableAuthState({ userId, surface })` whose input contains only a server-resolved
user id plus a closed `PASSWORD|GOOGLE_EXISTING|JWT|SESSION|PROVISIONING` surface. Leaf 1
wires it after its own identity/password checks and before persistence, session issue, or
protected return on every listed surface. It also omits the Trial/development provider
from the frozen production provider list. Leaf 2 may later replace only that slot with a
current database `authDisabledAt` check; it never edits the call order or core config.
The default Leaf 4 slot returns null ambient media; the default Leaf 8 slot passes only
the pre-Issue-8 behavior already proven by this leaf and exposes no local rate-limit
authority; the default Leaf 7 slot always denies a candidate new/link identity and
therefore preserves closed signup. Leaf 1's authorization-bound
`sanitizeInternalSessionImage` is the mandatory final postcondition after the Leaf 4
slot, so no extension can turn path shape into authorization. Hook return types are branded so a
later slot cannot skip the Leaf 1 exact-account, token-zero adapter, password CAS, or
session-image postcondition. The source-contract test pins call order and proves a
downstream slot cannot replace the adapter, secret, provider, password verifier, or
final session sanitizer.

Protected-artifact ownership is explicit: `auth-runtime-fail-closed` owns
`lib/auth/config.ts`, `lib/auth/downstream/contract.ts`, password modules, adapter
boundary, `lib/auth/candidate-persistence-context.ts`, and `lib/auth/session-image.ts`;
`security-journal-auth-tombstones` owns only `lib/auth/downstream/leaf2.ts` plus its
durable auth-state helper;
`issue-08-auth-abuse` owns only
`lib/auth/downstream/leaf8.ts` plus its `lib/auth/abuse/**` helpers;
`zero-ambient-media-egress` owns only `lib/auth/downstream/leaf4.ts` plus its
Leaf-4 media helper; `invite-signup-gate` owns only `lib/auth/downstream/leaf7.ts` plus
its signup/link helpers. `deploy/security/protected-artifact-owners.json` records each
slot at reserved version 0 with the exact Leaf 1-created baseline hash and future owner
ID. Leaf 1 may create that baseline once in its signed release but cannot later change
it; the reserved owner may first change it only while publishing capability v1. Leaf 13
rejects a missing baseline, owner substitution, version-0 change, downstream fragment
that names a Leaf 1-owned path, or core config/session-image change without a Leaf 1
version bump.

`buildAuthOptions` uses:

```ts
const baseAdapter = PrismaAdapter(prisma) as Adapter;
const guardedCandidateAdapter = closedSignupAdapter(baseAdapter, leaf7AuthHooks);
const adapter = minimalGooglePersistenceAdapter(guardedCandidateAdapter);

secret: runtime.secret,
providers: runtime.googleClientId && runtime.googleClientSecret
  ? [
      GoogleProvider({
        clientId: runtime.googleClientId,
        clientSecret: runtime.googleClientSecret,
        checks: ["pkce", "state"],
      }),
    ]
  : [],
callbacks: {
  async signIn({ account, profile }) {
    if (account?.provider !== "google") return true;
    const guardedIdentity = await leaf8AuthHooks.guardOAuthIdentity({ account, profile });
    const existing = await authorizeExistingGoogleAccount({
      account,
      profile: profile as { email?: string; email_verified?: boolean },
    });
    if (existing) return true;
    if (!(await isGoogleProviderAccountUnclaimed(account))) return false;
    return leaf7AuthHooks.authorizeCandidateGoogle({
      guardedIdentity,
      account,
      profile,
    });
  },
}
```

`buildAuthOptions` consumes only the already-loaded `AuthRuntimeConfig`; it never rereads `process.env.NEXTAUTH_SECRET` or `process.env.GOOGLE_CLIENT_SECRET`. Do not set `allowDangerousEmailAccountLinking`. Existing linked accounts are resolved through `getUserByAccount`; unlinked identities hit callback denial and the adapter backstop prevents `User` or `Account` creation if callback ordering changes.

Ignore Google `profile.image`/`picture` at the callback and adapter boundaries. The JWT
callback deletes any provider `picture` claim. The session callback sets
`session.user.image` only from
`sanitizeInternalSessionImage(databaseValue, authorizedAttachmentIds)` using the current
database value and exact server-authorized attachment-ID set loaded after current
membership/attachment access resolution; all rejected, unproven, or historical
external values become `null`. The helper does not proxy, fetch, preload, or otherwise
dereference the candidate URL.

- [ ] **Step 5: Close password signup route and UI with one stable response**

```ts
// app/api/auth/signup/route.ts
import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { ok: false, code: "SIGNUP_NOT_ALLOWED" },
    {
      status: 403,
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}
```

Pass `isSignupEnabled={false}` to `LoginForm`, omit account-creation controls, and retain password sign-in and already-linked Google sign-in buttons.

- [ ] **Step 6: Run focused GREEN tests**

Run: `pnpm exec vitest run tests/auth/google-existing-account.test.ts tests/auth/minimal-google-account.test.ts tests/auth/google-token-zero-adapter.test.ts tests/auth/session-image.test.ts tests/auth/google-profile-image.test.ts tests/auth/closed-signup-adapter.test.ts tests/auth/candidate-persistence-context.test.ts tests/auth/config.test.ts tests/auth/signup-route.test.ts tests/components/login-form.test.tsx tests/security/closed-oauth-source-contract.test.ts tests/security/google-account-persistence-source-contract.test.ts tests/security/auth-downstream-extension-contract.test.ts`

Expected: PASS; verified but unlinked Google is denied without delegate persistence, token/profile media never persist or escape the session boundary, password signup returns 403, and existing login controls remain.

- [ ] **Step 7: Record the Task 2 wiki delta and commit**

Append:

```md
#### Closed signup covers OAuth

Closed mode allows Google only when the exact provider account identifier already
exists in `Account`. `email_verified` alone cannot create or link a user. A guarded
adapter rejects `createUser` and new `linkAccount` calls, so callback ordering cannot
turn a verified email into signup.
```

Append to `wiki/log.md`:

```md
- 2026-07-12: Closed password and unlinked Google signup at callback and adapter boundaries; evidence: exact-account, zero-persistence, and source-contract tests.
```

Run:

```bash
git add lib/auth/google-existing-account.ts lib/auth/minimal-google-account.ts lib/auth/closed-signup-adapter.ts lib/auth/candidate-persistence-context.ts lib/auth/session-image.ts lib/auth/downstream/contract.ts lib/auth/downstream/leaf2.ts lib/auth/downstream/leaf4.ts lib/auth/downstream/leaf8.ts lib/auth/downstream/leaf7.ts lib/auth/config.ts app/api/auth/signup/route.ts app/login/login-form.tsx tests/auth/google-existing-account.test.ts tests/auth/minimal-google-account.test.ts tests/auth/google-token-zero-adapter.test.ts tests/auth/session-image.test.ts tests/auth/google-profile-image.test.ts tests/auth/closed-signup-adapter.test.ts tests/auth/candidate-persistence-context.test.ts tests/auth/config.test.ts tests/auth/signup-route.test.ts tests/components/login-form.test.tsx tests/security/closed-oauth-source-contract.test.ts tests/security/google-account-persistence-source-contract.test.ts tests/security/auth-downstream-extension-contract.test.ts wiki/Auth\ And\ Permissions\ Workflow.md wiki/log.md
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "fix(auth): close unlinked OAuth signup"
```

Expected: all gates PASS and the commit contains implementation, tests, and durable wiki evidence.

### Task 2A: Version, bound, and atomically upgrade password hashes

**Files:**
- Modify: `lib/auth/passwords.ts`
- Create: `lib/auth/password-work-limit.ts`
- Create: `lib/auth/password-credentials.ts`
- Modify: `lib/auth/config.ts`
- Modify: `lib/auth/provisioning.ts`
- Modify: `prisma/seed.ts`
- Modify: `tests/auth/passwords.test.ts`
- Create: `tests/auth/password-work-limit.test.ts`
- Create: `tests/auth/password-credentials.test.ts`
- Create: `tests/auth/password-rehash-race.test.ts`
- Modify: `tests/auth/config.test.ts`
- Create: `tests/security/password-hash-source-contract.test.ts`
- Modify: `wiki/Auth And Permissions Workflow.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`

**Interfaces:**
- `parsePasswordHash()` accepts only one current envelope or one exact legacy envelope and never executes caller-stored work factors.
- `hashPassword()` emits only current v1. `verifyPasswordHash()` performs one fixed scrypt and one equal-length constant-time comparison for every syntactically valid credential attempt.
- `authorizePasswordCredential()` uses a process-random valid dummy envelope for an unknown, passwordless, or malformed-hash account and compare-and-swap upgrades a verified legacy value before returning a user.
- `withPasswordWorkPermit()` is a resource guard with fixed production limits of two active calls, eight queued calls, and a two-second queue deadline. It is not rate-limit authority.

- [ ] **Step 1: Write failing canonical-format, dummy-work, race, and saturation tests**

Pin the exact current envelope and field order:

```text
munjib-scrypt$v=1$N=16384$r=8$p=1$dk=64$se=b64url-ascii$<22-character-salt>$<86-character-key>
```

The implementation explicitly passes `N=16384`, `r=8`, `p=1`, `keylen=64`, and
`maxmem=64 MiB`. The canonical base64url salt token's UTF-8 bytes are the scrypt salt,
matching the legacy implementation. A cost or salt-semantics change requires a new
reviewed version; a stored row cannot select parameters.

Tests require:

- password input is a string of 1–256 UTF-8 bytes, used byte-for-byte without trim or normalization;
- a stored envelope is ASCII and at most 256 bytes;
- v1 rejects reordered/duplicate/unknown fields, leading-zero integers, wrong fixed values, padding, non-base64url characters, wrong decoded lengths, whitespace, Unicode, extra delimiters, and trailing bytes before scrypt;
- legacy accepts only exact `scrypt:<canonical-22-character-salt>:<canonical-86-character-key>` and known-answer vectors preserve its UTF-8 salt-token semantics;
- current, legacy, wrong-password, unknown, passwordless, and malformed-hash valid-shape attempts each invoke exactly one injected scrypt and one equal-length compare; invalid input shape may reject before lookup/work;
- no more than two scrypt calls run concurrently, no more than eight wait, timed-out/failed calls release permits, and saturation creates no session or sensitive log;
- current success performs no rewrite; verified legacy success conditionally rewrites the exact old bytes to v1 before returning; wrong password never writes;
- forced database failure or compare-and-swap count zero returns no user/session; two concurrent legacy successes yield one CAS winner and at most one session, so an intervening password change is never accepted;
- seed and one-shot provisioning write v1, while the public signup route remains `403 SIGNUP_NOT_ALLOWED`.

- [ ] **Step 2: Run RED**

```bash
pnpm exec vitest run tests/auth/passwords.test.ts tests/auth/password-work-limit.test.ts tests/auth/password-credentials.test.ts tests/auth/password-rehash-race.test.ts tests/auth/config.test.ts tests/security/password-hash-source-contract.test.ts --reporter=dot
```

Expected: FAIL because hashes have implicit parameters, unknown accounts return before
dummy work, work is unbounded, and legacy success is not upgraded atomically.

- [ ] **Step 3: Implement the bounded parser, dummy record, and resource guard**

Decode and re-encode every base64url field to prove canonical form before using it.
Generate one process-random syntactically valid v1 dummy record at startup. Select a
validated real or dummy record without placing account state in the public result, then
run the same fixed scrypt under the bounded work permit. Stable integrity/saturation
alerts contain only deployment, fixed cause code, and correlation ID; never account,
email, password, hash, salt, path, duration sample, or queue contents.

- [ ] **Step 4: Compare-and-swap the verified legacy envelope before session issuance**

After the one legacy scrypt succeeds, wrap the already-verified salt/key in the exact
v1 envelope and execute a conditional update on both user ID and the exact legacy
`passwordHash`. Require one updated row before `authorize()` returns the user. Reusing
the verified material keeps exactly one scrypt per attempt. A zero-row race fails this
attempt instead of rereading and trusting an unrelated replacement hash.

- [ ] **Step 5: Run GREEN, document the durable contract, and commit**

```bash
pnpm exec vitest run tests/auth/passwords.test.ts tests/auth/password-work-limit.test.ts tests/auth/password-credentials.test.ts tests/auth/password-rehash-race.test.ts tests/auth/config.test.ts tests/security/password-hash-source-contract.test.ts --reporter=dot
pnpm exec tsc --noEmit --pretty false
git add lib/auth/passwords.ts lib/auth/password-work-limit.ts lib/auth/password-credentials.ts lib/auth/config.ts lib/auth/provisioning.ts prisma/seed.ts tests/auth/passwords.test.ts tests/auth/password-work-limit.test.ts tests/auth/password-credentials.test.ts tests/auth/password-rehash-race.test.ts tests/auth/config.test.ts tests/security/password-hash-source-contract.test.ts wiki/Auth\ And\ Permissions\ Workflow.md wiki/log.md
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "fix(auth): version and bound password verification"
```

Expected: current and legacy logins obey one bounded work path, legacy conversion is
atomic before session issuance, signup remains closed, and no MFA/reset feature exists.

### Task 3: Fail startup and operator preflight with the runtime validator

**Files:**
- Modify: `instrumentation.ts`
- Create: `scripts/security/auth-preflight.ts`
- Create: `tests/security/auth-preflight.test.ts`
- Modify: `package.json`
- Modify: `wiki/Local Development Workflow.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`

**Interfaces:**
- Consumes: `assertValidAuthRuntimeEnv(process.env)` and the same strict secret-file reader as Task 1.
- Produces: `register()` startup failure, `runAuthPreflight({env,write})`, and `pnpm security:auth-preflight`.

- [ ] **Step 1: Write failing startup/preflight tests**

```ts
// tests/security/auth-preflight.test.ts
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { runAuthPreflight } from "@/scripts/security/auth-preflight";

const syntheticGeneratedSecret = () => randomBytes(32).toString("base64url");

describe("auth preflight", () => {
  it("writes only redacted state", () => {
    const lines: string[] = [];
    runAuthPreflight({
      env: {
        MUNJIB_DEPLOYMENT_ENV: "production",
        NEXTAUTH_SECRET_FILE: "/run/secrets/munjib_nextauth_secret",
        NEXTAUTH_URL: "https://munjib.example",
        NEXTAUTH_COOKIE_SECURE: "true",
        MUNJIB_ENABLE_DEV_LOGIN: "false",
      },
      deps: {
        readStrictSecretFile: () => syntheticGeneratedSecret(),
      },
      write: (line) => lines.push(line),
    });
    expect(lines).toEqual([
      "AUTH_PREFLIGHT_OK deployment=production secureCookies=true developmentLogin=false passwordSignup=false oauthSignup=false",
    ]);
  });
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm exec vitest run tests/security/auth-preflight.test.ts`

Expected: FAIL because the command does not exist.

- [ ] **Step 3: Implement startup and preflight**

```ts
// instrumentation.ts
import { assertValidAuthRuntimeEnv } from "@/lib/auth/runtime";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    assertValidAuthRuntimeEnv(process.env);
  }
}
```

```ts
// scripts/security/auth-preflight.ts
import { pathToFileURL } from "node:url";
import { assertValidAuthRuntimeEnv } from "../../lib/auth/runtime";

export function runAuthPreflight(input: {
  env: Record<string, string | undefined>;
  deps?: Parameters<typeof assertValidAuthRuntimeEnv>[1];
  write(line: string): void;
}) {
  const config = assertValidAuthRuntimeEnv(input.env, input.deps);
  input.write(
    `AUTH_PREFLIGHT_OK deployment=${config.deploymentEnvironment} secureCookies=${config.secureCookies} developmentLogin=${config.developmentLoginEnabled} passwordSignup=${config.passwordSignupEnabled} oauthSignup=${config.oauthSignupEnabled}`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    runAuthPreflight({ env: process.env, write: (line) => console.log(line) });
  } catch (error) {
    console.error(error instanceof Error ? error.message : "AUTH_PREFLIGHT_FAILED");
    process.exitCode = 1;
  }
}
```

Add `"security:auth-preflight": "tsx scripts/security/auth-preflight.ts"`.

- [ ] **Step 4: Run GREEN and a quiet secret scan**

Run:

```bash
pnpm exec vitest run tests/security/auth-preflight.test.ts tests/auth/runtime.test.ts
if rg -q '(NEXTAUTH_SECRET|GOOGLE_CLIENT_SECRET)=.+' tests/security/auth-preflight.test.ts scripts/security/auth-preflight.ts; then exit 1; fi
```

Expected: tests PASS and the conditional exits `0` without printing matches.

- [ ] **Step 5: Record the Task 3 wiki delta and commit**

Add exact startup/preflight commands to `wiki/Local Development Workflow.md`, append:

```md
- 2026-07-12: Made Node startup and `security:auth-preflight` consume the same redacted auth runtime validator.
```

Run:

```bash
git add instrumentation.ts scripts/security/auth-preflight.ts tests/security/auth-preflight.test.ts package.json wiki/Local\ Development\ Workflow.md wiki/log.md
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "feat(security): fail auth startup closed"
```

Expected: PASS and one commit.

### Task 4: Separate production seed from one-shot owner bootstrap

**Files:**
- Create: `lib/security/production-seed-guard.ts`
- Modify: `prisma/seed.ts`
- Create: `scripts/security/bootstrap-owner.ts`
- Create: `tests/security/production-seed-guard.test.ts`
- Create: `tests/security/bootstrap-owner.test.ts`
- Modify: `package.json`
- Modify: `wiki/Local Development Workflow.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`

**Interfaces:**
- Produces: `assertProductionSeedForbidden(env)`, root/operator-file-gated `runBootstrapOwner`, and `pnpm security:bootstrap-owner`.

- [ ] **Step 1: Write failing seed/bootstrap tests**

```ts
// tests/security/production-seed-guard.test.ts
import { describe, expect, it } from "vitest";
import { assertProductionSeedForbidden } from "@/lib/security/production-seed-guard";

describe("production seed guard", () => {
  it("rejects staging and production", () => {
    expect(() =>
      assertProductionSeedForbidden({ MUNJIB_DEPLOYMENT_ENV: "production" }),
    ).toThrow("PRODUCTION_SEED_FORBIDDEN");
    expect(() =>
      assertProductionSeedForbidden({ MUNJIB_DEPLOYMENT_ENV: "staging" }),
    ).toThrow("PRODUCTION_SEED_FORBIDDEN");
  });
});
```

The bootstrap test supplies an immutable input buffer, root UID, explicit one-shot flag, and mocked transaction; it asserts one owner user, organization, owner organization membership, workspace, and owner workspace membership, with no Trial/global loop.

- [ ] **Step 2: Run RED**

Run: `pnpm exec vitest run tests/security/production-seed-guard.test.ts tests/security/bootstrap-owner.test.ts`

Expected: FAIL because guard and bootstrap are missing.

- [ ] **Step 3: Implement the seed guard**

```ts
// lib/security/production-seed-guard.ts
export function assertProductionSeedForbidden(
  env: Record<string, string | undefined>,
) {
  if (env.MUNJIB_DEPLOYMENT_ENV !== "development") {
    throw new Error("PRODUCTION_SEED_FORBIDDEN");
  }
}
```

Call it before Prisma construction in `prisma/seed.ts`.

- [ ] **Step 4: Implement the one-shot bootstrap**

`runBootstrapOwner` requires:

- UID `0`
- `MUNJIB_OWNER_BOOTSTRAP_ENABLED=true`
- `MUNJIB_OWNER_BOOTSTRAP_INPUT_FILE`
- `O_NOFOLLOW` open, regular-file `fstat`, owner root, mode no broader than `0600`, maximum 4096 bytes, same-FD bounded read
- one transaction using immutable IDs after lookup
- unlink only after commit
- stable output `OWNER_BOOTSTRAP_OK`

The input contains email, display name, organization name/slug, workspace name/slug, and a generated password hash supplied through the protected file. The command accepts only the canonical current scrypt v1 envelope from Task 2A; legacy, unknown-version, malformed, or non-canonical input fails before a database write. Existing database legacy rows migrate only after successful password verification and compare-and-swap. Seed and bootstrap never create or preserve a legacy value when writing a missing hash. No value is printed.

- [ ] **Step 5: Run GREEN**

Run:

```bash
pnpm exec vitest run tests/security/production-seed-guard.test.ts tests/security/bootstrap-owner.test.ts
MUNJIB_DEPLOYMENT_ENV=production pnpm run db:seed
```

Expected: tests PASS; seed exits nonzero with `PRODUCTION_SEED_FORBIDDEN` before mutation.

- [ ] **Step 6: Record the Task 4 wiki delta, run every gate, and commit**

Document the protected one-shot input contract and production seed prohibition in `wiki/Local Development Workflow.md`; append a dated evidence line citing the guard/bootstrap tests to `wiki/log.md`.

Run:

```bash
git add lib/security/production-seed-guard.ts scripts/security/bootstrap-owner.ts prisma/seed.ts package.json tests/security/production-seed-guard.test.ts tests/security/bootstrap-owner.test.ts wiki/Local\ Development\ Workflow.md wiki/log.md
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "fix(security): separate owner bootstrap from seed"
```

Expected: hook installation, staged sync plan, manifest, lint, staged sync check, and commit PASS.

### Task 5: Enforce production Compose and deployment preflight

**Files:**
- Modify: `docker-compose.yml`
- Create: `docker-compose.google.yml`
- Modify: `docker-compose.dev.yml`
- Modify: `.env.example`
- Modify: `.env.docker.example`
- Modify: `.github/workflows/ci-cd.yml`
- Modify: `tests/docker/compose.test.ts`
- Modify: `tests/github-actions/ci-cd.test.ts`
- Modify: `wiki/CI CD And Monitoring Workflow.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`

**Interfaces:**
- Consumes: root-managed files at fixed `/etc/munjib/secrets` paths and `pnpm security:auth-preflight`.
- Produces: production Compose secret mounts, literal in-container `*_SECRET_FILE` paths, Leaf 13 loopback-only Web binding, standalone development fixtures, and deploy ordering `secret install → auth preflight → migration → Web`.

- [ ] **Step 1: Write failing Compose/workflow tests**

```ts
test("production mounts secrets without value interpolation or env exposure", () => {
  expect(compose).toContain("NEXTAUTH_SECRET_FILE: /run/secrets/munjib_nextauth_secret");
  expect(compose).toContain("file: /etc/munjib/secrets/nextauth-current");
  expect(compose).not.toMatch(/^\s+NEXTAUTH_SECRET:/m);
  expect(compose).not.toMatch(/^\s+GOOGLE_CLIENT_SECRET:/m);
  expect(compose).not.toMatch(/\${d}{[^}]*SECRET/);
  expect(compose).toContain('127.0.0.1:${WEB_PORT:-3000}:3000');
});

test("deploy runs auth preflight before migration", () => {
  expect(runCommands.indexOf("pnpm security:auth-preflight")).toBeGreaterThan(-1);
  expect(runCommands.indexOf("pnpm security:auth-preflight")).toBeLessThan(
    runCommands.indexOf("pnpm exec prisma migrate deploy"),
  );
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm exec vitest run tests/docker/compose.test.ts tests/github-actions/ci-cd.test.ts`

Expected: FAIL on secret environment interpolation, missing secret mounts, non-loopback Web publication, or missing deploy preflight.

- [ ] **Step 3: Implement production/development separation**

Production entries use fixed host sources and literal container paths; secret bytes are never interpolated:

```yaml
services:
  web:
    environment:
      MUNJIB_DEPLOYMENT_ENV: production
      NEXTAUTH_SECRET_FILE: /run/secrets/munjib_nextauth_secret
      NEXTAUTH_COOKIE_SECURE: "true"
      MUNJIB_ENABLE_DEV_LOGIN: "false"
    secrets:
      - source: munjib_nextauth_secret
        target: munjib_nextauth_secret
    ports:
      - "127.0.0.1:${WEB_PORT:-3000}:3000"
secrets:
  munjib_nextauth_secret:
    file: /etc/munjib/secrets/nextauth-current
```

The base file is the exact Google-disabled contract. Create the only allowed Google
overlay `docker-compose.google.yml`:

```yaml
services:
  web:
    environment:
      GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID:?google client id required}
      GOOGLE_CLIENT_SECRET_FILE: /run/secrets/munjib_google_client_secret
    secrets:
      - source: munjib_google_client_secret
        target: munjib_google_client_secret
  auth-preflight:
    environment:
      GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID:?google client id required}
      GOOGLE_CLIENT_SECRET_FILE: /run/secrets/munjib_google_client_secret
    secrets:
      - source: munjib_google_client_secret
        target: munjib_google_client_secret
secrets:
  munjib_google_client_secret:
    file: /etc/munjib/secrets/google-client-current
```

Define `services.auth-preflight` from the same image as Web with
`profiles: ["auth-preflight"]`, `network_mode: "none"`, the exact strict auth
environment and service secret targets above, no DB/attachment/provider-network
mount, and command `pnpm security:auth-preflight`. Compose/workflow tests require
`docker compose --profile auth-preflight run --rm --no-deps auth-preflight` before any
migration command and removal afterward.

Deployment selects either the base files alone (Google disabled) or the base plus this
one repository overlay (Google enabled); no generated/arbitrary overlay is accepted.
Tests render both exact combinations, require the overlay for Google IDs, and prove the
base never references a missing Google file. The development override may use direct
`NEXTAUTH_SECRET`/`GOOGLE_CLIENT_SECRET` values and never participates in the
production workflow. Production `.env` files contain no secret values.

- [ ] **Step 4: Add deploy preflight before migration**

The remote workflow installs each secret from the protected deployment channel directly into a temporary root-only descriptor and atomically renames it under `/etc/munjib/secrets`; it never writes bytes through argv, shell tracing, GitHub output, Compose interpolation, or a checked-in env file. It sets the owner to the pinned non-root container runtime UID, mode `0400`, and verifies parent/file invariants with the same strict reader. A dedicated ephemeral `auth-preflight` Compose service receives the same auth secret targets and strict runtime variables as Web but no DB credential, runs only `pnpm security:auth-preflight`, and is removed before migration/index setup and Web replacement. Leaf 13 preserves this service in its single-image Compose layout and adds the exact entrypoint discriminator. A failure stops deployment before migration or current-container replacement.

Leaf 13's `127.0.0.1` host binding is the primary network boundary. File-backed auth is defense in depth and never authorizes a wildcard/public Web port.

- [ ] **Step 5: Run GREEN**

Run:

```bash
pnpm exec vitest run tests/docker/compose.test.ts tests/github-actions/ci-cd.test.ts
env -u NEXTAUTH_SECRET -u GOOGLE_CLIENT_SECRET docker compose -f docker-compose.yml config --quiet
if docker compose -f docker-compose.yml config | rg -q '(NEXTAUTH_SECRET|GOOGLE_CLIENT_SECRET):[[:space:]]+[^/]'; then exit 1; fi
```

Expected: tests and config validation PASS; the quiet conditional exits 0, and config output contains only fixed secret-file paths/names, never secret values.

- [ ] **Step 6: Record the Task 5 wiki delta, run every gate, and commit**

Add the fixed host/container secret paths, runtime-UID/mode contract, loopback binding, non-printing install/preflight order, and development-only env exception to `wiki/CI CD And Monitoring Workflow.md`; append the Compose/workflow evidence line to `wiki/log.md`.

Run:

```bash
git add docker-compose.yml docker-compose.google.yml docker-compose.dev.yml .env.example .env.docker.example .github/workflows/ci-cd.yml tests/docker/compose.test.ts tests/github-actions/ci-cd.test.ts wiki/CI\ CD\ And\ Monitoring\ Workflow.md wiki/log.md
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "fix(deploy): require auth preflight"
```

Expected: every verification and wiki gate PASS.

### Task 6: Prove closed password and unlinked-OAuth behavior in a production-like browser

**Files:**
- Create: `playwright.auth-runtime.config.ts`
- Create: `scripts/security/run-auth-runtime-e2e.ts`
- Create: `tests/e2e/auth-runtime.spec.ts`
- Create: `tests/security/auth-runtime-smoke.test.ts`
- Create: `tests/wiki/auth-runtime-docs.test.ts`
- Modify: `wiki/Auth And Permissions Workflow.md`
- Modify: `wiki/Local Development Workflow.md`
- Modify: `wiki/CI CD And Monitoring Workflow.md`
- Modify: `wiki/index.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`

**Interfaces:**
- Produces: production-like browser oracle for provider discovery, closed signup, bounded current/legacy password login, exact linked Google policy, token/profile-media zero persistence, Secure cookie configuration, and canonical origin.

- [ ] **Step 1: Write failing smoke and documentation contracts**

The smoke test builds auth options with an injected generated development fixture and asserts:

- no development provider
- password provider remains
- signup route is closed
- adapter `createUser` and new Google `linkAccount` throw
- exact linked account callback returns true
- unlinked verified Google callback returns false
- token-bearing Google callback data causes no Account/User update
- provider `image`/`picture`, JWT picture, and a historical external `User.image` all produce `session.user.image=null`
- current scrypt v1 login succeeds, one synthetic legacy login converts before a session appears, and a forced compare-and-swap loss creates no session

The wiki test asserts both `password signup closed` and `unlinked OAuth closed`.

- [ ] **Step 2: Run RED**

Run: `pnpm exec vitest run tests/security/auth-runtime-smoke.test.ts tests/wiki/auth-runtime-docs.test.ts`

Expected: docs contract FAIL until final durable sections are written.

- [ ] **Step 3: Add the browser test**

`tests/e2e/auth-runtime.spec.ts`:

1. GET provider discovery and assert no development provider.
2. POST password signup and assert `403 SIGNUP_NOT_ALLOWED`.
3. Invoke a test-only in-process callback harness with a synthetic verified unlinked Google subject.
4. Count matching `User` and `Account` before and after; both remain zero.
5. Seed an exact linked Account and assert the same callback policy succeeds.
6. Supply synthetic token fields plus a remote provider image and assert zero token/User.image write and no remote URL in HTML, session JSON, DOM attributes, preloads, or requests.
7. Seed a historical external `User.image`; assert it remains in the database but is emitted as `null`. Verify one exact internal attachment URL control is the only accepted image value.
8. Exercise current v1 password login, legacy compare-and-swap-before-cookie, and a forced compare-and-swap loss with no session.
9. Assert callback origin is the configured origin and session cookie options are Secure.

The test never contacts Google and uses synthetic `example.test` identities.

- [ ] **Step 4: Run production-like GREEN**

`run-auth-runtime-e2e.ts` creates a `0700` temporary directory, writes a generated synthetic signing secret to a `0400` file owned by the current user, passes only its path as `NEXTAUTH_SECRET_FILE` to child processes, disables shell tracing, inherits no direct secret env, and removes the file/directory in `finally`. It never prints the path or value.

Run:

```bash
pnpm exec tsx scripts/security/run-auth-runtime-e2e.ts
pnpm exec vitest run tests/security/auth-runtime-smoke.test.ts tests/wiki/auth-runtime-docs.test.ts
```

Expected: build and tests PASS; unlinked OAuth produces zero rows, OAuth token/profile media produces zero persistence or egress, and legacy password conversion precedes session issuance.

- [ ] **Step 5: Complete the durable wiki delta, run every gate, and commit**

Write:

```md
Production signup invariant: password account creation and unlinked OAuth are both
closed. Google `email_verified` is checked, then the exact provider account must
already exist. Callback denial plus the adapter persistence guard produce zero new
User/Account rows. Google credentials and profile media are never persisted; only a
canonical internal attachment URL whose exact ID is server-authorized for the current
user/request may appear in a session. Password verification uses
one bounded, parameter-pinned scrypt path and upgrades the exact legacy envelope before
session issuance.
```

Update index navigation and log evidence. Run:

```bash
git add playwright.auth-runtime.config.ts scripts/security/run-auth-runtime-e2e.ts tests/e2e/auth-runtime.spec.ts tests/security/auth-runtime-smoke.test.ts tests/wiki/auth-runtime-docs.test.ts wiki/Auth\ And\ Permissions\ Workflow.md wiki/Local\ Development\ Workflow.md wiki/CI\ CD\ And\ Monitoring\ Workflow.md wiki/index.md wiki/log.md
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "test(auth): prove closed OAuth signup"
```

Expected: browser, docs, wiki gates, and commit PASS.

### Task 7: Execute the Leaf 1 rollout and hand off immutable closed-signup contracts

**Files:**
- Create: `tests/security/auth-runtime-handoff.test.ts`
- Create: `deploy/security/capabilities/auth-runtime-fail-closed.json`
- Modify: `deploy/security/protected-artifact-owners.json`
- Create: `tests/security/auth-runtime-capability.test.ts`
- Modify: `wiki/Auth And Permissions Workflow.md`
- Modify: `wiki/CI CD And Monitoring Workflow.md`
- Modify: `wiki/index.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`

**Interfaces:**
- Consumes: all Task 1–6 runtime, callback, adapter, preflight, seed, Compose, and browser oracles.
- Produces: canonical `auth-runtime-fail-closed` v1 protected-artifact fragment, machine-checked Leaf 2/7/13 handoff invariants, rollout/rollback evidence checklist, and completed PR review workflow.

- [ ] **Step 1: Write the failing handoff test**

```ts
// tests/security/auth-runtime-handoff.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Leaf 1 handoff", () => {
  it("pins closed password and unlinked OAuth invariants for later leaves", () => {
    const handoff = [
      "wiki/Auth And Permissions Workflow.md",
      "wiki/CI CD And Monitoring Workflow.md",
    ].map((path) => readFileSync(path, "utf8")).join("\n");
    expect(handoff).toContain("exact linked Google Account");
    expect(handoff).toContain("zero User or Account creation");
    expect(handoff).toContain("AUTH_OAUTH_ACCOUNT_REVOKED");
    expect(handoff).toContain("canonical scrypt v1");
    expect(handoff).toContain("external profile image");
    expect(handoff).toContain("Leaf 2");
    expect(handoff).toContain("Leaf 13");
  });
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm exec vitest run tests/security/auth-runtime-handoff.test.ts tests/security/auth-runtime-capability.test.ts`

Expected: FAIL until the handoff is explicit.

- [ ] **Step 3: Write exact handoff and rollback contracts**

Add only to the public-safe wiki and rollout-contract fixture; the restricted design
remains local-only and is never read, modified, or staged on a leaf branch:

- Leaf 2 starts only after Leaf 1 deployment evidence.
- Leaf 2 changes only the reserved `lib/auth/downstream/leaf2.ts` baseline from version 0
  to `security-journal-auth-tombstones@1`; Leaf 1 config, contract, password, adapter,
  candidate-context, and session-image paths remain byte-identical.
- Leaf 7 may replace closed OAuth only through its guarded invitation/link contract and the Leaf 1 minimal Account/session-image helpers.
- Leaf 13 must preserve loopback-only Web binding, strict file-backed generated secrets, exact-image, and closed-signup preflight.
- Leaf 8 must preserve the canonical password parser, dummy work, compare-and-swap-before-session rule, and local resource guard while adding PostgreSQL admission authority.
- Google start/callback containment remains at the edge after Leaf 1. After the verified recovery gate and JOURNAL_READY exist, a bounded transaction locks each legacy token-bearing Google Account, appends the existing `AUTH_OAUTH_ACCOUNT_REVOKED` event with subject type `OAUTH_ACCOUNT` and exact Account ID, and revokes/removes that Account in the same transaction. Journal failure rolls back revocation; replay is deny-only and idempotent. Only a fresh boolean proof that no token-bearing Google row remains permits containment removal. Evidence contains no row count, Account/user ID, provider payload, or token, and the canonical twenty-six-kind journal union does not change.
- Rollback retains the current root-managed signing/provider secret files and their owner/mode/mount contract, closed password signup, closed unlinked OAuth, Secure cookies, canonical origin, disabled development login, production seed prohibition, token/profile-media zero persistence, and v1 password-hash readability.
- No rollback image may rely only on `email_verified`.
- Once any canonical v1 password row exists, an image unable to parse it is rollback-ineligible.
- The only committed Leaf 1 capability fragment is `deploy/security/capabilities/auth-runtime-fail-closed.json`. It fixes stable id/version, exact protected auth/password/session-image artifacts, required upstream capability versions, and evidence-test codes; generated exact-candidate envelopes remain untracked and are published only through Leaf 13A's dispatcher.
- In the same signed release, the protected-artifact owner map records the four downstream slot baselines with exact hashes and reserved owners `security-journal-auth-tombstones`, `zero-ambient-media-egress`, `issue-08-auth-abuse`, and `invite-signup-gate`. Capability tests prove Leaf 1 core paths cannot be named by those fragments and a slot cannot change at reserved version 0.

Its exact initial fragment is:

```json
{"format":"munjib-security-capability-v1","id":"auth-runtime-fail-closed","version":1,"leaf":1,"requires":["secure-next-runtime@1"],"evidenceTests":["tests/auth/google-existing-account.test.ts","tests/auth/google-token-zero-adapter.test.ts","tests/auth/candidate-persistence-context.test.ts","tests/auth/password-credentials.test.ts","tests/auth/password-work-limit.test.ts","tests/auth/password-rehash-race.test.ts","tests/auth/session-image.test.ts","tests/security/auth-downstream-extension-contract.test.ts","tests/e2e/auth-runtime.spec.ts","tests/security/auth-runtime-capability.test.ts"]}
```

- [ ] **Step 4: Run full verification and a non-printing secret scan**

Run:

```bash
pnpm test
pnpm exec tsc --noEmit
pnpm exec tsx scripts/security/run-auth-runtime-e2e.ts --build-only --origin https://staging.munjib.example
if rg -q '(obsidian-clone-development-secret|local-development-only)' lib app docker-compose.yml .github/workflows; then exit 1; fi
if rg -q '^[[:space:]]+(NEXTAUTH_SECRET|GOOGLE_CLIENT_SECRET):' docker-compose.yml; then exit 1; fi
```

Expected: tests/typecheck/build PASS; secret conditional exits `0` with no matching output.

- [ ] **Step 5: Commit the handoff through every staged wiki gate**

Run:

```bash
git add tests/security/auth-runtime-handoff.test.ts tests/security/auth-runtime-capability.test.ts deploy/security/capabilities/auth-runtime-fail-closed.json deploy/security/protected-artifact-owners.json wiki/Auth\ And\ Permissions\ Workflow.md wiki/CI\ CD\ And\ Monitoring\ Workflow.md wiki/index.md wiki/log.md
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "docs(security): hand off closed auth runtime"
```

Expected: all gates PASS.

- [ ] **Step 6: Push, open the PR, and poll review/CI**

```bash
git push -u origin HEAD
gh pr create --draft --title "security: fail-close production auth runtime" --body "Implements the reviewed Leaf 1 plan with strict file-backed signing/provider secrets, closed password and unlinked OAuth signup, startup/deploy preflight, seed separation, browser evidence, and rollback contracts."
gh pr ready
```

Poll six times with waits no longer than 50 seconds, using repository and PR values read from GitHub CLI:

```bash
repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
owner=$(printf '%s' "$repo" | cut -d/ -f1)
name=$(printf '%s' "$repo" | cut -d/ -f2-)
number=$(gh pr view --json number --jq .number)
for attempt in 1 2 3 4 5 6; do
  gh pr checks
  gh pr view --json reviewDecision,reviews,statusCheckRollup
  gh api graphql -f owner="$owner" -f name="$name" -F number="$number" -f query='query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:100){nodes{isResolved comments(first:20){nodes{author{login}path line body}}}}}}}' --jq '.data.repository.pullRequest.reviewThreads.nodes | map(select(.isResolved == false))'
  sleep 50
done
```

Expected: after at least five minutes, required checks pass and every returned review-thread array is empty. Fix actionable review or failing checks on the same branch, rerun affected verification and the exact staged wiki gates, commit, push, and repeat the polling plus GraphQL query.

- [ ] **Step 7: Deploy and verify Leaf 1 before downstream work**

Deploy the reviewed exact digest. Expected redacted evidence:

- startup and auth preflight healthy
- strict NEXTAUTH/Google secret-file owner/mode/no-follow/content contract passes
- Compose config and docker inspect expose paths/names only, never secret values
- no development provider
- password signup 403
- verified unlinked Google denied with zero User/Account rows
- public Google start/callback remains edge-contained; an off-traffic token-free exact-link oracle succeeds while a token-bearing row cannot authenticate
- existing password and canonical-v1 login succeed; legacy conversion finishes before its session cookie
- Google token/profile media produces zero persistence and historical external `User.image` produces null session media
- Secure session cookie
- canonical provider URLs
- production seed forbidden

Record only pass/fail and stable codes in GitHub-visible evidence. Leaf 2 may start after this deployment evidence is accepted. Public Google containment is removed only by the later recovery/JOURNAL_READY plus `AUTH_OAUTH_ACCOUNT_REVOKED` cleanup gate, never by Leaf 1 evidence alone.
