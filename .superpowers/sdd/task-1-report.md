# Task 1 Report: preserve the generated Prisma client in the production runner

## Status

Issue #182 implementation and review follow-up are complete on
`codex/leaf182-prisma-runtime`, tracking `origin/issue-182-prisma-runtime`.
Initial implementation commit: `fd4d149`.

## Implemented

- Added a focused Docker contract test in `tests/docker/compose.test.ts`.
- Runner generation discovers the generated `.prisma/client` directory with a
  BusyBox-compatible `find ... -print | head -n 1` command, copies it to a
  build-only temporary path before `pnpm prune --prod`, and restores it to root
  `node_modules/.prisma/client` after pruning.
- Prisma CLI remains a development dependency; no production dependency change
  or pnpm virtual-store version is hard-coded.
- Added a build-time `node -e 'require("@prisma/client")'` guard after restore.
- Preserved the existing production prune, non-root UID, `HOME=/tmp`, and
  `COREPACK_HOME=/tmp/.cache/node/corepack` contracts.
- Updated only public-safe CI/CD wiki, index, manifest, and timeline evidence.

## Verification

Passed:

- RED: before the Dockerfile change, `pnpm exec vitest run tests/docker/compose.test.ts`
  failed 1/15 because the generated-client guard contract was absent.
- GREEN: initial focused suite passed 15/15; review follow-up Docker/CI suites
  passed 21/21 (`tests/docker/compose.test.ts` plus
  `tests/github-actions/ci-cd.test.ts`).
- `docker build --target runner --tag munjib-leaf182-prisma .` — passed after
  initial implementation and again after the BusyBox portability change. The
  runner generated Prisma, pruned production dependencies, restored the client,
  and completed the build-time require guard.
- Production image root and UID `10001:10001` Prisma require smokes — passed;
  non-root output confirmed `HOME=/tmp` and
  `COREPACK_HOME=/tmp/.cache/node/corepack`.
- `pnpm wiki:install-hooks` — passed.
- `pnpm wiki:sync-plan --staged` — passed with source and public wiki changes.
- `pnpm wiki:manifest` — passed.
- `pnpm wiki:lint` — passed with the existing unrelated warning for
  `wiki/designs/sidebar.md: [[Pasted Image 20260603131407_119.png]]`.
- `pnpm wiki:sync-check --staged` — passed.

Not passed / environment limitation:

- `pnpm exec tsc --noEmit --pretty false` could not complete in this local
  checkout because Prisma Client was not generated: the sandbox denied the
  existing local Prisma engine-cache timestamp update, and the fallback engine
  download was unavailable. The Docker build generated Prisma successfully and
  completed the full Next build; this limitation is unrelated to the changed
  Docker/test/wiki files.

## Concerns

- The Docker build emitted the repository's existing optional OpenTelemetry shim
  resolution warning; it did not fail the build and is unrelated to Issue #182.
- Discovery intentionally fails the image build if Prisma generation produces no
  `.prisma/client` directory, preventing a broken image from being published.
- No secret values, credentials, or remote runtime logs were read or emitted.

## Review follow-up

- Replaced Alpine/BusyBox-sensitive `find -print -quit` with
  `find ... -print | head -n 1` in Dockerfile and contract test.
- Re-ran the focused 21 tests, runner-target Docker build, root/non-root image
  require smokes, and all wiki gates; results are recorded above.
