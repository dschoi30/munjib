# Launch Auth Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Munjib's existing email-only development login launch-safe by disabling it in production unless an operator explicitly enables it.

**Architecture:** Keep NextAuth and the current Credentials provider shape, but add one server-side auth configuration seam that decides whether development login can authenticate. Server pages pass the same decision to the client login form so the UI can present a disabled state without owning security logic.

**Tech Stack:** Next.js App Router, NextAuth Credentials provider, React client component, TypeScript, Vitest, Testing Library, wiki maintenance scripts.

---

## File Structure

- `lib/auth/config.ts`: Owns auth environment parsing, the dev-login gate, and the Credentials `authorize()` guard.
- `app/login/page.tsx`: Server page that passes `resolveDevLoginEnabled()` into `LoginForm`.
- `app/page.tsx`: Home page that passes `resolveDevLoginEnabled()` into `LoginForm` when no current session exists.
- `app/login/login-form.tsx`: Client form that disables email-only login controls when the server says dev login is off.
- `lib/i18n/messages.ts`: Adds localized disabled-state copy.
- `tests/auth/config.test.ts`: Covers environment parsing and the provider guard.
- `tests/components/login-form.test.tsx`: Covers disabled login UI and keeps redirect tests green.
- `wiki/Auth And Permissions Workflow.md`: Records the implemented dev-login gate.
- `wiki/index.md`: Updates the Issue #143 status sentence after implementation.
- `wiki/log.md`: Adds the implementation evidence entry.
- `wiki/manifest.json`: Regenerated after wiki edits.

## Task 1: Auth Gate Tests

**Files:**
- Modify: `tests/auth/config.test.ts`
- Modify: `lib/auth/config.ts`

- [ ] **Step 1: Add failing env parsing tests**

Insert these tests in `tests/auth/config.test.ts` inside the existing
`describe("authOptions", () => { ... })` block after the secure-cookie tests:

```ts
  it("enables development login by default outside production", () => {
    vi.stubEnv("MUNJIB_ENABLE_DEV_LOGIN", "");
    vi.stubEnv("NODE_ENV", "development");

    expect(resolveDevLoginEnabled()).toBe(true);
  });

  it("disables development login by default in production", () => {
    vi.stubEnv("MUNJIB_ENABLE_DEV_LOGIN", "");
    vi.stubEnv("NODE_ENV", "production");

    expect(resolveDevLoginEnabled()).toBe(false);
  });

  it.each([
    ["true"],
    [" TRUE "],
    ["1"],
    ["yes"],
  ])("enables development login with %s", (value) => {
    vi.stubEnv("MUNJIB_ENABLE_DEV_LOGIN", value);
    vi.stubEnv("NODE_ENV", "production");

    expect(resolveDevLoginEnabled()).toBe(true);
  });

  it.each([
    ["false"],
    [" FALSE "],
    ["0"],
    ["no"],
  ])("disables development login with %s", (value) => {
    vi.stubEnv("MUNJIB_ENABLE_DEV_LOGIN", value);
    vi.stubEnv("NODE_ENV", "development");

    expect(resolveDevLoginEnabled()).toBe(false);
  });

  it("fails closed for invalid development login flags in production", () => {
    vi.stubEnv("MUNJIB_ENABLE_DEV_LOGIN", "sometimes");
    vi.stubEnv("NODE_ENV", "production");

    expect(resolveDevLoginEnabled()).toBe(false);
  });

  it("keeps invalid development login flags local-friendly outside production", () => {
    vi.stubEnv("MUNJIB_ENABLE_DEV_LOGIN", "sometimes");
    vi.stubEnv("NODE_ENV", "development");

    expect(resolveDevLoginEnabled()).toBe(true);
  });
```

Also update the import at the top of the file:

```ts
import {
  authOptions,
  resolveAuthCookieSecure,
  resolveAuthSecret,
  resolveDevLoginEnabled,
} from "@/lib/auth/config";
```

- [ ] **Step 2: Run the focused auth config tests and confirm the new helper is missing**

Run:

```bash
./node_modules/.bin/vitest run tests/auth/config.test.ts
```

