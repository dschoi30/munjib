# Security-Critical Next.js Runtime Upgrade Implementation Plan

**Tracking:** Issue #157 · remote branch `issue-157-security-nextjs-upgrade`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade Munjib from Next.js 15.5.15 to a currently advisory-clean Next.js 15 patch (15.5.18 was the planning candidate), prove the exact release candidate has no applicable GitHub advisory, and preserve auth, RSC navigation, build, and container behavior.

**Architecture:** Keep the application on Next.js 15 and React 19, pin `next` and `eslint-config-next` to the same exact secure patch, and add a repository contract test that rejects a vulnerable or drifting runtime. Validate the source build and both Docker targets, then exercise auth and App Router/RSC navigation through a production server before Issue 12 is allowed to build its edge policy on this runtime.

**Tech Stack:** Next.js 15 App Router, React 19, pnpm 10.28.1, Vitest, Playwright, Docker, Prisma/PostgreSQL, GitHub advisory API.

## Global Constraints

- `15.5.18` is the currently reviewed planning candidate, not permanent proof. Query every GitHub global advisory affecting the exact candidate immediately before editing, before PR readiness, before merge, and before production delivery. The candidate is eligible only when that complete query returns zero applicable advisories and `pnpm audit --prod` passes.
- GHSA-c4j6-fc7j-m34r, GHSA-8h8q-6873-q5fj, and GHSA-26hh-7cqf-hhc6 remain named regression fixtures, but the gate is never limited to those three ids.
- Stay on the Next.js 15 release line and React 19; a Next.js 16 migration is outside this leaf issue.
- Pin `next` and `eslint-config-next` to one identical exact version; do not use `^`, `~`, `latest`, or a prerelease.
- If the candidate is affected, choose the smallest supported Next.js 15 patch that has zero applicable advisories at the exact-version query, then replace every `15.5.18` planning literal before continuing. Never infer safety only from one advisory's first patched version.
- Leaf 13A must be merged and installed before this leaf's production delivery. Delivery uses the 13A signed envelope and never a mutable host checkout.
- Issue 3 must merge and pass production smoke checks before Issue 12 (`security-edge-bindings`) can merge.
- Leaf 3 owns capability `secure-next-runtime`. Its protected selectors include the `next-runtime-dependencies-v1` normalized projection, runtime advisory gate, auth/RSC smoke, and release-image runtime contract. `package.json` and `pnpm-lock.yaml` are high-churn aggregate sources, not whole-file Leaf 3 artifacts. Leaf 13A verifies the committed fragment, creates its exact-candidate pre-floor generation before traffic switch, and updates `deployed-leaves.json`; Leaf 13B later compiles that generation into the monotonic runtime floor. No other leaf may republish it.
- Fix forward on a secure patch; never roll back to Next.js 15.5.15 or another advisory-affected image.
- Keep secret values, raw provider responses, private content, incident evidence, and quarantined identity details out of commands, test fixtures, logs, commits, and PR text.
- This plan and the restricted design are local-only disclosure material. Do not stage or push `docs/superpowers/specs/2026-07-11-security-hardening-remediation-design.md` or any `2026-07-11-security-*.md` plan without a separate disclosure review.
- Every source `git commit` command below is shorthand for a mandatory task-local wiki gate: before that commit, update `wiki/CI CD And Monitoring Workflow.md` plus `wiki/log.md` with the task's public-safe durable fact, stage them, run `pnpm wiki:install-hooks`, `pnpm wiki:sync-plan --staged`, `pnpm wiki:manifest`, stage `wiki/manifest.json`, then run `pnpm wiki:lint` and `pnpm wiki:sync-check --staged`. A no-op log entry is forbidden. Task 3 is evidence-only and makes no commit; Task 4 may consolidate only remaining documentation facts.

---

## File Structure

