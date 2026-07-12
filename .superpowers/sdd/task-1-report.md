# Task 1 Report: strict secret-file and deployment runtime validation

## Status

Complete on branch `codex/leaf1-security-auth-runtime`.

Commit: `1e967ab` (`feat(auth): validate fail-closed runtime`)

## Implemented

- Added `parseDeploymentEnvironment()` with strict development/staging/production parsing.
- Added `readStrictSecretFile()` and `StrictSecretFileError`:
  - fixed `/run/secrets/<single-component>` path allowlist;
  - parent `lstat` checks for symlinks, directory shape, and group/world writability;
  - final-component `O_NOFOLLOW | O_CLOEXEC` open;
  - same-descriptor `fstat` checks for regular file, inode race, link count, effective owner, exact `0400` mode, and bounded non-empty size;
  - exact-size reads plus one-byte growth detection;
  - strict UTF-8/content validation for NUL, BOM, controls, newline, and edge whitespace;
  - stable non-sensitive error codes and guaranteed descriptor close.
- Added `inspectAuthRuntimeEnv()` / `assertValidAuthRuntimeEnv()`:
  - production/staging file-only secret contract and forbidden direct secret env values;
  - generated canonical base64url secret checks, fallback detection, and low-entropy rejection;
  - canonical origin, HTTPS, Secure-cookie, development-login, Google file-backed secret, and signup gates;
  - explicit development fixture support.
- Added HMAC-SHA-256 `deriveAuthRuntimeSubkey()` with domain separation.
- Added focused runtime/parser/derivation tests and strict-reader contract tests.
- Added the public-safe auth runtime wiki delta, wiki log entry, and regenerated manifest.

## Verification

Passed:

- `pnpm exec vitest run tests/security/strict-secret-file.test.ts tests/auth/runtime.test.ts` — 15 passed, 1 environment-gated skip.
- `pnpm exec tsc --noEmit`
- `pnpm wiki:install-hooks`
- `pnpm wiki:sync-plan --staged`
- `pnpm wiki:manifest`
- `pnpm wiki:lint` (existing warning only: unresolved `[[Pasted Image 20260603131407_119.png]]` in `wiki/designs/sidebar.md`)
- `pnpm wiki:sync-check --staged`
- commit hook repeated wiki sync-check and wiki lint successfully.

The full `pnpm exec vitest run` suite was also attempted. It produced 881 passing tests and 125 pre-existing fixture failures because this checkout has no `DATABASE_URL`; the failures are Prisma initialization errors from `tests/setup/prisma.ts`, unrelated to Task 1.

## Concerns / handoff

- The valid `/run/secrets` reader integration case is skipped when `/run/secrets` is absent in the local environment; deployment-image tests should exercise a real owner/mode-checked file.
- No secrets, secret bytes, paths, metadata, or digests are emitted by the new error paths.
- The existing `lib/auth/config.ts` still owns the legacy NextAuth environment resolution; later tasks should wire this validated runtime contract into that consumer.

## Review follow-up

Commit: `cdbf467` (`fix(auth): harden strict secret validation coverage`)

- Expanded `tests/security/strict-secret-file.test.ts` from the environment-gated smoke case to deterministic coverage for final/parent symlinks, untrusted parents, path swaps, non-regular files, link count, owner, exact mode, zero/oversize bounds, short reads, growth, same-FD success, all content rejection classes, and non-disclosure.
- Tightened content validation to reject every Unicode C1 control (`U+0080`-`U+009F`). `TextDecoder` now preserves a leading UTF-8 BOM so the reader can reject it instead of silently normalizing it away.
- Final verification: `pnpm exec vitest run tests/security/strict-secret-file.test.ts tests/auth/runtime.test.ts` (76 passed); `pnpm exec tsc --noEmit`; `pnpm wiki:install-hooks`; `pnpm wiki:sync-plan --staged`; `pnpm wiki:manifest`; `pnpm wiki:lint` (existing sidebar warning only); `pnpm wiki:sync-check --staged`.