Expected: FAIL with a TypeScript or runtime error that `resolveDevLoginEnabled`
is not exported from `@/lib/auth/config`.

- [ ] **Step 3: Implement the dev-login env parser**

In `lib/auth/config.ts`, add this helper below `resolveAuthCookieSecure()`:

```ts
export function resolveDevLoginEnabled() {
  const override = process.env.MUNJIB_ENABLE_DEV_LOGIN?.trim().toLowerCase();
  if (override === "true" || override === "1" || override === "yes") return true;
  if (override === "false" || override === "0" || override === "no") return false;
  return process.env.NODE_ENV !== "production";
}
```

- [ ] **Step 4: Re-run the focused auth config tests**

Run:

```bash
./node_modules/.bin/vitest run tests/auth/config.test.ts
```

Expected: PASS for `tests/auth/config.test.ts`.

- [ ] **Step 5: Commit the helper test slice**

Run:

```bash
git add lib/auth/config.ts tests/auth/config.test.ts
git commit -m "test: cover development login gate config"
```

Expected: commit succeeds. If the hook hits the known `pnpm` ignored-builds
guard, first run the direct verification commands in this task, then use:

```bash
git commit --no-verify -m "test: cover development login gate config"
```

## Task 2: Credentials Provider Guard

**Files:**
- Modify: `tests/auth/config.test.ts`
- Modify: `lib/auth/config.ts`

- [ ] **Step 1: Add failing provider guard tests**

Add this hoisted Prisma mock above the `vi.mock("next-auth/react", ...)` line if
the file does not already mock Prisma:

```ts
const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
  },
}));

vi.mock("@/lib/db/client", () => ({
  prisma: prismaMock,
}));
```

If `tests/auth/config.test.ts` has no NextAuth React mock, add the Prisma mock
after the imports and before `describe("authOptions", () => {`.

Inside the same `describe` block, add these helpers before the tests that call
them:

```ts
function getCredentialsProvider() {
  const providerFactory = authOptions.providers[0];
  const provider =
    typeof providerFactory === "function"
      ? providerFactory({} as never)
      : providerFactory;
  if (!("authorize" in provider) || typeof provider.authorize !== "function") {
    throw new Error("Credentials provider authorize function was not found.");
  }
  return provider;
}
```

Then add these tests after the env parsing tests:

```ts
  it("does not query users when development login is disabled", async () => {
    vi.stubEnv("MUNJIB_ENABLE_DEV_LOGIN", "false");
    vi.stubEnv("NODE_ENV", "development");
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "owner@example.com",
      name: "Owner",
      avatarUrl: null,
    });

    const provider = getCredentialsProvider();
    const result = await provider.authorize?.({ email: "owner@example.com" }, {} as never);

    expect(result).toBeNull();
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it("queries users when development login is enabled", async () => {
    vi.stubEnv("MUNJIB_ENABLE_DEV_LOGIN", "true");
    vi.stubEnv("NODE_ENV", "production");
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "owner@example.com",
      name: "Owner",
      avatarUrl: null,
    });

    const provider = getCredentialsProvider();
    const result = await provider.authorize?.({ email: " OWNER@example.com " }, {} as never);

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { email: "owner@example.com" },
    });
    expect(result).toEqual({
      id: "user-1",
      email: "owner@example.com",
      name: "Owner",
      image: null,
    });
  });
```

Update `afterEach()` in `tests/auth/config.test.ts` so Prisma calls reset:

```ts
  afterEach(() => {
    vi.unstubAllEnvs();
    prismaMock.user.findUnique.mockReset();
  });
```

- [ ] **Step 2: Run the focused auth config tests and confirm the provider still queries while disabled**

Run:

```bash
./node_modules/.bin/vitest run tests/auth/config.test.ts
```

Expected: FAIL because `authorize()` still calls `prisma.user.findUnique()` even
when `MUNJIB_ENABLE_DEV_LOGIN=false`.

- [ ] **Step 3: Add the provider guard**

In `lib/auth/config.ts`, change the `authorize(credentials)` body to:

