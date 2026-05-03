---
title: Feature Start Workflow Design
date: 2026-05-04
status: approved-for-review
scope: Add a guided workflow that requires a GitHub issue before new feature work and creates a feature branch from main when appropriate.
---

# Feature Start Workflow Design

## Goal

Systematize the project rule that new feature implementation must start with a GitHub issue. The workflow should also create a dedicated branch when the developer is currently on `main`, while preserving existing feature branches and worktrees.

The first version should be a practical guardrail, not a blocking commit hook. It should make the expected start-of-feature path easy to run and easy to document without making offline work or GitHub authentication failures impossible to recover from.

## Current State

The repository already has wiki-first lookup rules and commit-time wiki sync automation:

- `AGENTS.md` requires agents to read `wiki/index.md` or run `pnpm wiki:find "<topic>"` before broad source search.
- `pnpm wiki:sync-plan --staged` proposes candidate wiki pages to review before committing source changes.
- `pnpm wiki:sync-check --staged` fails when staged source changes have no staged wiki maintenance file.
- `.githooks/pre-commit` runs the sync check and wiki lint.

These checks operate near commit time. They do not define a required start-of-feature workflow, do not create GitHub issues, and do not help developers choose whether to create a branch.

## Chosen Approach

Add a `wiki:feature-start` command backed by `scripts/wiki/feature-start.ts`.

The command will:

1. Accept a feature title from the command line.
2. Build a GitHub issue body from a local template.
3. Try to create the issue with `gh issue create`.
4. Parse the created issue number and URL from `gh` output.
5. If the current branch is `main`, create and switch to `issue-<number>-<slug>`.
6. If the current branch is not `main`, keep the current branch and print the issue URL.
7. If `gh` is unavailable, unauthenticated, or fails, print the title/body template and branch name guidance for manual issue creation.

This matches the selected policy:

- Issue creation: prefer `gh issue create`; fallback to a manual template.
- Branch creation: create a new branch only when currently on `main`.
- Enforcement level: documented and guided by a command, not enforced by a hook.

## Verification

After implementation, run:

```bash
pnpm exec vitest run tests/wiki/feature-start.test.ts
pnpm wiki:manifest
pnpm wiki:lint
```

If source files are staged for commit, also run:

```bash
pnpm wiki:sync-plan --staged
pnpm wiki:sync-check --staged
```