- Modify `package.json`: exact secure Next.js and matching ESLint config versions.
- Modify `pnpm-lock.yaml`: resolved secure Next.js production dependency graph.
- Create `tests/security/next-runtime-version.test.ts`: static version-floor and lockfile regression contract.
- Create `tests/security/next-runtime-projection.test.ts`: canonical `next-runtime-dependencies-v1` selector and owner-map contract.
- Create `scripts/security/check-next-advisories.ts`: exact candidate GitHub advisory gate with bounded pagination and fail-closed API handling.
- Create `tests/security/next-advisories.test.ts`: complete-result, pagination, API-failure, malformed-response, and affected-candidate tests.
- Create `deploy/security/capabilities/secure-next-runtime.json` and `tests/security/secure-next-runtime-capability.test.ts`: leaf-owned fragment, protected-selector mapping, and evidence-code contract.
- Modify `deploy/security/protected-artifact-owners.json`: add the owner-signed active projection selector; do not claim either aggregate source path.
- Create `tests/e2e/security-runtime.spec.ts`: auth-provider, App Router navigation, and RSC response smoke coverage.
- Create `scripts/test/security-runtime-fixture.ts`: synthetic password fixture create/delete command with no secret output.
- Create `scripts/test/run-security-runtime-smoke.sh`: production-like staging server lifecycle, bounded health polling, Playwright invocation, and unconditional fixture/process cleanup.
- Modify `playwright.config.ts`: allow an explicit external production-smoke base URL without starting `next dev`.
- Modify `wiki/CI CD And Monitoring Workflow.md`: public-safe note that CI enforces the secure runtime floor and runs the new smoke.
- Modify `wiki/log.md`: public-safe dependency-upgrade evidence entry without advisory exploit detail.
- Regenerate `wiki/manifest.json` only after the safe wiki edits.

### Task 1: Reconfirm and Pin the Secure Runtime

**Files:**
- Create: `tests/security/next-runtime-version.test.ts`
- Create: `tests/security/next-runtime-projection.test.ts`
- Create: `scripts/test/security-runtime-fixture.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: `package.json` dependency specifications, the pnpm v9 lockfile text at `pnpm-lock.yaml`, and Leaf 13A's fixed protected-artifact selector policy/projector.
- Produces: `readPinnedVersion(name): string`, `compareVersions(left, right): number`, exact `next: "15.5.18"` and `eslint-config-next: "15.5.18"` specifications, a frozen lock graph with no `next@15.5.15` package snapshot, and the canonical hash for `next-runtime-dependencies-v1`.

- [ ] **Step 1: Query all advisories for the exact planning candidate without persisting response bodies**

Run:

```bash
candidate=15.5.18
count="$(gh api --paginate "/advisories?affects=next@${candidate}&per_page=100" \
  --jq 'length' | awk '{total += $1} END {print total + 0}')"
test "$count" -eq 0
```

Expected: zero. A nonzero result or API/pagination/parse failure blocks the leaf. Inspect advisory metadata privately to select another supported 15.x candidate, then rerun the exact-version query until it returns zero. Do not paste response bodies into the issue, PR, wiki, commit, or CI artifact.

Write the failing tests for `scripts/security/check-next-advisories.ts` before implementation. The script must follow all pages, require a successful authenticated API response, reject malformed/truncated data, print only candidate plus count, and exit nonzero for any matching advisory.

- [ ] **Step 2: Create the failing version and lockfile test**

Create `tests/security/next-runtime-version.test.ts` with:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const root = process.cwd();
const packageJson = JSON.parse(
  readFileSync(join(root, "package.json"), "utf8"),
) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const lockfile = readFileSync(join(root, "pnpm-lock.yaml"), "utf8");
const MINIMUM_SECURE_NEXT_VERSION = "15.5.18";

export function readPinnedVersion(name: string): string {
  const version = packageJson.dependencies?.[name] ?? packageJson.devDependencies?.[name];
  if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`${name} must use an exact numeric version`);
  }
  return version;
}

export function compareVersions(left: string, right: string): number {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = leftParts[index]! - rightParts[index]!;
    if (difference !== 0) return difference;
  }
  return 0;
}

describe("security-critical Next.js runtime", () => {
  test("pins Next.js and its ESLint config to one secure 15.x patch", () => {
    const nextVersion = readPinnedVersion("next");
    const eslintConfigVersion = readPinnedVersion("eslint-config-next");

    expect(nextVersion.split(".")[0]).toBe("15");
    expect(compareVersions(nextVersion, MINIMUM_SECURE_NEXT_VERSION)).toBeGreaterThanOrEqual(0);
    expect(eslintConfigVersion).toBe(nextVersion);
  });

  test("resolves the pinned runtime and excludes the reviewed vulnerable patch", () => {
    const nextVersion = readPinnedVersion("next");

    expect(lockfile).toContain(`next@${nextVersion}:`);
    expect(lockfile).toContain(`eslint-config-next@${nextVersion}:`);
    expect(lockfile).not.toContain("next@15.5.15:");
  });
});
```

