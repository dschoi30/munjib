# Task 1 Report: preserve the generated Prisma client in the production runner

## Status

Implementation complete on branch `codex/leaf182-prisma-runtime` for Issue #182.
The branch is ready to commit and push as `issue-182-prisma-runtime`.

## Implemented

- Added a focused Docker contract test in `tests/docker/compose.test.ts`.
- Runner generation now discovers the generated `.prisma/client` directory with
  `find`, copies it to a build-only temporary path before `pnpm prune --prod`,
  and restores it to root `node_modules/.prisma/client` after pruning.
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
- GREEN: after the Dockerfile change, the same focused suite passed 15/15.
- Relevant Docker/CI contracts: `pnpm exec vitest run tests/docker/compose.test.ts tests/github-actions/ci-cd.test.ts` — 21/21 passed.
- `docker build --target runner --tag munjib-leaf182-prisma .` — passed; the
  runner build generated Prisma, pruned production dependencies, restored the
  client, and completed the build-time require guard.
- `docker run --rm --entrypoint node munjib-leaf182-prisma -e
  'require("@prisma/client")'` — passed (`prisma-client-require-ok`).
- Same require smoke under UID `10001:10001` — passed, with `HOME=/tmp` and
  `COREPACK_HOME=/tmp/.cache/node/corepack` preserved.
- `pnpm wiki:install-hooks` — passed.
- `pnpm wiki:sync-plan --staged` — passed.
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
- The version-agnostic discovery intentionally fails the image build if Prisma
  generation produces no `.prisma/client` directory, preventing a broken image
  from being published.
- No secret values, credentials, or remote runtime logs were read or emitted.
