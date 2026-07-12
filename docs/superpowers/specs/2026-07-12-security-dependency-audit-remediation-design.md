# Production Dependency Audit Remediation Design

**Tracking:** Issue #171 · remote branch `issue-171-security-audit-remediation`

## Objective

Make `pnpm audit --prod` return zero vulnerabilities for the exact Issue #157
runtime graph without suppressing advisories, weakening the audit command, or
changing the Next.js 15.5.18 runtime contract.

## Current findings

The frozen Issue #157 graph reports four moderate transitive findings:

- `postcss` below 8.5.10 through Next.js
- `uuid` below 11.1.1 through NextAuth
- `brace-expansion` below 5.0.6 through Sentry tooling
- `@opentelemetry/core` below 2.8.0 through Sentry/OpenTelemetry

These findings are release blockers, not exceptions. The exact advisory gate
for `next@15.5.18` remains a separate zero-result check.

## Recommended approach

Use exact `pnpm.overrides` entries for the smallest patched versions that remain
compatible with the existing parent packages. The lockfile must resolve only the
patched versions on production paths. Add focused compatibility contracts for
NextAuth JWT UUID generation, Sentry/OpenTelemetry module loading, and the
existing Next build/auth/RSC smoke. Keep the production audit command unchanged.

If an override fails a compatibility check, replace it with the smallest direct
parent upgrade that supplies the patched transitive version and rerun the same
contracts. No advisory allowlist, `--audit-level` filter, or blanket suppression
is permitted.

## Verification and rollback

The branch must pass `pnpm install --frozen-lockfile`, `pnpm audit --prod`, the
full TypeScript/Vitest/build suite, runner/tools Docker builds, and the Issue #157
auth/RSC smoke. A failed compatibility test or nonzero audit result blocks the
branch. Rollback is a revert of the override/parent upgrade commit; the existing
Issue #157 exact runtime pin and advisory gate remain unchanged.

## Disclosure boundary

GitHub-visible issue and PR text contain only package names, patched-version
contracts, commands, and outcomes. No credentials, private topology, advisory
response bodies, exploit payloads, or incident evidence are recorded.
