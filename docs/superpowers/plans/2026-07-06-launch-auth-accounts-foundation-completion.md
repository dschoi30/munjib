# Launch Auth Accounts Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish Issue #145 by publishing the account-ready schema, password helpers, launch seed users, and idempotent workspace membership bootstrap as one reviewable branch.

**Architecture:** Keep account storage and launch access as small server-side primitives. Prisma owns durable account tables, `lib/auth/passwords.ts` owns hashing/verification, `lib/workspaces/membership-bootstrap.ts` owns launch account membership policy, and `prisma/seed.ts` wires those helpers into idempotent seed/backfill behavior.

**Tech Stack:** Next.js App Router, NextAuth v4, Prisma, PostgreSQL, Node `crypto.scrypt`, Vitest, Munjib wiki maintenance scripts.

---

### Task 1: Branch And Scope Guard

**Files:**
- Inspect: `docs/superpowers/specs/2026-07-06-launch-auth-accounts-foundation-design.md`
- Inspect: `docs/superpowers/plans/2026-07-05-post-143-production-launch-auth-workspace.md`
- Inspect: `git status --short --untracked-files=all`

- [ ] **Step 1: Confirm branch**

Run: `git branch --show-current`

Expected: `issue-145-launch-auth-accounts-foundation`

- [ ] **Step 2: Confirm scope**

Run: `git diff --name-only && git status --short --untracked-files=all`

Expected: changed files are limited to Prisma schema/migration/seed, auth password helper, workspace membership bootstrap helper, focused tests, superpowers docs, and wiki maintenance. Leave unrelated pre-existing `pnpm-workspace.yaml` unstaged unless a later verification command proves it is required.

### Task 2: Account Schema And Migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260705090000_add_auth_accounts_foundation/migration.sql`

- [ ] **Step 1: Verify schema diff**

Run: `git diff -- prisma/schema.prisma prisma/migrations/20260705090000_add_auth_accounts_foundation/migration.sql`

Expected: `User.passwordHash`, `User.emailVerified`, `User.accounts`, `User.sessions`, and `Account`/`Session`/`VerificationToken` tables are present with provider/account and session-token uniqueness.

- [ ] **Step 2: Run Prisma validation**

Run: `pnpm exec prisma validate`

Expected: Prisma schema validates. If engine download fails because of sandbox/network access, rerun with required network escalation and record any remaining external failure exactly.

### Task 3: Password Hash Helper

**Files:**
- Create: `lib/auth/passwords.ts`
- Test: `tests/auth/passwords.test.ts`

- [ ] **Step 1: Run focused password tests**

Run: `pnpm exec vitest run tests/auth/passwords.test.ts`

Expected: password hashes use the `scrypt:` prefix, omit plaintext, verify the correct password, and reject wrong, missing, or malformed hashes.

### Task 4: Launch Membership Bootstrap And Seed

**Files:**
- Create: `lib/workspaces/membership-bootstrap.ts`
- Modify: `prisma/seed.ts`
- Test: `tests/workspaces/membership-bootstrap.test.ts`

- [ ] **Step 1: Run focused membership tests**

Run: `pnpm exec vitest run tests/workspaces/membership-bootstrap.test.ts`

Expected: launch account constants encode `mjadmin@munjib.com` as `ADMIN` and `mjtrial@munjib.com` as `VIEWER`, workspace upserts are idempotent, and backfill loops through every workspace.

- [ ] **Step 2: Run seed if a database is available**

Run: `pnpm run db:seed`

Expected: seed completes. If no local database is available, record the database connectivity blocker and rely on unit tests plus Prisma validation for this PR.

### Task 5: Regression, Wiki Sync, And PR

**Files:**
- Modify: `wiki/Auth And Permissions Workflow.md`
- Modify: `wiki/Document Knowledge Model.md`
- Modify: `wiki/index.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`

- [ ] **Step 1: Run regression tests**

Run: `pnpm exec vitest run tests/auth/passwords.test.ts tests/workspaces/membership-bootstrap.test.ts tests/auth/config.test.ts tests/permissions/workspace.test.ts`

Expected: all listed tests pass.

- [ ] **Step 2: Check whitespace**

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 3: Run wiki maintenance**

Run:

```bash
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
pnpm wiki:lint
pnpm wiki:sync-check --staged
```

Expected: wiki commands complete, with only known pre-existing warnings if any.

- [ ] **Step 4: Publish**

Run:

```bash
git add <issue-145-files>
git commit -m "Add launch auth account foundation"
git push -u origin issue-145-launch-auth-accounts-foundation
gh pr create --draft --base main --head issue-145-launch-auth-accounts-foundation --title "[codex] Add launch auth account foundation" --body-file <body-file>
gh pr ready <pr-number>
```

Expected: PR exists against `main`, is marked ready for review, and references Issue #145.

- [ ] **Step 5: Review and CI follow-up**

Run: `gh pr view <pr-number> --json reviewDecision,statusCheckRollup,reviewRequests,url`

Expected: report review state and CI/check status. If checks fail or actionable review feedback exists, fix it on the same branch and repeat verification, wiki sync, commit, push, and PR inspection.
