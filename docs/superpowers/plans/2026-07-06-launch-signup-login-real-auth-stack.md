# Launch Signup Login Real Auth Stack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Issue #146 using Lazyweb Hypothesis #3 / Real Auth Stack as the login-screen visual source of truth.

**Architecture:** Split the work into provider configuration, provisioning/redirect services, API routes, and a language-aware LoginForm. All post-auth flows land on `/login/redirect`, where the hydrated browser language is passed to the server before workspace provisioning and redirect resolution.

**Tech Stack:** Next.js App Router, NextAuth v4, Prisma, Vitest, Testing Library, Tailwind/Honen UI primitives.

---

## File Structure

- Modify `lib/auth/config.ts`: provider ids, password/trial/google providers, Prisma adapter, Google verification callback.
- Create `lib/auth/provisioning.ts`: signup validation, default workspace provisioning, accessible workspace redirect resolution.
- Create `app/api/auth/signup/route.ts`: password signup endpoint.
- Create `app/api/auth/landing/route.ts`: post-auth provisioning and redirect endpoint.
- Create `app/login/redirect/page.tsx`: client redirect bridge that waits for hydrated language.
- Modify `app/login/login-form.tsx`: Hypothesis #3 UI, signup mode, provider ids, language-hydration guard.
- Modify `app/page.tsx`: authenticated home redirects through the accessible workspace helper.
- Modify `lib/i18n/messages.ts`: localized Real Auth Stack copy.
- Add focused tests under `tests/auth/` and update `tests/components/login-form.test.tsx`.
- Update wiki pages after implementation.

## Tasks

### Task 1: Auth provider tests and implementation

- [ ] Write failing tests in `tests/auth/config.test.ts` for provider ids `password`, `trial`, and `development-login`.
- [ ] Write failing tests that password auth calls `verifyPassword()` with `User.passwordHash`, rejects missing hashes, and keeps dev login gated.
- [ ] Write failing tests for Google env config and unverified Google rejection.
- [ ] Implement provider separation in `lib/auth/config.ts`.
- [ ] Run `pnpm exec vitest run tests/auth/config.test.ts` until green.

### Task 2: Provisioning and redirect services

- [ ] Write failing tests in `tests/auth/provisioning.test.ts` for localized default workspace names.
- [ ] Write failing tests for `OWNER`, `local-only-fixture-1=ADMIN`, and `local-only-fixture-2=VIEWER` membership creation.
- [ ] Write failing tests for first accessible workspace redirect and unsafe callback rejection.
- [ ] Implement `lib/auth/provisioning.ts`.
- [ ] Run `pnpm exec vitest run tests/auth/provisioning.test.ts tests/workspaces/membership-bootstrap.test.ts`.

### Task 3: Signup and landing routes

- [ ] Write failing route tests for duplicate email, weak password, successful signup, and unauthenticated landing.
- [ ] Implement `app/api/auth/signup/route.ts`.
- [ ] Implement `app/api/auth/landing/route.ts`.
- [ ] Add `/login/redirect` bridge page that waits for i18n hydration and posts language to the landing route.
- [ ] Run the new route tests.

### Task 4: Hypothesis #3 LoginForm UI

- [ ] Update `tests/components/login-form.test.tsx` to assert the Hypothesis #3 hierarchy.
- [ ] Add tests that Korean stored language renders Korean copy without first showing English text.
- [ ] Add tests for `signIn("google")`, `signIn("password")`, `signIn("trial")`, signup POST, and dev provider `development-login`.
- [ ] Implement the Real Auth Stack card using shared `Button` and `Input`.
- [ ] Run `pnpm exec vitest run tests/components/login-form.test.tsx tests/i18n/messages.test.ts`.

### Task 5: Integration, wiki, and visual verification

- [ ] Replace hard-coded authenticated home redirect with the accessible workspace helper.
- [ ] Update `Auth And Permissions Workflow`, `wiki/index.md`, `wiki/log.md`, and `wiki/manifest.json`.
- [ ] Run focused auth/UI/provisioning tests.
- [ ] Start the dev server, capture `/login`, and compare against `.lazyweb/.../hypothesis-3-real-auth-stack.jpg`.
- [ ] Iterate UI spacing/copy until the local screenshot matches the mockup hierarchy.
- [ ] Run commit-time wiki sync commands and final verification before commit/PR.