Create `scripts/test/security-runtime-fixture.ts` with an explicit `create|delete`
contract. The password is read from a file and is never printed or accepted in argv:

```ts
import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../../lib/auth/passwords";

const prisma = new PrismaClient();
const email = process.env.SECURITY_RUNTIME_FIXTURE_EMAIL?.trim().toLowerCase();
const passwordFile = process.env.SECURITY_RUNTIME_FIXTURE_PASSWORD_FILE?.trim();
const slug = process.env.SECURITY_RUNTIME_FIXTURE_SLUG?.trim();
if (!email?.endsWith("@invalid.example") || !passwordFile || !slug?.startsWith("security-runtime-")) {
  throw new Error("SECURITY_RUNTIME_FIXTURE_CONFIG_INVALID");
}

async function remove() {
  const organizations = await prisma.organization.findMany({
    where: { slug: `${slug}-org` },
    select: { id: true },
  });
  await prisma.$transaction(async (tx) => {
    await tx.organization.deleteMany({ where: { id: { in: organizations.map(({ id }) => id) } } });
    await tx.user.deleteMany({ where: { email } });
  });
}

async function create() {
  await remove();
  const password = (await readFile(passwordFile, "utf8")).trim();
  if (password.length < 32) throw new Error("SECURITY_RUNTIME_FIXTURE_PASSWORD_INVALID");
  const passwordHash = await hashPassword(password);
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email, name: "Runtime Smoke", passwordHash, emailVerified: new Date() },
    });
    const organization = await tx.organization.create({
      data: { name: "Runtime Smoke", slug: `${slug}-org` },
    });
    const workspace = await tx.workspace.create({
      data: { organizationId: organization.id, name: "Runtime Smoke", slug },
    });
    await tx.workspaceMember.create({
      data: { workspaceId: workspace.id, userId: user.id, role: "OWNER" },
    });
    await tx.document.create({
      data: {
        workspaceId: workspace.id,
        title: "Runtime Smoke",
        slug: "runtime-smoke",
        path: "/runtime-smoke",
        contentMarkdown: "# Runtime Smoke\n\nSynthetic fixture only.",
        contentText: "Runtime Smoke Synthetic fixture only.",
        createdById: user.id,
        updatedById: user.id,
      },
    });
  });
}

const operation = process.argv[2];
(operation === "create" ? create() : operation === "delete" ? remove() : Promise.reject(
  new Error("SECURITY_RUNTIME_FIXTURE_OPERATION_INVALID"),
))
  .then(() => process.stdout.write(`security runtime fixture ${operation} OK\n`))
  .catch(() => {
    process.stderr.write("SECURITY_RUNTIME_FIXTURE_FAILED\n");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
```

Create `tests/security/secure-next-runtime-capability.test.ts` RED first, then add this
canonical committed fragment after the exact candidate and smoke contracts exist:

```json
{
  "format": "munjib-security-capability-v1",
  "id": "secure-next-runtime",
  "version": 1,
  "leaf": 3,
  "requires": [],
  "evidenceTests": [
    "tests/security/next-runtime-version.test.ts",
    "tests/security/next-runtime-projection.test.ts",
    "tests/security/next-advisories.test.ts",
    "tests/security/secure-next-runtime-capability.test.ts",
    "tests/e2e/security-runtime.spec.ts"
  ]
}
```

The projection test runs Leaf 13A's trusted projector and fixes the canonical selector
`next-runtime-dependencies-v1`: exact `next`, `react`, and `react-dom` root manifest
values; their root-importer specifier/resolution records; and the complete sorted lock
package/snapshot graph reachable from those three roots. It rejects a missing/reordered
node, ambiguous lock structure, whole-file `FULL_PATH` ownership of either source, a
wrong projection owner, and a hash not recomputed from the candidate. It also proves an
unrelated script or nonselected dependency edit does not change the projection hash.