```ts
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
          image: user.avatarUrl,
        };
      },
```

- [ ] **Step 4: Re-run the focused auth config tests**

Run:

```bash
./node_modules/.bin/vitest run tests/auth/config.test.ts
```

Expected: PASS for `tests/auth/config.test.ts`.

- [ ] **Step 5: Commit the provider guard slice**

Run:

```bash
git add lib/auth/config.ts tests/auth/config.test.ts
git commit -m "feat: gate development credentials login"
```

Expected: commit succeeds, or use the same verified `--no-verify` fallback if
the known `pnpm` ignored-builds guard blocks the hook.

## Task 3: Disabled Login UI

**Files:**
- Modify: `tests/components/login-form.test.tsx`
- Modify: `app/login/login-form.tsx`
- Modify: `lib/i18n/messages.ts`
- Modify: `app/login/page.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Add failing disabled-state UI test**

Change the test helper in `tests/components/login-form.test.tsx` to:

```ts
function renderLoginForm(
  callbackUrl?: string,
  options: { isDevLoginEnabled?: boolean } = {},
) {
  return render(
    <I18nProvider>
      <LoginForm
        {...(callbackUrl ? { callbackUrl } : {})}
        isDevLoginEnabled={options.isDevLoginEnabled ?? true}
      />
    </I18nProvider>,
  );
}
```

Add this test before the redirect tests:

```ts
  it("disables development login controls when the server gate is off", async () => {
    renderLoginForm(undefined, { isDevLoginEnabled: false });

    expect(await screen.findByText("Development email login is disabled for this environment.")).toBeTruthy();
    expect(screen.getByLabelText("Email")).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "owner@example.com" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Sign in" })).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(authMock.signIn).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run the focused login form tests and confirm the prop is missing**

Run:

```bash
./node_modules/.bin/vitest run tests/components/login-form.test.tsx
```

Expected: FAIL because `LoginForm` does not accept `isDevLoginEnabled` and does
not render disabled-state copy.

- [ ] **Step 3: Add localized disabled-state messages**

In `lib/i18n/messages.ts`, add English login keys after
`"login.clearSession"`:

```ts
    "login.disabled": "Development email login is disabled for this environment.",
    "login.disabledHint": "Enable MUNJIB_ENABLE_DEV_LOGIN only for trusted development-style environments.",
```

Add Korean login keys after `"login.clearSession"` in the `ko` catalog:

```ts
    "login.disabled": "이 환경에서는 개발용 이메일 로그인이 비활성화되어 있습니다.",
    "login.disabledHint": "신뢰할 수 있는 개발형 환경에서만 MUNJIB_ENABLE_DEV_LOGIN을 켜세요.",
```

- [ ] **Step 4: Update `LoginForm` props and disabled controls**

In `app/login/login-form.tsx`, change the props type to:

```ts
type LoginFormProps = {
  callbackUrl?: string;
  isDevLoginEnabled?: boolean;
};
```

Change the component signature to:

```ts
export function LoginForm({
  callbackUrl = defaultPostLoginCallbackUrl,
  isDevLoginEnabled = true,
}: LoginFormProps) {
```

At the top of `onSubmit`, after `event.preventDefault();`, add:

```ts
    if (!isDevLoginEnabled) return;
```

Inside the development user button map, add `disabled={!isDevLoginEnabled}` and
change its className to:

```tsx
            className="rounded-md border border-border px-3 py-2 text-left text-sm text-slate-700 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
```

On the email input, add:

```tsx
        disabled={!isDevLoginEnabled}
```

On the submit button, change `disabled={isSubmitting}` to:

```tsx
        disabled={isSubmitting || !isDevLoginEnabled}
```

After the submit button, before the clear session button, render the disabled
message:

```tsx
      {!isDevLoginEnabled ? (
        <p className="mt-3 text-sm text-slate-600">
          {t("login.disabled")} {t("login.disabledHint")}
        </p>
      ) : null}
```

- [ ] **Step 5: Pass the server gate into both login entry points**

In `app/login/page.tsx`, add the import:

```ts
import { resolveDevLoginEnabled } from "@/lib/auth/config";
```

Change the component to:

```tsx
export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted px-6">
      <LoginForm isDevLoginEnabled={resolveDevLoginEnabled()} />
    </main>
  );
}
```

In `app/page.tsx`, add the import:

```ts
import { resolveDevLoginEnabled } from "@/lib/auth/config";
```

Change the final `LoginForm` render to:

```tsx
      <LoginForm isDevLoginEnabled={resolveDevLoginEnabled()} />
```

- [ ] **Step 6: Re-run the focused login form tests**

Run:

```bash
./node_modules/.bin/vitest run tests/components/login-form.test.tsx
```

Expected: PASS for the existing Korean/redirect tests and the new disabled-state
test.

- [ ] **Step 7: Run focused auth and login tests together**

Run:

```bash
./node_modules/.bin/vitest run tests/auth/config.test.ts tests/components/login-form.test.tsx
```

Expected: PASS for both focused test files.

- [ ] **Step 8: Commit the login UI slice**

Run:

```bash
git add app/login/login-form.tsx app/login/page.tsx app/page.tsx lib/i18n/messages.ts tests/components/login-form.test.tsx
git commit -m "feat: show disabled development login state"
```

Expected: commit succeeds, or use the same verified `--no-verify` fallback if
the known `pnpm` ignored-builds guard blocks the hook.

## Task 4: Wiki And Verification

**Files:**
- Modify: `wiki/Auth And Permissions Workflow.md`
- Modify: `wiki/index.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`

- [ ] **Step 1: Update auth workflow to implementation wording**

In `wiki/Auth And Permissions Workflow.md`, update the `Development login gate`
section to say:

```md
Issue #143 keeps the existing email-only Credentials provider for development
but gates authentication with `MUNJIB_ENABLE_DEV_LOGIN`. Local development
defaults to enabled so seed users can keep signing in, while production defaults
to disabled unless an operator explicitly sets `MUNJIB_ENABLE_DEV_LOGIN=true`.
When disabled, the provider returns `null` before querying `User`, and the login
form renders disabled controls plus localized disabled-state copy.
```

Update the evidence list to include:

```md
- `tests/auth/config.test.ts`
- `tests/components/login-form.test.tsx`
```

- [ ] **Step 2: Update wiki index status**

In `wiki/index.md`, update the `Auth launch hardening` status sentence so it
uses implementation wording:

```md
- Auth launch hardening: Issue #143 gates the existing NextAuth email-only development login so production cannot authenticate by email alone unless `MUNJIB_ENABLE_DEV_LOGIN=true` is explicitly set. Local development remains enabled by default for seeded users, the Credentials provider returns `null` before querying `User` when disabled, and the login form shows localized disabled-state copy. Password auth, OAuth, SSO/SAML, and invitation flow remain follow-up decisions. 설계 근거는 `docs/superpowers/specs/2026-07-04-launch-auth-foundation-design.md`이고 관련 workflow는 [[Auth And Permissions Workflow]]이다.
```

- [ ] **Step 3: Add implementation log entry**

Add this entry at the top of `wiki/log.md` after `# Wiki Log`:

```md
## 2026-07-04T23:20:00+0900 - issue-143 auth launch foundation implementation

- Result: Issue #143 made the existing email-only development login launch-safe by gating it behind `MUNJIB_ENABLE_DEV_LOGIN`.
- Coverage: `resolveDevLoginEnabled()` defaults local development to enabled and production to disabled; the Credentials provider returns `null` before querying `User` when disabled; `/` and `/login` pass the server gate into `LoginForm`; the login form disables seeded-user shortcuts, email input, and submit while showing localized disabled-state copy.
- Pages: [[Auth And Permissions Workflow]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: GitHub issue #143, `lib/auth/config.ts`, `app/login/login-form.tsx`, `app/login/page.tsx`, `app/page.tsx`, `lib/i18n/messages.ts`, `tests/auth/config.test.ts`, `tests/components/login-form.test.tsx`.
- Verification: focused auth config and login form Vitest coverage.
```

If the current time differs materially, replace only the timestamp with the
actual local time from `date '+%Y-%m-%dT%H:%M:%S%z'`.

- [ ] **Step 4: Regenerate wiki manifest**

Run:

```bash
./node_modules/.bin/tsx scripts/wiki/manifest.ts
```

Expected: `wrote wiki/manifest.json with 21 pages`. If sandbox IPC blocks
`tsx`, rerun the same command with local execution approval.

- [ ] **Step 5: Run focused verification**

Run:

```bash
./node_modules/.bin/vitest run tests/auth/config.test.ts tests/components/login-form.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Run type checking**

Run:

```bash
pnpm exec tsc --noEmit
```

Expected: PASS. If `pnpm exec` hits the known ignored-builds guard, run:

```bash
./node_modules/.bin/tsc --noEmit
```

Expected: PASS.

- [ ] **Step 7: Run wiki checks**

Run:

```bash
./node_modules/.bin/tsx scripts/wiki/lint.ts
./node_modules/.bin/tsx scripts/wiki/sync-plan.ts --staged
./node_modules/.bin/tsx scripts/wiki/sync-check.ts --staged
```

Expected: `lint.ts` exits 0 with the known existing unresolved pasted-image
warning in `wiki/designs/sidebar.md`; `sync-plan.ts --staged` prints candidate
wiki pages; `sync-check.ts --staged` exits 0 because wiki files are staged with
source changes. If sandbox IPC blocks `tsx`, rerun the same commands with local
execution approval.

- [ ] **Step 8: Stage and commit implementation**

Run:

```bash
git add lib/auth/config.ts app/login/login-form.tsx app/login/page.tsx app/page.tsx lib/i18n/messages.ts tests/auth/config.test.ts tests/components/login-form.test.tsx wiki/Auth\ And\ Permissions\ Workflow.md wiki/index.md wiki/log.md wiki/manifest.json
git commit -m "feat: gate development login for launch"
```

Expected: commit succeeds, or use the same verified `--no-verify` fallback if
the known `pnpm` ignored-builds guard blocks the hook after the direct
verification commands have passed.

## Task 5: Push, PR, Review, And CI

**Files:**
- No source edits expected unless review or CI finds an issue.

- [ ] **Step 1: Push the branch**

Run:

```bash
git push -u origin issue-143-launch-auth-foundation
```

Expected: branch pushes to `origin`.

- [ ] **Step 2: Create the pull request**

Run:

```bash
gh pr create --base main --head issue-143-launch-auth-foundation --title "Gate development login for launch" --body "Closes #143."
```

Expected: GitHub returns a PR URL.

- [ ] **Step 3: Mark the PR ready if needed**

Run:

```bash
gh pr ready
```

Expected: If the PR is already ready, GitHub reports that state. If it was a
draft, it becomes ready.

- [ ] **Step 4: Wait for review window**

Run:

```bash
sleep 300
```

Expected: command exits after five minutes.

- [ ] **Step 5: Inspect PR reviews, review threads, and CI**

Run:

```bash
gh pr view --json number,state,reviewDecision,reviews,statusCheckRollup,url
gh pr checks
```

Expected: Reviews and checks are visible. If checks fail or review feedback is
actionable, implement the fix on the same branch, rerun relevant verification,
commit, push, and repeat the review inspection.

Use the GitHub review-thread inspection workflow if inline review comments are
present:

```bash
python3 /Users/andrewchoi/.codex/plugins/cache/openai-curated-remote/github/0.1.5/skills/gh-address-comments/scripts/fetch_comments.py
```

Expected: unresolved review threads, if any, are listed with paths and comments.

## Plan Self-Review

- Spec coverage: The plan covers the env gate, production-safe provider guard,
  local development preservation, disabled login UI, focused tests, wiki
  updates, and PR review workflow. Password auth, OAuth, SSO/SAML, invitations,
  and user lifecycle remain intentionally out of scope.
- Placeholder scan: No task relies on unspecified code or future decisions.
- Type consistency: The plan uses one public helper,
  `resolveDevLoginEnabled()`, and one client prop, `isDevLoginEnabled`, across
  tests, server pages, and the login form.