The Leaf 3 signed candidate alone creates the previously absent projection entry as
`ACTIVE` version 1 owned by `secure-next-runtime`; it does not create a downstream
reservation. The capability test verifies exact full-path entries for the advisory
gate, production smoke, and release-image runtime files plus that one projection
selector. `package.json` and `pnpm-lock.yaml` themselves are explicitly forbidden from
the owner map. The committed fragment contains no candidate digest or self-asserted
pass Boolean; Leaf 13A creates the exact-candidate DSSE generation from real evidence.

- [ ] **Step 3: Run the contract and verify RED**

Run:

```bash
pnpm exec vitest run tests/security/next-runtime-version.test.ts tests/security/next-runtime-projection.test.ts tests/security/next-advisories.test.ts tests/security/secure-next-runtime-capability.test.ts --reporter=dot
```

Expected: FAIL with `next must use an exact numeric version` because `package.json` still declares `next` as `^15.0.0`; the lockfile also still resolves Next.js 15.5.15.

- [ ] **Step 4: Upgrade Next.js and the matching ESLint package with exact specifications**

Run:

```bash
pnpm add --save-exact next@15.5.18
pnpm add --save-dev --save-exact eslint-config-next@15.5.18
```

Expected: `package.json` contains exactly `"next": "15.5.18"` and `"eslint-config-next": "15.5.18"`; `pnpm-lock.yaml` resolves the same Next.js patch. No React major or unrelated direct dependency changes are introduced.

- [ ] **Step 5: Inspect the direct dependency delta**

Run:

```bash
git diff -- package.json pnpm-lock.yaml
pnpm list next eslint-config-next react react-dom --depth 0
```

Expected: the manifest changes only the two requested version specifications; the list reports Next.js and ESLint config 15.5.18 and keeps React/React DOM on 19.x. Lockfile transitive changes are attributable to the Next.js patch resolution.

- [ ] **Step 6: Run the runtime contract and verify GREEN**

Run:

```bash
pnpm exec vitest run tests/security/next-runtime-version.test.ts tests/security/next-runtime-projection.test.ts --reporter=dot
```

Expected: PASS (2 tests), with no `next@15.5.15` snapshot.

- [ ] **Step 7: Verify the production audit**

Run:

```bash
pnpm audit --prod
pnpm exec tsx scripts/security/check-next-advisories.ts --candidate "$(pnpm exec next --version | sed 's/^Next.js v//')"
```

Expected: both exit 0; the exact installed Next candidate has zero matching global advisories and the production graph has no audit finding. Any nonzero or API failure blocks the commit; do not use `--audit-level` or a partial advisory allowlist.

- [ ] **Step 8: Commit the secure dependency graph**

```bash
git add package.json pnpm-lock.yaml tests/security/next-runtime-version.test.ts tests/security/next-runtime-projection.test.ts tests/security/next-advisories.test.ts scripts/security/check-next-advisories.ts scripts/test/security-runtime-fixture.ts
git commit -m "fix: upgrade security-critical Next.js runtime"
```

Expected: one green commit containing the version contract and dependency graph, with no restricted design or plan.

### Task 2: Add Auth and RSC Production Smoke Coverage

**Files:**
- Create: `tests/e2e/security-runtime.spec.ts`
- Modify: `scripts/test/security-runtime-fixture.ts`
- Create: `scripts/test/run-security-runtime-smoke.sh`
- Modify: `playwright.config.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: Playwright `baseURL`, the public `/api/auth/providers` route, `/login`, a mode-0600 synthetic password file, and a synthetic workspace fixture created only for this smoke.
- Produces: two browser-level smoke tests proving password authentication and client-side RSC navigation remain responsive with `MUNJIB_ENABLE_DEV_LOGIN=false`, plus `PLAYWRIGHT_TEST_BASE_URL` as the exact external-server seam and unconditional cleanup of the synthetic user/workspace/process/files.

- [ ] **Step 1: Create the production-compatible runtime smoke**

Create `tests/e2e/security-runtime.spec.ts` with:

```ts
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const fixtureEmail = process.env.SECURITY_RUNTIME_FIXTURE_EMAIL?.trim();
const fixturePasswordFile = process.env.SECURITY_RUNTIME_FIXTURE_PASSWORD_FILE?.trim();
if (!fixtureEmail || !fixturePasswordFile) throw new Error("SECURITY_RUNTIME_FIXTURE_REQUIRED");
const fixturePassword = readFileSync(fixturePasswordFile, "utf8").trim();
if (!fixturePassword) throw new Error("SECURITY_RUNTIME_FIXTURE_PASSWORD_REQUIRED");

test("auth providers and the login shell remain available", async ({ page, request }) => {
  const providersResponse = await request.get("/api/auth/providers");
  expect(providersResponse.ok()).toBe(true);
  const providers = (await providersResponse.json()) as Record<string, { id: string }>;
  expect(providers.password?.id).toBe("password");

  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await expect(page.getByText("Development login", { exact: true })).toHaveCount(0);
});

test("App Router navigation returns a bounded RSC response and keeps the server healthy", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(fixtureEmail);
  await page.getByLabel("Password", { exact: true }).fill(fixturePassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/workspaces\/security-runtime-/);

  const navigationResponse = page.waitForResponse((response) => {
    return response.request().resourceType() === "fetch" && response.url().includes("_rsc=");
  });
  await page.getByRole("navigation").getByRole("link", { name: "Runtime Smoke" }).first().click();
  const response = await navigationResponse;

  expect(response.ok()).toBe(true);
  expect((await response.body()).byteLength).toBeLessThan(5 * 1024 * 1024);
  await expect(page.locator("[name='title']")).toHaveValue("Runtime Smoke");
  await expect(page.getByRole("button", { name: "Workspace menu" })).toBeVisible();
});
```

- [ ] **Step 2: Run the external-server smoke before adding the config seam and verify RED**

Start the production-like server through the script specified in Step 5, then run:

```bash
PLAYWRIGHT_TEST_BASE_URL=http://127.0.0.1:3103 \
pnpm exec playwright test tests/e2e/security-runtime.spec.ts --reporter=line
```

Expected: FAIL because the current `playwright.config.ts` ignores `PLAYWRIGHT_TEST_BASE_URL`, still uses port 3000, and still tries to manage `pnpm run dev`.

- [ ] **Step 3: Add the explicit external production-server seam**

Replace `playwright.config.ts` with:

```ts
import { defineConfig, devices } from "@playwright/test";

const externalBaseUrl = process.env.PLAYWRIGHT_TEST_BASE_URL?.trim();
const baseURL = externalBaseUrl || "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  workers: 1,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: externalBaseUrl
    ? undefined
    : {
        command: "pnpm run dev",
        url: "http://localhost:3000/login",
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
      },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
```

- [ ] **Step 4: Implement the production-like staging runner with cleanup**

Create executable `scripts/test/run-security-runtime-smoke.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
umask 077
: "${DATABASE_URL:?synthetic test database required}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/munjib-runtime-smoke.XXXXXX")"
PORT="${SECURITY_RUNTIME_PORT:-3103}"
SUFFIX="$(openssl rand -hex 8)"
export SECURITY_RUNTIME_FIXTURE_EMAIL="runtime-${SUFFIX}@invalid.example"
export SECURITY_RUNTIME_FIXTURE_SLUG="security-runtime-${SUFFIX}"
export SECURITY_RUNTIME_FIXTURE_PASSWORD_FILE="$WORK/password"
openssl rand -base64 48 > "$SECURITY_RUNTIME_FIXTURE_PASSWORD_FILE"
chmod 0600 "$SECURITY_RUNTIME_FIXTURE_PASSWORD_FILE"
SERVER_PID=""
FIXTURE_CREATED=false

cleanup() {
  status=$?
  trap - EXIT INT TERM
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" >/dev/null 2>&1 || status=1
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi
  if [ "$FIXTURE_CREATED" = true ]; then
    if ! pnpm exec tsx scripts/test/security-runtime-fixture.ts delete >/dev/null; then
      status=1
    fi
  fi
  rm -rf "$WORK"
  exit "$status"
}
trap cleanup EXIT INT TERM

cd "$ROOT"
pnpm exec tsx scripts/test/security-runtime-fixture.ts create
FIXTURE_CREATED=true
pnpm run build
NEXTAUTH_SECRET="$(openssl rand -base64 48)"
env \
  NODE_ENV=production \
  MUNJIB_DEPLOYMENT_ENV=development \
  NEXTAUTH_URL="http://127.0.0.1:$PORT" \
  NEXTAUTH_SECRET="$NEXTAUTH_SECRET" \
  NEXTAUTH_COOKIE_SECURE=false \
  MUNJIB_ENABLE_DEV_LOGIN=false \
  MUNJIB_SIGNUP_MODE=closed \
  SENTRY_DSN= \
  LANGFUSE_PUBLIC_KEY= \
  LANGFUSE_SECRET_KEY= \
  PORT="$PORT" \
  pnpm start > "$WORK/server.log" 2>&1 &
SERVER_PID=$!
for attempt in $(seq 1 30); do
  if curl --fail --silent --show-error --max-time 5 "http://127.0.0.1:$PORT/api/auth/providers" >/dev/null; then
    break
  fi
  test "$attempt" != 30
  sleep 2
done
PLAYWRIGHT_TEST_BASE_URL="http://127.0.0.1:$PORT" \
  pnpm exec playwright test tests/e2e/security-runtime.spec.ts --reporter=line
printf 'security runtime production smoke OK\n'
```

Add to `package.json`:

```json
"test:security-runtime": "bash scripts/test/run-security-runtime-smoke.sh"
```

- [ ] **Step 5: Run the production-like password/RSC smoke and verify GREEN**

Run against the local synthetic PostgreSQL database only:

```bash
DATABASE_URL='postgresql://obsidian:obsidian@127.0.0.1:55432/obsidian_clone?schema=public' \
pnpm run test:security-runtime
```

Expected: PASS (2 tests) against `next start`; the runtime marker is explicitly
`development` because this is the Leaf 1-approved local/test direct-secret exception,
while `NODE_ENV=production` still exercises the built `next start` server. Development
login remains false, password authentication uses the synthetic
fixture, RSC is bounded, and the EXIT trap removes the user/workspace/password file
and terminates the server. `prisma.user.count({ where: { email: { endsWith:
"@invalid.example" } } })` finds no `runtime-` fixture after cleanup.

This smoke is not staging/production secret-policy evidence. Leaf 1's strict
file-backed staging E2E and Leaf 13's exact-image integration own that evidence; no
staging or production process receives direct `NEXTAUTH_SECRET` or an explicitly empty
Google secret.

- [ ] **Step 6: Commit the smoke test, fixture, runner, and config seam**

```bash
git add tests/e2e/security-runtime.spec.ts scripts/test/security-runtime-fixture.ts scripts/test/run-security-runtime-smoke.sh playwright.config.ts package.json
git commit -m "test: cover auth and RSC runtime smoke"
```

Expected: one test-only commit.

### Task 3: Verify Source, Runner, and Tools Artifacts

**Files:**
- Test: `tests/security/next-runtime-version.test.ts`
- Test: `tests/e2e/security-runtime.spec.ts`
- Verify: `Dockerfile`
- Verify: `docker-compose.yml`

**Interfaces:**
- Consumes: the secure lock graph from Task 1 and the `runner`/`tools` targets already defined in `Dockerfile`.
- Produces: passing TypeScript, Vitest, production build, runner image, tools image, auth/RSC smoke, and production audit evidence for the exact dependency graph.

- [ ] **Step 1: Run typechecking and the complete Vitest suite**

Run:

```bash
pnpm exec tsc --noEmit --pretty false
DATABASE_URL='postgresql://obsidian:obsidian@127.0.0.1:55432/obsidian_clone?schema=public' pnpm test
```

Expected: both commands exit 0. If the sandbox cannot reach a healthy local PostgreSQL service, rerun only the DB-backed command through the approved unsandboxed path; do not reinterpret a connection denial as a product failure.

- [ ] **Step 2: Build the production application from the frozen lockfile**

Run:

```bash
pnpm install --frozen-lockfile
pnpm run build
```

Expected: both commands exit 0 and Next.js reports version 15.5.18 in the build banner.

- [ ] **Step 3: Build both Docker targets without secrets**

Run:

```bash
docker build --pull --target runner --tag munjib-next-runtime:runner .
docker build --pull --target tools --tag munjib-next-runtime:tools .
docker image inspect munjib-next-runtime:runner --format '{{.Id}}'
docker image inspect munjib-next-runtime:tools --format '{{.Id}}'
```

Expected: both builds exit 0 and each inspect prints a `sha256:` image id. No `.env` file, provider key, signing secret, or private document content appears in build output or layers.

- [ ] **Step 4: Run the final advisory check**

Run:

```bash
pnpm audit --prod
pnpm exec tsx scripts/security/check-next-advisories.ts --candidate "$(pnpm exec next --version | sed 's/^Next.js v//')"
pnpm exec vitest run tests/security/next-runtime-version.test.ts tests/security/next-runtime-projection.test.ts tests/security/next-advisories.test.ts tests/security/secure-next-runtime-capability.test.ts --reporter=dot
```

Expected: audit, complete exact-candidate advisory gate, runtime contract, and capability fragment all pass.

- [ ] **Step 5: Re-run the production-like staging password/RSC oracle**

```bash
DATABASE_URL='postgresql://obsidian:obsidian@127.0.0.1:55432/obsidian_clone?schema=public' \
pnpm run test:security-runtime
```

Expected: the exact frozen dependency graph passes password/provider/RSC smoke with
development login false, and fixture cleanup leaves no `runtime-*@invalid.example`
identity or `security-runtime-*` organization/workspace.

### Task 4: Record Public-Safe Knowledge and Commit

**Files:**
- Modify: `wiki/CI CD And Monitoring Workflow.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`

**Interfaces:**
- Consumes: successful verification evidence from Task 3.
- Produces: a minimal durable record of the runtime floor and verification commands without incident, account, topology, or exploit detail.

- [ ] **Step 1: Add the public-safe CI/CD note**

Under the CI test sequence in `wiki/CI CD And Monitoring Workflow.md`, add exactly:

```markdown
The runtime dependency gate pins Next.js and `eslint-config-next` to the same
reviewed secure patch and rejects an older lockfile resolution. Runtime upgrades run
the full Vitest suite, TypeScript, production build, runner/tools Docker builds,
auth/RSC browser smoke, and `pnpm audit --prod` before deployment.
```

- [ ] **Step 2: Add the public-safe wiki log entry**

Append a dated entry to `wiki/log.md` that names only these sources and the general outcome:

```markdown
- Updated [[CI CD And Monitoring Workflow]] after the security-critical Next.js
  patch upgrade. Evidence: `package.json`, `pnpm-lock.yaml`,
  `tests/security/next-runtime-version.test.ts`, and
  `tests/e2e/security-runtime.spec.ts`.
```

- [ ] **Step 3: Stage only implementation and safe wiki files, then run wiki guards**

```bash
git add package.json pnpm-lock.yaml deploy/security/protected-artifact-owners.json deploy/security/capabilities/secure-next-runtime.json playwright.config.ts scripts/security/check-next-advisories.ts scripts/test/security-runtime-fixture.ts scripts/test/run-security-runtime-smoke.sh tests/security/next-runtime-version.test.ts tests/security/next-runtime-projection.test.ts tests/security/next-advisories.test.ts tests/security/secure-next-runtime-capability.test.ts tests/e2e/security-runtime.spec.ts 'wiki/CI CD And Monitoring Workflow.md' wiki/log.md
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git diff --cached --name-only
if git diff --cached | rg -q 'NEXTAUTH_SECRET=.{8}|GOOGLE_CLIENT_SECRET=.{1}|API_KEY=.{1}|@munjib\.com|docs/superpowers/(plans|specs)/2026-07-11-security'; then
  printf 'staged secret-or-restricted-content scan failed\n' >&2
  exit 1
fi
```

Expected: all wiki commands exit 0; the staged file list contains only the implementation and safe-wiki paths named above plus `wiki/manifest.json`. The nonprinting conditional exits 0 because no secret value, launch identity, restricted spec, or plan is staged.

- [ ] **Step 4: Commit the public-safe knowledge update**

```bash
git commit -m "docs: record secure runtime verification"
```

Expected: one docs-only commit with no local-only security design material.

### Task 5: Push, Review, and Enforce the Issue 12 Dependency Gate

**Files:**
- Verify only: all files from Tasks 1-5.

**Interfaces:**
- Consumes: all passing Task 3 evidence and the disclosure-safe commit set.
- Produces: a reviewed Issue 3 PR/deployment whose exact commit and image are the required base for Issue 12.

- [ ] **Step 1: Inspect the complete branch disclosure surface**

```bash
git status --short
git log --oneline --decorate origin/main..HEAD
git diff --stat origin/main...HEAD
git diff --name-only origin/main...HEAD
```

Expected: only dependency, tests, and safe wiki files from this plan appear; no secret, restricted plan/spec, incident count, identity value, or private topology is present.

- [ ] **Step 2: Push and open the leaf PR**

```bash
git push -u origin HEAD
gh pr create --fill --draft
pnpm audit --prod
pnpm exec tsx scripts/security/check-next-advisories.ts --candidate "$(pnpm exec next --version | sed 's/^Next.js v//')"
pnpm exec vitest run tests/security/next-runtime-projection.test.ts tests/security/next-advisories.test.ts tests/security/secure-next-runtime-capability.test.ts --reporter=dot
gh pr ready
```

Expected: readiness occurs only after the fresh exact-candidate audit/advisory/capability
gate passes. The ready PR title/body stays general and contains no exploit reproduction
or restricted incident context.

- [ ] **Step 3: Poll in bounded intervals, then inspect review threads and checks**

Use the Codex product wait mechanism in five increments of at most 60 seconds. After
each increment run `gh pr checks`; do not run a shell sleep or one blocking wait over
60 seconds. Once at least five minutes have elapsed, run:

```bash
gh pr checks
gh pr view --json reviewDecision,reviews,statusCheckRollup
OWNER="$(gh repo view --json owner --jq '.owner.login')"
REPO="$(gh repo view --json name --jq '.name')"
PR="$(gh pr view --json number --jq '.number')"
gh api graphql -F owner="$OWNER" -F repo="$REPO" -F pr="$PR" -f query='query($owner:String!,$repo:String!,$pr:Int!){repository(owner:$owner,name:$repo){pullRequest(number:$pr){reviewThreads(first:100){nodes{isResolved comments(first:20){nodes{author{login}body path line}}}}}}}' --jq '[.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false)]'
```

Expected: required checks pass and the GraphQL command prints `[]`. Address every
unresolved thread or failure on the same branch with a new RED→GREEN cycle, repeat the
wiki/secret gates, push, and repeat this bounded polling/query step.

- [ ] **Step 4: Recheck current advisories, then merge, deploy, and record the downstream gate**

Immediately before merge, rerun `pnpm audit --prod`, run the exact-candidate complete
GitHub advisory gate from Task 1, and rerun the runtime-version plus
production-like staging oracle. If a newer applicable fixed floor exists, update the
pin and repeat RED→GREEN, wiki/secret gates, review, and bounded polling. After that
recheck passes, merge through the protected workflow and verify production
health/auth/RSC smoke against the deployed exact commit.

After the final image is built and immediately before the signed Leaf 13A envelope is
created, a no-checkout scan job downloads only the digest-bound frozen-lock artifact,
pulls the exact app/tools image, reruns `pnpm audit --prod` against that lock, extracts
the runtime version from the image, and queries every matching GitHub advisory. It
signs `next-advisory-v1` evidence binding image digest, lock hash, exact version, zero
advisory count, audit result, query time, and expiry no more than 15 minutes later. The
13A dispatcher independently verifies this evidence and rejects expiry, API failure,
digest/lock mismatch, or any advisory immediately before accepting the envelope. A
merge-time result cannot be reused for delivery. Record in the Issue 12 handoff that it
must start from this merged commit or later.

Expected: the deployment uses an exact Next.js 15 patch with zero applicable advisories at the final gate, production smoke passes through Leaf 13A, and no rollback candidate contains Next.js 15.5.15 or any then-affected patch.
