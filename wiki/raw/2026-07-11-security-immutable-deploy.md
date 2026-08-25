# Security Immutable Deployment Implementation Plan

**Tracking:** Parent Issue #154 · Issue #167 · remote branch `issue-167-security-immutable-deploy` · Leaf 13A child Issue #169 / `issue-169-delivery-substrate`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Use a fresh implementer for every implementation task, followed by a plan-compliance reviewer and a code-quality reviewer. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Deliver the P0 least-authority release substrate first, use it to deploy the ordered Leaf 3 -> Leaf 1 -> Leaf 4 chain, and then activate one exact-digest private runtime with separated database authority, monotonic capabilities, crash-safe promotion, rescan, rollback, and independently compatible recovery.

**Architecture:** Leaf 13 is one P0 parent with two separately reviewed and deployed child releases. Leaf 13A installs a fixed unprivileged SSH submit frontend and a root systemd socket-activated broker, but does not deploy or restart the application, mutate PostgreSQL or Caddy, promote a floor, or write application/recovery pointers. Leaves 3, 1, and 4 are then built and deployed through the 13A pre-floor operation in that order. Leaf 13B extends the same broker contract with exact-digest migration, blue/green promotion, private bindings, owner-bound capabilities, and independently qualified recovery. One branch and one PR always equal one production deploy unit.

**Tech Stack:** Native ARM64 Docker/BuildKit, static Go standard-library binaries, GitHub Actions, GitHub artifact attestations and Sigstore DSSE, GHCR OCI artifacts, native OpenSSH, systemd socket activation, Docker Compose, Caddy, PostgreSQL/Prisma, TypeScript/Vitest, shell contract tests, and purpose-bound KMS signatures.

## Global Constraints

- Priority is P0. Leaf 13A blocks P0 Leaves 3, 1, and 4. Leaf 13B blocks P0 Leaf 2 and every later schema/data-changing release.
- Public titles are exactly:
  - Parent: [Security P0] Establish immutable delivery and runtime gates
  - 13A child: [Security P0] Install least-authority delivery substrate
  - 13B child: [Security P0] Activate immutable private runtime
- Keep the local main checkout untouched. Create each child issue before implementation, use an isolated worktree from verified origin/main, and keep the restricted planning commit out of every implementation branch.
- One child branch and one PR are one deploy unit. The Leaf 13 parent remains open until 13A, deployed Leaves 3/1/4, 13B, recovery qualification, and the operator gate have durable production evidence.
- Leaf 13A merge removes/disables the legacy mutable deploy path. It does not deploy, rebuild, restart, or recreate the running application. There is an intentional fail-closed deployment pause between removal of the legacy path and verified installation of the new substrate.
- Root ownership is not privilege elevation. A root-owned program remains unprivileged when OpenSSH executes it as the deploy account. The privilege boundary is the root systemd broker reached through one protected Unix socket.
- The SSH account is munjib-deploy. Its password is locked. Its authorized-key file is root-owned and not writable by the account. It has a valid /bin/sh shell only because OpenSSH must execute an external ForceCommand; PermitTTY, forwarding, tunneling, environment injection, and every interactive capability are disabled. Do not configure nologin or false as the shell because that prevents the external ForceCommand.
- The forced command /usr/local/libexec/munjib-release-submit runs as munjib-deploy, has no setuid/setgid bit or file capability, cannot access Docker, and cannot invoke a privileged helper directly.
- The root broker /usr/local/libexec/munjib-release-broker is activated by munjib-release-broker.socket. The socket is root:munjib-release-submit mode 0620. Only munjib-deploy belongs to the dedicated group.
- /usr/local/libexec/munjib-release-dispatch is not an SSH ForceCommand and is not a directly exposed privilege boundary. Any sibling plan using that older name must be interpreted and updated as a signed broker operation reached only through submit -> protected socket -> peer-verified broker.
- The broker obtains SO_PEERCRED from the accepted Unix connection and requires the exact numeric UID stored in root-owned deploy-principal-v1.json. Group membership alone is insufficient. Every request independently revalidates the complete canonical envelope, DSSE, evidence, trust policy, sequence, nonce, expiry, expected state, and operation schema.
- The submit frontend is an untrusted transport adapter. It forwards exactly one bounded frame and returns one bounded public-safe response. The broker never accepts parsed claims or a verification decision from the frontend.
- There is no sudoers entry, setuid/setgid executable, root SSH login, deploy Docker-group/socket access, broad helper command, arbitrary path/environment, or arbitrary Compose/systemd argument.
- Broker input is one four-byte big-endian length followed by at most 4 MiB. Output is at most 64 KiB. Socket backlog is 8, verification concurrency is 4, every read/write deadline is 10 seconds, and incomplete/extra frames fail before privilege use.
- The broker holds /run/lock/munjib-security-state.lock for every state-changing operation. Deploy, rollback, rescan, evidence refresh, capability publication, backup, restore, attachment policy, edge activation, and destructive purge use that same flock inode. No stale-lock deletion protocol exists.
- The broker service is root but systemd-confined: NoNewPrivileges=yes, PrivateTmp=yes, PrivateDevices=yes, ProtectHome=yes, ProtectSystem=strict, ProtectClock=yes, ProtectHostname=yes, ProtectKernelTunables=yes, ProtectKernelModules=yes, ProtectControlGroups=yes, LockPersonality=yes, MemoryDenyWriteExecute=yes, RestrictRealtime=yes, RestrictSUIDSGID=yes, RestrictAddressFamilies=AF_UNIX, IPAddressDeny=any, UMask=0077, CapabilityBoundingSet=CAP_CHOWN CAP_DAC_OVERRIDE CAP_FOWNER CAP_SETGID CAP_SETUID, empty AmbientCapabilities, and ReadWritePaths=/var/lib/munjib /run/munjib /run/lock /etc/munjib /etc/caddy /etc/systemd/system /etc/ssh/sshd_config.d /usr/local/libexec /usr/lib/tmpfiles.d. Tests reject a broader unit.
- Production never executes a script, Compose file, Caddy fragment, systemd unit, SQL file, installer, or binary from a Git checkout, deploy-user home, application container, or mutable unprivileged path with privilege.
- The host contains no Git checkout or repository credential after 13A and performs no source build. Root-held private GHCR access, if required, is registry-only read:packages authority with no repository-content scope.
- A release envelope binds exact application/host-bundle digests, numeric repository/owner identities, commit, protected ref, workflow path/digest, run id/attempt, monotonic sequence, nonce, expiry, expected state, capability fragments, migration history, scan/SBOM/provenance/test evidence, and recovery requirements.
- Synchronized host time is an admission requirement. An unhealthy/missing synchronization source, receipt/envelope outside its exact validity interval, or clock step that makes ordering ambiguous fails before replay/sequence mutation.
- Real DSSE or artifact-attestation bundles are evidence. Self-asserted booleans are not. The broker invokes only a manifest-pinned official verifier with fixed arguments or its own fixed verifier and validates returned claims.
- The signer signs only after cryptographically consuming exact test, scan, SBOM, provenance, migration-ledger, owner-map, capability, and host-bundle-manifest inputs.
- GitHub OIDC trust binds numeric repository/owner identities plus controlled source/ref/workflow/signer digests. The 2026 immutable-identity transition is an explicit overlapping trust generation; repository-name matching alone never authorizes release.
- KMS trust is versioned and purpose-bound. Rotation overlaps old/new trust, republishes every live dynamic capability, and retires old trust only after current/rollback/recovery converge. Historical journal/backup verification roots are retained indefinitely.
- Until protected main/rulesets, required review/checks, protected production environment, selected-action enforcement, SHA-pin enforcement, package permissions, and platform security scanning are live, production requires a second KMS approval unavailable to GitHub Actions. main alone is not release authorization.
- All application, PostgreSQL/pgvector, restore/tool, edge, and host-bundle artifacts are addressed by digest. Tags are lookup hints only.
- current.json, rollback.json, recovery-candidate.json, and recovery.json are distinct canonical regular files. Current and recovery digests, source commits, floor hashes, and evidence generations need not be equal.
- Recovery must satisfy current.recoveryRequirements minimum capabilities, successful migration prefix, required artifact set, evidence freshness, oldest-retained-point drill, and offline mirror. Equal digest without independent recovery evidence fails. Different digest with a valid compatibility proof passes.
- Normal deploy/rollback never writes recovery.json.
- Capability floors are monotonic. A release cannot remove/lower a capability, reuse an id for changed semantics, or carry forward a changed owner selector without an owner version increase.
- Leaf 13A creates the canonical capability schema, nine-tuple reservation policy, empty owner registry, and empty deployed-leaf registry. It publishes no application capability or immutable-private-runtime fragment.
- Leaf 13B creates immutable-private-runtime@1 only after every referenced implementation/evidence test exists and passes. The exact signed candidate publishes fragment and owner transition before traffic switch.
- Migration history is append-only. Successful production migration names/checksums must be an exact prefix of image history. Failed/unresolved rows, edited checksums, or a nonmonotonic pending name fail admission.
- Migrator/restore/bootstrap connections discard caller libpq authority and set PGOPTIONS=-c search_path=pg_catalog,public,munjib_extensions. Only the migration discriminator adds role=munjib_schema_owner.
- Web is loopback-only behind Caddy; PostgreSQL is internal-only. No public IPv4/IPv6 listener exists for 3000, 5432, 55432, 2019, 2375, 2376, 9229, or 11434.
- Web runs non-root, read-only, capability-dropped, no-new-privileges, with tmpfs-only writes and one file-backed app credential. It is never owner, superuser, migrator, journal owner, restore loader, or backup principal.
- Candidate promotion is blue/green. Current Web remains live while candidate side effects and mutable attachments are disabled. Pre-switch failure deletes the candidate. Post-floor rollback requires the prior generation to satisfy the floor; otherwise maintenance and signed fix-forward are mandatory.
- Every workflow action is pinned to an exact peeled commit SHA and explicit repository. Tag objects/fallback are invalid. The reviewed inventory starts with:
  - actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5
  - actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020
  - actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02
  - actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093
  - docker/login-action@c94ce9fb468520275223c153574b00df6fe4bcc9
  - docker/setup-buildx-action@8d2750c68a42422c14e847fe6c8ac0403b4cbd6f
  - docker/build-push-action@10e90e3645eae34f1e60eeb005ba3a3d33f178e8
  - actions/attest@a1948c3f048ba23858d222213b7c278aabede763
  - aquasecurity/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25
  - anchore/sbom-action@e22c389904149dbc22b58101806040fa8d37a610
- Go is Docker-only/native ARM64. The builder is golang:1.26.5-bookworm@sha256:d6ba18962125562d4697fff9fd983a32083cb9f8b65fd8784c849e340a8657fa. No host Go, QEMU, x64, self-hosted, or setup-go fallback is authoritative.
- Go delivery code uses only the standard library. go.mod has no require directive. Do not create go.sum without real dependency-derived content. Third-party Go modules require separate approval.
- The application builder is node:22-alpine@sha256:d51cff3fa44ab8a368ae8708ae974480165be1b699b19527b7c0d2523433b271. PostgreSQL/pgvector is pgvector/pgvector:0.8.2-pg16@sha256:b759abdeb144e561a4dbfe9863b5ac58cdd3fb6350cee7e68035baffdbca9693. Release gates may block these exact digests; they never fall back to a tag.
- ubuntu-24.04-arm is mandatory for native CI smoke/publish. Runner unavailability blocks release.
- Before retiring legacy credentials, run quiet remanence checks over shell history, cloud-init, journal, stopped-container environments, image layers, and build cache. Never print values.
- Every source commit includes a real public-safe wiki delta and repeats:

~~~bash
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git diff --cached --check
~~~

- Before every push, run the master plan's nonprinting branch-range disclosure guard. Restricted plans/specs, private topology/evidence, credentials, raw environment/logs/responses never enter implementation commits or PR text.

## Release and Dependency Split

| Release | Priority | Purpose | May mutate running app/data? | Dependency |
|---|---|---|---:|---|
| Leaf 13A | P0 | Submit frontend, root broker/socket, verifier, strict installer, trust/policy, pre-floor operation | No during substrate install | Restricted recovery Phase A evidence |
| Leaf 3 | P0 | Security-critical runtime upgrade | Yes, through 13A only | Deployed 13A |
| Leaf 1 | P0 | Auth fail-closed runtime | Yes, through 13A only | 13A + deployed Leaf 3 |
| Leaf 4 | P0 | Zero ambient media/output egress | Yes, through 13A only | 13A + deployed Leaves 3/1 |
| Leaf 13B | P0 | Private runtime, DB roles, floor, rollback/rescan/recovery | Yes | 13A + deployed Leaves 3/1/4 |

Leaf 13A merge disables legacy mutable deployment but does not run a new application operation. The substrate is built from the protected main merge commit, attested, externally verified, receipt-approved, installed, and tested with signed VERIFY_ONLY before any later leaf uses it.

## Capability and Protected-Artifact Registry

| Leaf | Capability id | v1 |
|---:|---|---:|
| 1 | auth-runtime-fail-closed | 1 |
| 2 | security-journal-auth-tombstones | 1 |
| 3 | secure-next-runtime | 1 |
| 4 | zero-ambient-media-egress | 1 |
| 5 | active-resource-boundaries | 1 |
| 6 | document-acl-closure | 1 |
| 7 | invite-signup-gate | 1 |
| 8 | issue-08-auth-abuse | 1 |
| 9 | ai-history-reauthorization | 1 |
| 10 | issue-10-ai-provider-policy | 1 |
| 11 | attachment-integrity-lifecycle | 1 |
| 12 | edge-minimal-csp-nonce | 1 |
| 13 | immutable-private-runtime | 1 |
| 14 | encrypted-recovery-readiness | 1 |

The owner schema supports only FULL_PATH and NORMALIZED_PROJECTION. Canonical keys are path:<normalized-path> and projection:<projection-id>. Globs, directories, aliases, dot traversal, Unicode/case alternatives, duplicate keys/projections, or a FULL_PATH claim over a projection source fail closed.

| Projection id | Owner | Source paths | Selection |
|---|---|---|---|
| next-runtime-dependencies-v1 | secure-next-runtime | package.json, pnpm-lock.yaml | Exact next/react/react-dom manifest and complete sorted reachable lock graph |
| immutable-runtime-security-v1 | immutable-private-runtime | docker-compose.yml | Sorted listeners, identities, read-only/capability/security/network/secret/config/credential boundaries |

package.json, pnpm-lock.yaml, and docker-compose.yml are never FULL_PATH owners. Projection parsing rejects aliases, merge/duplicate keys, environment interpolation, scalar ambiguity, and nondeterministic ordering.

The fixed reservation policy contains exactly nine tuples:

| Producer | Reserved owner | Reserved path |
|---|---|---|
| auth-runtime-fail-closed | security-journal-auth-tombstones | lib/auth/downstream/leaf2.ts |
| auth-runtime-fail-closed | zero-ambient-media-egress | lib/auth/downstream/leaf4.ts |
| auth-runtime-fail-closed | issue-08-auth-abuse | lib/auth/downstream/leaf8.ts |
| auth-runtime-fail-closed | invite-signup-gate | lib/auth/downstream/leaf7.ts |
| active-resource-boundaries | document-acl-closure | lib/authorization/downstream/leaf6-document-access.ts |
| document-acl-closure | attachment-integrity-lifecycle | lib/documents/downstream/leaf11-attachments.ts |
| active-resource-boundaries | encrypted-recovery-readiness | lib/retention/downstream/leaf14-production-readiness.ts |
| zero-ambient-media-egress | attachment-integrity-lifecycle | components/markdown/downstream/leaf11-external-image-import.tsx |
| invite-signup-gate | edge-minimal-csp-nonce | lib/security/downstream/leaf12-edge-middleware.ts |

An absent selector becomes RESERVED v0 only when the signed producer candidate contains the exact regular baseline and the tuple is listed. The producer may never later modify/delete/activate/reassign it. Only the named owner may change content and atomically publish v1 ACTIVE.

Leaf 7 creates lib/security/downstream/leaf12-edge-middleware.ts as passive v0. middleware.ts remains Leaf 7-owned, including Node runtime and matcher. Leaf 12 changes only the reserved seam.

Chronology tests start from empty 13A, deploy Leaf 3 with no reservation, require Leaf 1's four baselines, Leaf 4's activation plus external-image baseline, Leaf 5's two baselines, Leaf 6's activation plus attachment baseline, and Leaf 7's Leaf 12 seam. Leaves 2/7/8/11/12/14 activate only their reservation.

## Migration Ledger

| Leaf | Migration |
|---:|---|
| 2 | 20260712000000_security_journal_and_auth_tombstones |
| 2 support | 20260712003000_support_access_capability |
| 5 | 20260712010000_active_resource_boundaries |
| 8 | 20260712020000_add_auth_abuse_and_session_registry |
| 7 | 20260712030000_add_secure_workspace_invitations |
| 9 | 20260712040000_ai_history_reauthorization |
| 11 v1 | 20260712050000_attachment_lifecycle_transition |
| 10 | 20260712060000_ai_provider_policy |

Leaf 11 v2 allocates only when its child starts, above main. migration-ledger.json is shared and is not a Leaf 13 FULL_PATH owner.

## Leaf 13A Source Map

**Static standard-library sources:**

- go.mod
- cmd/munjib-core-bootstrap/main.go
- cmd/munjib-release-submit/main.go
- cmd/munjib-release-broker/main.go
- cmd/munjib-release-verify/main.go
- cmd/munjib-host-bundle-install/main.go
- cmd/munjib-release-reconcile/main.go
- cmd/munjib-substrate-state/main.go
- internal/delivery/audit.go
- internal/delivery/attestation.go
- internal/delivery/canonicaljson.go
- internal/delivery/envelope.go
- internal/delivery/hostbundle.go
- internal/delivery/install.go
- internal/delivery/peercred_linux.go
- internal/delivery/state.go
- internal/delivery/canonicaljson_test.go
- internal/delivery/envelope_test.go
- internal/delivery/hostbundle_test.go
- internal/delivery/peercred_linux_test.go
- internal/delivery/state_test.go

Do not create go.sum unless a separately approved dependency creates real checksum content.

**Bundle/trust/systemd/SSH sources:**

- deploy/delivery/Dockerfile.core-deploy
- deploy/delivery/core-deploy-v1/manifest.template.json
- deploy/delivery/dispatcher-policy-v1.json
- deploy/delivery/host-bundle-policy-v1.json
- deploy/delivery/trust-policy-v1.json
- deploy/delivery/tool-pins-v1.json
- deploy/delivery/deploy-principal-policy-v1.json
- deploy/delivery/sshd-munjib-deploy.conf
- deploy/delivery/munjib-security-state-lock.tmpfiles
- deploy/systemd/munjib-release-broker.socket
- deploy/systemd/munjib-release-broker.service
- deploy/systemd/munjib-release-reconcile.service
- scripts/deploy/build-core-delivery-bundle.ts
- scripts/deploy/verify-release-envelope.ts
- scripts/deploy/verify-attestation-bundle.ts
- scripts/deploy/verify-host-bundle.ts
- scripts/deploy/check-substrate-state.ts
- .github/workflows/core-delivery-substrate.yml

TypeScript verifiers are unprivileged CI reference/golden-vector tools. Privileged host operations never execute them.

The core manifest fixes these installation destinations:

| Source | Destination | Owner and mode |
|---|---|---|
| cmd/munjib-release-submit | /usr/local/libexec/munjib-release-submit | root:root 0755, no setuid/setgid/file capability |
| cmd/munjib-release-broker | /usr/local/libexec/munjib-release-broker | root:root 0750 |
| cmd/munjib-release-verify | /usr/local/libexec/munjib-release-verify | root:root 0750 |
| cmd/munjib-host-bundle-install | /usr/local/libexec/munjib-host-bundle-install | root:root 0750 |
| cmd/munjib-release-reconcile | /usr/local/libexec/munjib-release-reconcile | root:root 0750 |
| cmd/munjib-substrate-state | /usr/local/libexec/munjib-substrate-state | root:root 0750 |
| dispatcher-policy-v1.json | /etc/munjib/delivery/dispatcher-policy-v1.json | root:root 0644 |
| host-bundle-policy-v1.json | /etc/munjib/delivery/host-bundle-policy-v1.json | root:root 0644 |
| trust-policy-v1.json | /etc/munjib/delivery/trust-policy-v1.json | root:root 0644 |
| deploy-principal-policy-v1.json | /etc/munjib/delivery/deploy-principal-policy-v1.json | root:root 0644 |
| sshd-munjib-deploy.conf | /etc/ssh/sshd_config.d/60-munjib-deploy.conf | root:root 0644 |
| munjib-release-broker.socket | /etc/systemd/system/munjib-release-broker.socket | root:root 0644 |
| munjib-release-broker.service | /etc/systemd/system/munjib-release-broker.service | root:root 0644 |
| munjib-release-reconcile.service | /etc/systemd/system/munjib-release-reconcile.service | root:root 0644 |
| munjib-security-state-lock.tmpfiles | /usr/lib/tmpfiles.d/munjib-security-state-lock.conf | root:root 0644 |

The externally verified standalone bootstrap executes from /var/lib/munjib/delivery/bootstrap/sha256-$OCI_HEX/munjib-core-bootstrap and is never trusted from a checkout. Bootstrap generates /etc/munjib/delivery/deploy-principal-v1.json as root:root 0600 and installs the already approved public key at /etc/munjib/ssh/authorized_keys/munjib-deploy as root:root 0600. /etc/munjib/trust/bootstrap-kms-current.pem is root:root 0644 and arrives through the independent trust channel, never from core-deploy-v1.

**Authority tests:**

- tests/deploy/bootstrap-root-of-trust.test.ts
- tests/deploy/core-delivery-bundle.test.ts
- tests/deploy/release-envelope.test.ts
- tests/deploy/attestation-verification.test.ts
- tests/deploy/host-bundle-parser.test.ts
- tests/deploy/delivery-substrate.test.ts
- tests/deploy/delivery-substrate-delta.test.ts
- tests/deploy/release-submit.test.ts
- tests/deploy/release-broker-peer-credential.test.ts
- tests/deploy/release-broker-revalidation.test.ts
- tests/deploy/release-broker-flood.test.ts
- tests/deploy/release-systemd-contract.test.ts
- tests/deploy/release-sshd-contract.test.ts
- tests/deploy/verify-only-bootstrap.test.ts
- tests/security/deploy-authority-contract.test.ts
- tests/github-actions/core-delivery-substrate.test.ts

**Pre-floor sources:**

- Modify .dockerignore, Dockerfile, .github/workflows/ci-cd.yml
- Create docker-compose.prefloor-candidate.yml
- Create deploy/security/capability-fragment-schema-v1.json
- Create deploy/security/deployed-leaves.json
- Create deploy/security/protected-artifact-owners.json
- Create deploy/security/protected-artifact-owner-schema-v1.json
- Create deploy/security/protected-artifact-policy-v1.json
- Create lib/deploy/release-record.ts
- Create lib/deploy/prefloor-release.ts
- Create scripts/deploy/check-build-context.ts
- Create scripts/deploy/check-action-pins.ts
- Create scripts/deploy/check-protected-artifact-owners.ts
- Create scripts/deploy/project-protected-artifacts.ts
- Create scripts/deploy/qualify-prefloor-candidate.ts
- Create scripts/deploy/reconcile-promotion.ts
- Create tests/docker/build-context.test.ts
- Create tests/deploy/prefloor-release.test.ts
- Create tests/deploy/protected-artifact-owners.test.ts
- Create tests/deploy/protected-artifact-projections.test.ts
- Create tests/deploy/promotion-crash-consistency.test.ts
- Modify tests/github-actions/ci-cd.test.ts

## Task 1: Implement the Leaf 13A Submit/Broker Substrate

**Files:**

- Create every static/bundle/systemd/SSH/authority file above.
- Create docs/runbooks/delivery-substrate.md.
- Modify wiki/CI CD And Monitoring Workflow.md and wiki/log.md.
- Regenerate wiki/manifest.json.

**Interfaces:**

- Consumes: verified origin/main, Leaf 13 parent number from /private/tmp/munjib-security-leaf-map.tsv, one root-owned authorized public key, independently distributed bootstrap KMS public key, and restricted recovery Phase A evidence at rollout.
- Produces: deterministic core-deploy-v1; standalone bootstrap; unprivileged submit; root socket broker; strict installer; signed VERIFY_ONLY; no-mutation comparison.

- [ ] **Step 1: Create the generic P0 child, isolated worktree, and remote branch**

~~~bash
git fetch origin main
test "$(git -C /Users/developer/Documents/munjib branch --show-current)" = main
git worktree add -b codex/leaf13a-bootstrap /private/tmp/munjib-leaf13a origin/main
cd /private/tmp/munjib-leaf13a
leaf13_parent="$(awk -F '\t' '$1 == 13 { print $2 }' /private/tmp/munjib-security-leaf-map.tsv)"
test -n "$leaf13_parent"
feature_output="$(pnpm wiki:feature-start "[Security P0] Install least-authority delivery substrate")"
printf '%s\n' "$feature_output"
issue_url="$(printf '%s\n' "$feature_output" | rg -o 'https://github.com/[^ ]+/issues/[0-9]+' | head -n 1)"
issue_number="$(printf '%s\n' "$issue_url" | awk -F/ '{ print $NF }')"
test -n "$issue_number"
git branch -m "issue-$issue_number-delivery-substrate"
gh issue edit "$issue_number" --body "Parent: #$leaf13_parent
Priority: P0
Program child: Leaf 13A
Dependencies: parent security-program readiness gate
Acceptance: A least-authority delivery substrate is reviewed and installed without changing the running application service.

Detailed findings and operational evidence remain in restricted local records."
git push -u origin HEAD
pnpm wiki:find "CI CD deployment"
~~~

Expected: one generic P0 child/remote branch exists; main stays on main; the worktree contains no restricted planning commit.

- [ ] **Step 2: Write RED privilege, bootstrap, bundle, SSH, systemd, flood, and workflow tests**

Reject:

- submit setuid/setgid/file capability/root/Docker/helper/path/env/argument; multiple/oversize/partial frames; missing deadlines;
- nologin/false with external ForceCommand, password/writable key/shell/PTY/forwarding/tunnel/environment/alternate command;
- socket owner/group/mode drift, unexpected group member, missing exact-UID policy, or broker trusting group without SO_PEERCRED;
- frontend claims accepted by broker, skipped full revalidation on any operation, wrong UID, stale/lower/replayed/same-run-changed/unknown request;
- unbounded concurrency/memory/lock starvation or sensitive response;
- broader systemd capabilities/writes/network;
- archive traversal/duplicate/extra/trailing/symlink/hardlink/sparse/directory/FIFO/socket/device/oversize/metadata mismatch;
- bootstrap before external digest/receipt verification or self-verification by newly installed verifier;
- activation before systemd-analyze verify/sshd -t;
- mutable/tag/wrong-repository action, QEMU/x64/self-hosted/host Go/third-party Go/mutable Go base/mutable SSH/deploy checkout/host checkout-build.

~~~bash
pnpm exec vitest run \
  tests/deploy/bootstrap-root-of-trust.test.ts \
  tests/deploy/core-delivery-bundle.test.ts \
  tests/deploy/release-envelope.test.ts \
  tests/deploy/attestation-verification.test.ts \
  tests/deploy/host-bundle-parser.test.ts \
  tests/deploy/delivery-substrate.test.ts \
  tests/deploy/delivery-substrate-delta.test.ts \
  tests/deploy/release-submit.test.ts \
  tests/deploy/release-broker-peer-credential.test.ts \
  tests/deploy/release-broker-revalidation.test.ts \
  tests/deploy/release-broker-flood.test.ts \
  tests/deploy/release-systemd-contract.test.ts \
  tests/deploy/release-sshd-contract.test.ts \
  tests/deploy/verify-only-bootstrap.test.ts \
  tests/security/deploy-authority-contract.test.ts \
  tests/github-actions/core-delivery-substrate.test.ts --reporter=dot
docker build --platform linux/arm64 --target test \
  -f deploy/delivery/Dockerfile.core-deploy .
~~~

Expected RED: missing submit/broker/socket/peer/full-revalidation/bootstrap/bundle contracts and missing pinned ARM64 test target.

- [ ] **Step 3: Implement the unprivileged submit and peer-verified root broker**

munjib-release-submit reads one bounded frame, connects only /run/munjib/release-broker.sock, forwards original bytes, returns one bounded response, scrubs environment, uses fixed deadlines, and executes nothing.

munjib-release-broker accepts systemd socket activation only, checks SO_PEERCRED exact UID, bounds concurrency/memory, acquires the shared lock for mutation, and independently revalidates the full request every time. Audit records contain operation/sequence/source/digests/policy/result/time only.

deploy-principal-v1.json is generated at bootstrap from numeric UID and bound by the receipt; it is never caller-supplied. VERIFY_ONLY performs peer/schema/DSSE/trust/evidence/nonce/sequence/expiry/state/policy validation and returns without filesystem/Docker/systemd/Caddy/DB/floor/pointer mutation.

~~~ini
[Socket]
ListenStream=/run/munjib/release-broker.sock
SocketUser=root
SocketGroup=munjib-release-submit
SocketMode=0620
Backlog=8
RemoveOnStop=yes
~~~

The SSH drop-in uses external ForceCommand, valid /bin/sh plumbing shell, locked password, root-owned key, no writable home config, no supplementary group except munjib-release-submit, and no interactive capability.

The bootstrap uses only fixed absolute account-tool paths and arguments: create system group munjib-release-submit; create system user munjib-deploy with primary group munjib-release-submit, home /var/lib/munjib-release-submit, and shell /bin/sh; lock its password; remove every supplementary group; require it absent from docker; create /etc/munjib/ssh/authorized_keys/munjib-deploy root:root 0600. It refuses an existing UID/group/home/shell mismatch.

The SSH drop-in content is:

~~~text
Match User munjib-deploy
    PubkeyAuthentication yes
    AuthenticationMethods publickey
    PasswordAuthentication no
    KbdInteractiveAuthentication no
    PermitTTY no
    DisableForwarding yes
    AllowTcpForwarding no
    AllowAgentForwarding no
    X11Forwarding no
    PermitTunnel no
    PermitOpen none
    PermitListen none
    PermitUserEnvironment no
    AuthorizedKeysFile /etc/munjib/ssh/authorized_keys/munjib-deploy
    ForceCommand /usr/local/libexec/munjib-release-submit
~~~

The socket unit content is:

~~~ini
[Unit]
Description=Munjib signed release broker socket

[Socket]
ListenStream=/run/munjib/release-broker.sock
SocketUser=root
SocketGroup=munjib-release-submit
SocketMode=0620
Backlog=8
RemoveOnStop=yes
FlushPending=yes
TriggerLimitIntervalSec=60s
TriggerLimitBurst=20
Service=munjib-release-broker.service

[Install]
WantedBy=sockets.target
~~~

The tmpfiles source creates /run/munjib as root:munjib-release-submit 0710 and /run/lock/munjib-security-state.lock as root:root 0600 before socket activation.

The broker service content is:

~~~ini
[Unit]
Description=Munjib signed release broker
Requires=munjib-release-broker.socket
After=local-fs.target

[Service]
Type=simple
User=root
Group=root
ExecStart=/usr/local/libexec/munjib-release-broker
NoNewPrivileges=yes
PrivateTmp=yes
PrivateDevices=yes
ProtectHome=yes
ProtectSystem=strict
ProtectClock=yes
ProtectHostname=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
LockPersonality=yes
MemoryDenyWriteExecute=yes
RestrictRealtime=yes
RestrictSUIDSGID=yes
RestrictAddressFamilies=AF_UNIX
IPAddressDeny=any
UMask=0077
CapabilityBoundingSet=CAP_CHOWN CAP_DAC_OVERRIDE CAP_FOWNER CAP_SETGID CAP_SETUID
AmbientCapabilities=
ReadWritePaths=/var/lib/munjib /run/munjib /run/lock /etc/munjib /etc/caddy /etc/systemd/system /etc/ssh/sshd_config.d /usr/local/libexec /usr/lib/tmpfiles.d
Restart=no
~~~

- [ ] **Step 4: Implement the standalone non-circular bootstrap and deterministic bundle**

Dockerfile starts from the exact Go ARM64 digest, copies only go.mod plus named cmd/internal sources, runs test target, and builds with:

~~~text
CGO_ENABLED=0
GOOS=linux
GOARCH=arm64
-trimpath
-buildvcs=false
-ldflags=-buildid=
-mod=readonly
~~~

Manifest lists only regular files with exact size/SHA/owner/group/mode/destination: standalone bootstrap, submit, broker, verifier, installer, reconciler, state oracle, policies, socket/service/reconcile units, sshd drop-in, tmpfiles.

Protected workstation verifies OCI/DSSE/numeric source/protected ref/workflow/signer/commit/hosted runner/manifest, then obtains a KMS receipt over format, purpose=munjib-core-bootstrap-v1, hostId, OCI/DSSE/manifest digests, source commit, workflow digest, nonce, issuedAt, expiresAt.

Host OS dd/stat/sha256sum/openssl creates root:root 0700 generation, no-follow/exclusive/dsync copies bounded regular single-link files, recomputes digests, verifies receipt with /etc/munjib/trust/bootstrap-kms-current.pem, closes inbox, and only then executes externally verified munjib-core-bootstrap. The new verifier never establishes its own trust.

- [ ] **Step 5: Validate candidates before activation and prove signed VERIFY_ONLY**

~~~bash
systemd-analyze verify \
  deploy/systemd/munjib-release-broker.socket \
  deploy/systemd/munjib-release-broker.service \
  deploy/systemd/munjib-release-reconcile.service
sshd -t
~~~

Tests validate a disposable candidate sshd config/namespace. Production stages/reopens files, validates, atomically installs, runs daemon-reload, activates socket/reconcile, and reloads sshd only after sshd -t. Failure restores prior substrate generation without app change.

Initial policy permits only signed VERIFY_ONLY. Send real OpenSSH -> unprivileged submit -> protected socket -> root broker; require exact peer UID/full broker revalidation and zero state delta beyond substrate allowlist. Only then activate full fixed policy.

- [ ] **Step 6: Run GREEN and deterministic two-build verification**

~~~bash
pnpm exec vitest run \
  tests/deploy/bootstrap-root-of-trust.test.ts \
  tests/deploy/core-delivery-bundle.test.ts \
  tests/deploy/release-envelope.test.ts \
  tests/deploy/attestation-verification.test.ts \
  tests/deploy/host-bundle-parser.test.ts \
  tests/deploy/delivery-substrate.test.ts \
  tests/deploy/delivery-substrate-delta.test.ts \
  tests/deploy/release-submit.test.ts \
  tests/deploy/release-broker-peer-credential.test.ts \
  tests/deploy/release-broker-revalidation.test.ts \
  tests/deploy/release-broker-flood.test.ts \
  tests/deploy/release-systemd-contract.test.ts \
  tests/deploy/release-sshd-contract.test.ts \
  tests/deploy/verify-only-bootstrap.test.ts \
  tests/security/deploy-authority-contract.test.ts \
  tests/github-actions/core-delivery-substrate.test.ts --reporter=dot
docker build --platform linux/arm64 --target test \
  -f deploy/delivery/Dockerfile.core-deploy .
docker build --platform linux/arm64 --target bundle \
  -f deploy/delivery/Dockerfile.core-deploy \
  --output type=oci,dest=/tmp/core-deploy-v1-a.oci .
docker build --platform linux/arm64 --target bundle \
  -f deploy/delivery/Dockerfile.core-deploy \
  --output type=oci,dest=/tmp/core-deploy-v1-b.oci .
pnpm exec tsx scripts/deploy/verify-host-bundle.ts \
  /tmp/core-deploy-v1-a.oci /tmp/core-deploy-v1-b.oci
pnpm exec tsc --noEmit --pretty false
git diff --check
~~~

Expected GREEN: identical manifests/layers; static linux/arm64 binaries; no third-party Go, host Go, QEMU, mutable action, sudo, setuid, root SSH, deploy Docker, or privileged checkout.

- [ ] **Step 7: Stage exact Task 1 files, run wiki/disclosure gates, and commit**

Update docs/runbooks/delivery-substrate.md, wiki/CI CD And Monitoring Workflow.md, wiki/log.md, then:

~~~bash
git add go.mod cmd/munjib-core-bootstrap/main.go cmd/munjib-release-submit/main.go \
  cmd/munjib-release-broker/main.go cmd/munjib-release-verify/main.go \
  cmd/munjib-host-bundle-install/main.go cmd/munjib-release-reconcile/main.go \
  cmd/munjib-substrate-state/main.go internal/delivery \
  deploy/delivery deploy/systemd/munjib-release-broker.socket \
  deploy/systemd/munjib-release-broker.service \
  deploy/systemd/munjib-release-reconcile.service \
  scripts/deploy/build-core-delivery-bundle.ts \
  scripts/deploy/verify-release-envelope.ts scripts/deploy/verify-attestation-bundle.ts \
  scripts/deploy/verify-host-bundle.ts scripts/deploy/check-substrate-state.ts \
  .github/workflows/core-delivery-substrate.yml \
  tests/deploy/bootstrap-root-of-trust.test.ts tests/deploy/core-delivery-bundle.test.ts \
  tests/deploy/release-envelope.test.ts tests/deploy/attestation-verification.test.ts \
  tests/deploy/host-bundle-parser.test.ts tests/deploy/delivery-substrate.test.ts \
  tests/deploy/delivery-substrate-delta.test.ts tests/deploy/release-submit.test.ts \
  tests/deploy/release-broker-peer-credential.test.ts \
  tests/deploy/release-broker-revalidation.test.ts tests/deploy/release-broker-flood.test.ts \
  tests/deploy/release-systemd-contract.test.ts tests/deploy/release-sshd-contract.test.ts \
  tests/deploy/verify-only-bootstrap.test.ts tests/security/deploy-authority-contract.test.ts \
  tests/github-actions/core-delivery-substrate.test.ts docs/runbooks/delivery-substrate.md \
  "wiki/CI CD And Monitoring Workflow.md" wiki/log.md
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git diff --cached --check
git commit -m "feat(deploy): add least-authority delivery substrate"
~~~

Expected: one green commit; go.sum/restricted plans/private evidence absent.

## Task 2: Implement the Leaf 13A No-Migration Pre-Floor Release Path

**Files:**

- Modify/create every pre-floor source in the Leaf 13A source map.
- Modify docs/runbooks/delivery-substrate.md, wiki/CI CD And Monitoring Workflow.md, wiki/log.md, wiki/manifest.json.

**Interfaces:**

- Consumes: Task 1 submit/broker, exact app digest, candidate-bound leaf fragments, owner schema/policy, and signed expected-state variant.
- Produces: four-authority exact-digest CI, explicit Docker allowlist, empty 13A registries, no-migration candidate, and crash-safe promotion for Leaves 3/1/4.

- [ ] **Step 1: Write RED context/workflow/empty-registry/reservation/crash tests**

Reject:

- Dockerfile COPY . or ADD; unlisted/secret/docs/wiki/raw/tests/.git/.github/.codex/.agents/.lazyweb/.superpowers/.worktrees/.pnpm-store/storage/dump/key context/layer;
- mutable base/tag/action, action object/repository mismatch, non-ARM64/QEMU/self-hosted/x64, third-party SSH, host build;
- authority leakage, deploy checkout/repo credential/arbitrary SSH;
- legacy mutable deploy enabled after merge or 13A merge app deploy/restart;
- nonempty initial registries, immutable capability/floor, migration/role/private-binding/Caddy/recovery/app-pointer mutation during install;
- any reservation outside nine, missing/wrong producer-owner/hash, v0 mutation/deletion/reassignment/direct 0->2/unchanged activation;
- missing Leaf 7 Leaf 12 v0 seam, Leaf 12 modifying middleware.ts, or runtime/matcher outside Leaf 7;
- projection FULL_PATH/ambiguity/hash mismatch;
- crash leaving backend/pointers/capability/owner/deployed-leaves inconsistent.

~~~bash
pnpm exec vitest run \
  tests/docker/build-context.test.ts \
  tests/github-actions/ci-cd.test.ts \
  tests/deploy/prefloor-release.test.ts \
  tests/deploy/protected-artifact-owners.test.ts \
  tests/deploy/protected-artifact-projections.test.ts \
  tests/deploy/promotion-crash-consistency.test.ts --reporter=dot
~~~

Expected RED: broad Docker/mutable workflow and missing registry/policy/state machine.

- [ ] **Step 2: Replace Dockerfile with explicit inputs**

Pin Node digest. No production/dev/tools stage uses COPY . or ADD. Inputs are exactly:

~~~text
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
tsconfig.json
next-env.d.ts
next.config.mjs
postcss.config.mjs
tailwind.config.ts
components.json
instrumentation.ts
instrumentation-client.ts
sentry.server.config.ts
sentry.edge.config.ts
app/
components/
lib/
types/
prisma/
public/
scripts/db/
~~~

Tools receive only scripts/db. Dev uses bind mounts. .dockerignore excludes Step 1 forbidden inputs. check-build-context compares Docker COPY plus actual context/layers to allowlist without printing secrets.

- [ ] **Step 3: Implement four CI authorities and remove legacy deploy**

- build-test: checkout persist-credentials false; no id-token/deploy secret/package write/production environment.
- scan-native-smoke: ubuntu-24.04-arm; no checkout/repository script; pulls exact digest.
- attest-sign: no checkout/repository script; alone has id-token write; consumes exact evidence and emits DSSE.
- deploy: no checkout/repo credential/third-party SSH; native OpenSSH sends one signed frame to submit.

All actions use exact repository/SHA. actions/attest uses a1948c3f048ba23858d222213b7c278aabede763, never annotated f6bf1532d7d6793fce74eac584813a8eee607999.

Remove appleboy SSH, host git/build/latest/prune/repo token/arbitrary remote script. A 13A main merge runs tests/build/attestation only and cannot deploy app.

- [ ] **Step 4: Implement empty registries, nine tuples, projections, and pre-floor operation**

At 13A:

~~~json
{"format":"munjib-protected-artifact-owners-v1","entries":[]}
~~~

deployed-leaves also has empty entries. immutable-private-runtime fragment and floor are absent.

Broker accepts exact app digest, RECORDED or first-Leaf-3-only LEGACY_UNRECORDED state, candidate leaf/owner transitions, optional allowlisted bundle digests, signed evidence, and fixed side-effect-disabled candidate. It rejects migration/role/private-binding/floor/Caddy-policy/recovery/caller path/env/tag/project/network/port/arbitrary Compose.

LEGACY_UNRECORDED binds observed container/image/backend/time and independent receipt. Unqualified legacy has no rollback record.

Promotion under lock fsyncs PREPARED, switches and fsyncs TRAFFIC_SWITCHED, atomically installs regular pointers and fsyncs COMMITTED, verifies public health/backend, and archives evidence. Reconciliation runs before every operation/boot and maintenance-fails when prior generation is ineligible.

- [ ] **Step 5: Run GREEN**

~~~bash
pnpm exec vitest run \
  tests/docker/build-context.test.ts \
  tests/github-actions/ci-cd.test.ts \
  tests/deploy/prefloor-release.test.ts \
  tests/deploy/protected-artifact-owners.test.ts \
  tests/deploy/protected-artifact-projections.test.ts \
  tests/deploy/promotion-crash-consistency.test.ts --reporter=dot
pnpm exec tsc --noEmit --pretty false
pnpm build
git diff --check
~~~

Expected: allowed inputs only; no legacy deploy; empty registries; no application capability/floor; no merge-time deploy.

- [ ] **Step 6: Stage exact Task 2 files, wiki-sync, and commit**

~~~bash
git add .dockerignore Dockerfile .github/workflows/ci-cd.yml \
  docker-compose.prefloor-candidate.yml \
  deploy/security/capability-fragment-schema-v1.json \
  deploy/security/deployed-leaves.json deploy/security/protected-artifact-owners.json \
  deploy/security/protected-artifact-owner-schema-v1.json \
  deploy/security/protected-artifact-policy-v1.json \
  lib/deploy/release-record.ts lib/deploy/prefloor-release.ts \
  scripts/deploy/check-build-context.ts scripts/deploy/check-action-pins.ts \
  scripts/deploy/check-protected-artifact-owners.ts \
  scripts/deploy/project-protected-artifacts.ts \
  scripts/deploy/qualify-prefloor-candidate.ts scripts/deploy/reconcile-promotion.ts \
  tests/docker/build-context.test.ts tests/deploy/prefloor-release.test.ts \
  tests/deploy/protected-artifact-owners.test.ts \
  tests/deploy/protected-artifact-projections.test.ts \
  tests/deploy/promotion-crash-consistency.test.ts tests/github-actions/ci-cd.test.ts \
  docs/runbooks/delivery-substrate.md "wiki/CI CD And Monitoring Workflow.md" wiki/log.md
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git diff --cached --check
git commit -m "feat(deploy): add no-migration pre-floor delivery"
~~~

Expected: two green 13A commits and no restricted file.

## Task 3: Review, Merge, Build, Attest, Externally Verify, and Install Leaf 13A

**Files:**

- Verify all Task 1/2 implementation files.
- Do not add a commit unless review feedback requires a RED/GREEN fix.
- Store detailed bootstrap/host evidence only in restricted operator storage.

**Interfaces:**

- Consumes: reviewed 13A branch, independent reviewers, protected main, core-delivery-substrate workflow, KMS approval, root recovery session, and pre-install no-mutation snapshot.
- Produces: merged 13A code, exact attested core-deploy-v1, installed submit/broker, signed VERIFY_ONLY, unchanged app/database/Caddy/floor/pointers, and durable child evidence.

- [ ] **Step 1: Run complete 13A verification and disclosure checks**

~~~bash
pnpm exec vitest run \
  tests/deploy/bootstrap-root-of-trust.test.ts \
  tests/deploy/core-delivery-bundle.test.ts \
  tests/deploy/release-envelope.test.ts \
  tests/deploy/attestation-verification.test.ts \
  tests/deploy/host-bundle-parser.test.ts \
  tests/deploy/delivery-substrate.test.ts \
  tests/deploy/delivery-substrate-delta.test.ts \
  tests/deploy/release-submit.test.ts \
  tests/deploy/release-broker-peer-credential.test.ts \
  tests/deploy/release-broker-revalidation.test.ts \
  tests/deploy/release-broker-flood.test.ts \
  tests/deploy/release-systemd-contract.test.ts \
  tests/deploy/release-sshd-contract.test.ts \
  tests/deploy/verify-only-bootstrap.test.ts \
  tests/security/deploy-authority-contract.test.ts \
  tests/github-actions/core-delivery-substrate.test.ts \
  tests/docker/build-context.test.ts \
  tests/github-actions/ci-cd.test.ts \
  tests/deploy/prefloor-release.test.ts \
  tests/deploy/protected-artifact-owners.test.ts \
  tests/deploy/protected-artifact-projections.test.ts \
  tests/deploy/promotion-crash-consistency.test.ts --reporter=dot
docker build --platform linux/arm64 --target test \
  -f deploy/delivery/Dockerfile.core-deploy .
pnpm test
pnpm exec tsc --noEmit --pretty false
pnpm build
pnpm wiki:lint
git diff --check
git status --short
git log --oneline origin/main..HEAD
~~~

Expected: commands pass; worktree is clean; exactly the reviewed public-safe commits are ahead of main.

- [ ] **Step 2: Push, open draft PR, mark ready, and inspect review**

~~~bash
leaf13_parent="$(awk -F '\t' '$1 == 13 { print $2 }' /private/tmp/munjib-security-leaf-map.tsv)"
test -n "$leaf13_parent"
git push -u origin HEAD
gh pr create --draft --base main --head "$(git branch --show-current)" \
  --title "[Security P0] Install least-authority delivery substrate" \
  --body "Parent: #$leaf13_parent

Installs the reviewed least-authority delivery substrate. Detailed findings and operational evidence remain in restricted local records."
gh pr ready
~~~

Use five bounded 60-second product waits, stopping early only when all checks are terminal. Then:

~~~bash
gh pr checks
gh pr view --json reviewDecision,reviews,statusCheckRollup
owner="$(gh repo view --json owner --jq .owner.login)"
name="$(gh repo view --json name --jq .name)"
number="$(gh pr view --json number --jq .number)"
gh api graphql -f owner="$owner" -f name="$name" -F number="$number" -f query='
query($owner:String!,$name:String!,$number:Int!){
  repository(owner:$owner,name:$name){
    pullRequest(number:$number){
      reviewThreads(first:100){
        nodes{isResolved comments(first:20){nodes{author{login} body path line}}}
      }
    }
  }
}' --jq '[.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false)]'
~~~

Expected: all checks pass and unresolved actionable threads equal [].

- [ ] **Step 3: Fix feedback with receiving-code-review and repeat**

For every actionable finding, confirm RED, implement the minimum fix, rerun affected/full tests plus wiki gates, commit, push, and repeat the wait/check/thread inspection.

- [ ] **Step 4: Merge before producing any production bootstrap artifact**

Use superpowers:finishing-a-development-branch. Merge only when approval/checks are green. Record the protected main merge SHA. Verify merge disabled the legacy mutable deploy and triggered no application deploy/restart/recreate.

- [ ] **Step 5: Build, scan, and attest core-deploy-v1 from protected main**

Dispatch core-delivery-substrate.yml for the exact merge SHA. It uses ubuntu-24.04-arm, Docker-only test/bundle targets, pinned scanner/action inputs, no deploy checkout, and publishes one OCI digest plus DSSE/SBOM/provenance. It does not install.

Verify output names exact source SHA, OCI digest, manifest digest, and hosted runner without topology/credentials.

- [ ] **Step 6: Externally verify and obtain the purpose-bound receipt**

On the protected workstation, independently verify source/ref/workflow/signer/digest/DSSE/SBOM/scan/manifest and numeric repository/owner identities. Obtain the exact KMS bootstrap receipt. Do not use the host's not-yet-installed verifier.

- [ ] **Step 7: Capture pre-state, install, atomically activate, and run VERIFY_ONLY**

With an out-of-band root recovery session ready:

1. capture running app/PostgreSQL/Caddy identities, Caddy/systemd hashes, PostgreSQL schema/migration/role hashes, pointer/floor presence/hashes, public health, and listeners using the externally verified state oracle;
2. run the no-follow receipt-verified standalone bootstrap;
3. run systemd-analyze verify and sshd -t before daemon-reload/socket activation/sshd reload;
4. activate VERIFY_ONLY-only policy;
5. send signed VERIFY_ONLY through real OpenSSH and require peer UID plus broker full revalidation;
6. activate full fixed policy only after VERIFY_ONLY;
7. capture and compare post-state.

Allowed deltas are only declared substrate binaries/policies/units, account/group/key restriction, directories, socket, lock, and audit journal. Any application container, PostgreSQL, Caddy policy, floor, current, rollback, or recovery delta fails and rolls back substrate generation.

- [ ] **Step 8: Close only the 13A child**

Store details in restricted storage. Add a generic child comment stating CI/review, exact artifact verification, signed VERIFY_ONLY, peer boundary, and no-runtime-mutation passed. Close 13A child; keep Leaf 13 parent open.

## Task 4: Deliver Leaf 3, Then Leaf 1, Then Leaf 4 Through 13A

**Files:**

- Execute docs/superpowers/plans/2026-07-11-security-nextjs-upgrade.md in the Leaf 3 worktree.
- Execute docs/superpowers/plans/2026-07-11-security-auth-runtime.md in the Leaf 1 worktree.
- Execute docs/superpowers/plans/2026-07-11-security-ai-output-egress.md in the Leaf 4 worktree.
- Do not implement those leaves on a Leaf 13 child branch.

**Interfaces:**

- Consumes: deployed 13A, exact dependency generation, leaf-owned branch/PR, candidate digest/evidence, and pre-floor broker operation.
- Produces: deployed secure-next-runtime@1, auth-runtime-fail-closed@1, zero-ambient-media-egress@1 and exact owner/reservation/deployed-leaf transitions.

- [ ] **Step 1: Deliver Leaf 3**

Use mapped Leaf 3 branch from latest main including 13A. Build, attest, and send only signed pre-floor envelope. Require zero applicable runtime advisory, pnpm audit --prod, candidate capability before switch, and first LEGACY_UNRECORDED transition if required.

- [ ] **Step 2: Deliver Leaf 1 after exact Leaf 3 evidence**

Merge latest main and require deployed secure-next-runtime@1, not branch ancestry. Leaf 1 creates exactly four reservations and publishes auth-runtime-fail-closed@1 before switch.

- [ ] **Step 3: Deliver Leaf 4 after exact Leaves 3/1 evidence**

Require both deployed generations. Leaf 4 activates only its Leaf 1 reservation, creates the Leaf 11 external-image reservation, and publishes zero-ambient-media-egress@1 before switch.

- [ ] **Step 4: Close the P0 pre-floor gate**

~~~text
leaf_13a_verify_only=pass
leaf_13a_no_runtime_mutation=pass
leaf_3_capability=secure-next-runtime@1
leaf_1_capability=auth-runtime-fail-closed@1
leaf_4_capability=zero-ambient-media-egress@1
deployed_leaf_closure=pass
legacy_mutable_deploy=disabled
~~~

Do not start 13B if any value differs.

## Leaf 13B Source Map

- Modify docker-compose.yml only as immutable-runtime-security-v1 source.
- Create docker-compose.google.yml.
- Create docker-compose.candidate.yml.
- Create docker-compose.migrator.yml.
- Create docker-compose.tools.yml.
- Create deploy/postgres/roles-only.sql.
- Create deploy/postgres/finalize-ownership.sql.
- Create deploy/postgres/verify-role-separation.sql.
- Create deploy/host-bundles/database-role-v1/manifest.json.
- Create scripts/deploy/build-database-role-bundle.ts.
- Create deploy/security/migration-ledger.json.
- Create deploy/security/security-floor.json.
- Create deploy/security/capabilities/immutable-private-runtime.json only in Task 7.
- Create lib/deploy/capability-floor.ts.
- Create lib/deploy/migration-history.ts.
- Create lib/deploy/migration-policy.ts.
- Create scripts/deploy/check-migration-history.ts.
- Create scripts/deploy/check-expand-contract.ts.
- Create scripts/deploy/qualify-candidate.ts.
- Create scripts/deploy/verify-private-bindings.ts.
- Create scripts/deploy/verify-security-floor.ts.
- Create scripts/deploy/rescan-release.ts.
- Create scripts/deploy/verify-recovery-artifact-set.ts.
- Create scripts/deploy/verify-recovery-compatibility.ts.
- Create scripts/deploy/secret-remanence-check.sh.
- Extend .github/workflows/ci-cd.yml.
- Create .github/workflows/security-rescan.yml.
- Create .github/workflows/recovery-qualification.yml.
- Create tests/docker/release-hardening.test.ts.
- Modify tests/docker/compose.test.ts.
- Create tests/deploy/migration-history.test.ts.
- Create tests/deploy/migration-policy.test.ts.
- Create tests/deploy/database-role-separation.test.ts.
- Create tests/deploy/database-role-bundle.test.ts.
- Create tests/deploy/capability-floor.test.ts.
- Create tests/deploy/blue-green-promotion.test.ts.
- Create tests/deploy/rescan-restart.test.ts.
- Create tests/deploy/recovery-record-separation.test.ts.
- Create tests/deploy/recovery-compatibility.test.ts.
- Create tests/security/immutable-private-runtime-capability.test.ts.
- Modify tests/github-actions/ci-cd.test.ts.
- Create tests/github-actions/security-rescan.test.ts.
- Create tests/github-actions/recovery-qualification.test.ts.

## Task 5: Start Leaf 13B and Enforce Migration and Database Authority

**Files:**

- Create PostgreSQL SQL, database-role bundle, migration ledger/policy/history, migration/role tests, runbook/wiki from the 13B source map.

**Interfaces:**

- Consumes: deployed Leaves 3/1/4, 13A bundle operation, current migration prefix, root-held credential files, shared migration allocation.
- Produces: prefix/checksum admission, expand classifier, root bootstrap, NOLOGIN owner, migration-only login, least-privilege Web/RAG, PRE_JOURNAL evidence, database-role-v1.

- [ ] **Step 1: Create generic P0 13B child and worktree**

~~~bash
cd /Users/developer/Documents/munjib
git fetch origin main
test "$(git branch --show-current)" = main
git worktree add -b codex/leaf13b-bootstrap /private/tmp/munjib-leaf13b origin/main
cd /private/tmp/munjib-leaf13b
leaf13_parent="$(awk -F '\t' '$1 == 13 { print $2 }' /private/tmp/munjib-security-leaf-map.tsv)"
feature_output="$(pnpm wiki:feature-start "[Security P0] Activate immutable private runtime")"
printf '%s\n' "$feature_output"
issue_url="$(printf '%s\n' "$feature_output" | rg -o 'https://github.com/[^ ]+/issues/[0-9]+' | head -n 1)"
issue_number="$(printf '%s\n' "$issue_url" | awk -F/ '{ print $NF }')"
test -n "$issue_number"
git branch -m "issue-$issue_number-immutable-private-runtime"
gh issue edit "$issue_number" --body "Parent: #$leaf13_parent
Priority: P0
Program child: Leaf 13B
Dependencies: deployed Leaf 13A and prerequisite P0 runtime leaves
Acceptance: Production releases use verified immutable artifacts and least-authority runtime gates.

Detailed findings and operational evidence remain in restricted local records."
git push -u origin HEAD
pnpm wiki:find "database deployment migration"
~~~

Expected: generic P0 13B issue/branch from latest main with deployed dependency chain.

- [ ] **Step 2: Write RED migration/history/role/bundle tests**

Cover exact prefix/checksum, failed/unresolved rows, edited history, nonmonotonic pending names, contract SQL in expand, clean/latest-snapshot upgrades, caller libpq authority, writable schema before pg_catalog, malicious public shadows, Web DDL/truncate/owner access, credential exposure, bundle path/type/hash/mode/destination, and PRE_JOURNAL without pgcrypto/journal/genesis.

~~~bash
pnpm exec vitest run \
  tests/deploy/migration-history.test.ts \
  tests/deploy/migration-policy.test.ts \
  tests/deploy/database-role-separation.test.ts \
  tests/deploy/database-role-bundle.test.ts --reporter=dot
~~~

Expected RED: missing ledger/classifier/roles/bundle and unsafe authority.

- [ ] **Step 3: Implement migration and role separation**

Create root-only bootstrap/admin, munjib_schema_owner NOLOGIN, migrator LOGIN allowed SET ROLE only in fixed migration operation, least-privilege Web/RAG, and journal owner/exporter placeholders without journal objects/genesis.

Entrypoints clear all caller libpq authority before one fixed credential file. Only migrator sets role. Every connection verifies pg_catalog first.

database-role-v1 carries only manifest-listed SQL/unit/helper artifacts. Broker verifies/installs; no privileged checkout read.

- [ ] **Step 4: Run GREEN, stage, wiki-sync, and commit**

~~~bash
pnpm exec vitest run \
  tests/deploy/migration-history.test.ts \
  tests/deploy/migration-policy.test.ts \
  tests/deploy/database-role-separation.test.ts \
  tests/deploy/database-role-bundle.test.ts --reporter=dot
pnpm exec tsc --noEmit --pretty false
git add deploy/postgres/roles-only.sql deploy/postgres/finalize-ownership.sql \
  deploy/postgres/verify-role-separation.sql \
  deploy/host-bundles/database-role-v1/manifest.json \
  deploy/security/migration-ledger.json lib/deploy/migration-history.ts \
  lib/deploy/migration-policy.ts scripts/deploy/build-database-role-bundle.ts \
  scripts/deploy/check-migration-history.ts scripts/deploy/check-expand-contract.ts \
  tests/deploy/migration-history.test.ts tests/deploy/migration-policy.test.ts \
  tests/deploy/database-role-separation.test.ts tests/deploy/database-role-bundle.test.ts \
  docs/runbooks/immutable-deploy.md "wiki/CI CD And Monitoring Workflow.md" wiki/log.md
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git diff --cached --check
git commit -m "feat(deploy): separate migration and runtime database authority"
~~~

Expected: pass; no credential, journal genesis, destructive migration, or privileged checkout.

## Task 6: Implement Exact-Digest Private Blue/Green Runtime

**Files:**

- Modify Dockerfile, docker-compose.yml, .github/workflows/ci-cd.yml, tests/github-actions/ci-cd.test.ts.
- Create docker-compose.google.yml, docker-compose.candidate.yml, docker-compose.migrator.yml, docker-compose.tools.yml.
- Create scripts/deploy/qualify-candidate.ts, scripts/deploy/verify-private-bindings.ts.
- Modify scripts/deploy/reconcile-promotion.ts.
- Create tests/docker/release-hardening.test.ts, tests/deploy/blue-green-promotion.test.ts.
- Modify tests/docker/compose.test.ts, tests/deploy/promotion-crash-consistency.test.ts.
- Modify docs/runbooks/immutable-deploy.md, wiki/CI CD And Monitoring Workflow.md, wiki/log.md, wiki/manifest.json.

**Interfaces:**

- Consumes: exact app/PostgreSQL/host-bundle digests, separated role files, migration prefix, deployed Leaves 3/1/4, 13A broker, signed evidence, current/rollback state.
- Produces: side-effect-disabled candidate, private bindings, least-privilege runtime, fixed discriminator, PREPARED -> TRAFFIC_SWITCHED -> COMMITTED promotion, floor-aware rollback, no host checkout/build.

- [ ] **Step 1: Write RED private-runtime and promotion tests**

Reject candidate live-port/side effects/writable attachments, non-ARM64/tag/non-attested artifact, stale/mismatched evidence, current interruption before qualification, migration/public-smoke bypass, rollback below floor, public IPv4/IPv6 listeners, Caddy admin TCP, secret uid/gid/mode drift, userns drift, broad Docker COPY, host checkout/build, and missing broker revalidation.

~~~bash
pnpm exec vitest run \
  tests/docker/release-hardening.test.ts \
  tests/docker/compose.test.ts \
  tests/deploy/blue-green-promotion.test.ts \
  tests/deploy/promotion-crash-consistency.test.ts \
  tests/github-actions/ci-cd.test.ts --reporter=dot
~~~

Expected RED: private candidate, promotion, private binding, and exact-digest workflow are missing.

- [ ] **Step 2: Implement the fixed candidate and private runtime**

The same exact app digest runs Web, migration, and tools with fixed discriminators and distinct file credentials. Candidate disables email, OAuth callbacks, background jobs, indexing, external providers, and writable attachments.

docker-compose.yml is only the source of immutable-runtime-security-v1. Leaf-specific behavior uses exact overlays. Production Web is loopback-only; PostgreSQL has no host ports; Web is non-root/read-only/cap-drop ALL/no-new-privileges/tmpfs-only.

The broker, not the submit account, performs fixed Docker/systemd operations. Every privileged call starts from the broker's independently revalidated envelope and fixed operation descriptor. Caller image tags, paths, project/network/port, Compose arguments, environment, entrypoint, and commands are rejected.

- [ ] **Step 3: Implement exact migration, qualification, and crash-safe promotion**

Under the global lock:

1. verify expected current generation and live migration prefix;
2. install exact host-bundle prerequisites;
3. run exact-digest migrator with pg_catalog first;
4. finalize ownership/default ACLs;
5. stage exact-candidate capability/owner/proposed floor;
6. run role, auth, RSC, RAG, zero-egress, private-binding, candidate-Caddy, and log-sentinel smoke;
7. fsync PREPARED;
8. switch fixed backend and fsync TRAFFIC_SWITCHED;
9. atomically install regular current/rollback/capability/owner/deployed-leaf pointers and fsync COMMITTED;
10. force-recreate services whose bound inode/evidence changed;
11. run public smoke, exact backend, and listener inventory;
12. promote floor only when all runtime/pointer facts agree.

Reconciliation runs before deploy/rollback/rescan/recovery and at boot. Crash tests cover every write/fsync/rename/reload/recreation/smoke/floor boundary. Pre-switch failure removes candidate. An ineligible previous image causes maintenance/fix-forward.

- [ ] **Step 4: Run GREEN, stage, wiki-sync, and commit**

~~~bash
pnpm exec vitest run \
  tests/docker/release-hardening.test.ts \
  tests/docker/compose.test.ts \
  tests/deploy/blue-green-promotion.test.ts \
  tests/deploy/promotion-crash-consistency.test.ts \
  tests/github-actions/ci-cd.test.ts --reporter=dot
pnpm exec tsc --noEmit --pretty false
pnpm build
git add Dockerfile docker-compose.yml docker-compose.google.yml \
  docker-compose.candidate.yml docker-compose.migrator.yml docker-compose.tools.yml \
  .github/workflows/ci-cd.yml scripts/deploy/qualify-candidate.ts \
  scripts/deploy/verify-private-bindings.ts scripts/deploy/reconcile-promotion.ts \
  tests/docker/release-hardening.test.ts tests/docker/compose.test.ts \
  tests/deploy/blue-green-promotion.test.ts \
  tests/deploy/promotion-crash-consistency.test.ts tests/github-actions/ci-cd.test.ts \
  docs/runbooks/immutable-deploy.md "wiki/CI CD And Monitoring Workflow.md" wiki/log.md
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git diff --cached --check
git commit -m "feat(deploy): add exact-digest private blue-green runtime"
~~~

Expected: pass; no tag, public listener, host checkout/build, shared credential, unsafe rollback, or unverified privileged operation.

## Task 7: Publish Final Capability, Exclusive Owners, Rescan, and Compatible Recovery

**Files:**

- Create deploy/security/capabilities/immutable-private-runtime.json.
- Modify deploy/security/protected-artifact-owners.json.
- Create/modify capability/floor/rescan/recovery scripts, workflows, tests, runbook/wiki from 13B source map.

**Interfaces:**

- Consumes: every Task 1/2/5/6 implementation/evidence test, deployed Leaves 3/1/4, candidate digest, role/private-runtime evidence, owner projection, current recovery requirements.
- Produces: immutable-private-runtime@1, Leaf 13-exclusive ACTIVE owners, monotonic floor, rescan subgeneration, distinct current/rollback/recovery, assertRecoveryCompatibleWithCurrent.

- [ ] **Step 1: Write RED capability, owner, rescan, and compatibility tests**

Prove:

- fragment has exactly format/id/version/leaf/requires/evidenceTests;
- requires secure-next-runtime@1, auth-runtime-fail-closed@1, zero-ambient-media-egress@1;
- every evidence path exists/passes before publication;
- owners are exact exclusive set plus immutable-runtime-security-v1;
- package/lock/docker-compose full path/Dockerfile/shared CI/owner/deployed/security-floor/migration-ledger/wiki are not Leaf 13 FULL_PATH owners;
- distinct current/recovery digests may pass;
- equal digest fails without independent drill/mirror/evidence;
- normal deploy leaves recovery bytes unchanged;
- recovery covers minimum capabilities, live migration prefix, artifacts, freshness, oldest drill;
- rescan updates exact matching references only and never forces equality;
- ineligible evidence denies future transitions without silently stopping running app.

~~~bash
pnpm exec vitest run \
  tests/security/immutable-private-runtime-capability.test.ts \
  tests/deploy/capability-floor.test.ts \
  tests/deploy/protected-artifact-owners.test.ts \
  tests/deploy/protected-artifact-projections.test.ts \
  tests/deploy/rescan-restart.test.ts \
  tests/deploy/recovery-record-separation.test.ts \
  tests/deploy/recovery-compatibility.test.ts \
  tests/github-actions/security-rescan.test.ts \
  tests/github-actions/recovery-qualification.test.ts --reporter=dot
~~~

Expected RED: final fragment/owners/rescan/compatibility do not exist.

- [ ] **Step 2: Add exact immutable-private-runtime@1**

~~~json
{"format":"munjib-security-capability-v1","id":"immutable-private-runtime","version":1,"leaf":13,"requires":["secure-next-runtime@1","auth-runtime-fail-closed@1","zero-ambient-media-egress@1"],"evidenceTests":["tests/deploy/bootstrap-root-of-trust.test.ts","tests/deploy/core-delivery-bundle.test.ts","tests/deploy/release-envelope.test.ts","tests/deploy/attestation-verification.test.ts","tests/deploy/host-bundle-parser.test.ts","tests/deploy/delivery-substrate.test.ts","tests/deploy/delivery-substrate-delta.test.ts","tests/deploy/release-submit.test.ts","tests/deploy/release-broker-peer-credential.test.ts","tests/deploy/release-broker-revalidation.test.ts","tests/deploy/release-broker-flood.test.ts","tests/deploy/release-systemd-contract.test.ts","tests/deploy/release-sshd-contract.test.ts","tests/deploy/verify-only-bootstrap.test.ts","tests/security/deploy-authority-contract.test.ts","tests/github-actions/core-delivery-substrate.test.ts","tests/docker/build-context.test.ts","tests/github-actions/ci-cd.test.ts","tests/deploy/prefloor-release.test.ts","tests/deploy/migration-history.test.ts","tests/deploy/migration-policy.test.ts","tests/deploy/database-role-separation.test.ts","tests/deploy/database-role-bundle.test.ts","tests/docker/release-hardening.test.ts","tests/docker/compose.test.ts","tests/deploy/capability-floor.test.ts","tests/deploy/protected-artifact-owners.test.ts","tests/deploy/protected-artifact-projections.test.ts","tests/deploy/blue-green-promotion.test.ts","tests/deploy/promotion-crash-consistency.test.ts","tests/deploy/rescan-restart.test.ts","tests/deploy/recovery-record-separation.test.ts","tests/deploy/recovery-compatibility.test.ts","tests/github-actions/security-rescan.test.ts","tests/github-actions/recovery-qualification.test.ts","tests/security/immutable-private-runtime-capability.test.ts"]}
~~~

Do not create/stage this fragment in 13A.

- [ ] **Step 3: Activate only exact Leaf 13-exclusive owners**

Add ACTIVE v1:

- projection:immutable-runtime-security-v1
- path:cmd/munjib-core-bootstrap/main.go
- path:cmd/munjib-release-submit/main.go
- path:cmd/munjib-release-broker/main.go
- path:cmd/munjib-release-verify/main.go
- path:cmd/munjib-host-bundle-install/main.go
- path:cmd/munjib-release-reconcile/main.go
- path:cmd/munjib-substrate-state/main.go
- path:internal/delivery/audit.go
- path:internal/delivery/attestation.go
- path:internal/delivery/canonicaljson.go
- path:internal/delivery/envelope.go
- path:internal/delivery/hostbundle.go
- path:internal/delivery/install.go
- path:internal/delivery/peercred_linux.go
- path:internal/delivery/state.go
- path:deploy/delivery/Dockerfile.core-deploy
- path:deploy/delivery/core-deploy-v1/manifest.template.json
- path:deploy/delivery/dispatcher-policy-v1.json
- path:deploy/delivery/host-bundle-policy-v1.json
- path:deploy/delivery/trust-policy-v1.json
- path:deploy/delivery/tool-pins-v1.json
- path:deploy/delivery/deploy-principal-policy-v1.json
- path:deploy/delivery/sshd-munjib-deploy.conf
- path:deploy/delivery/munjib-security-state-lock.tmpfiles
- path:deploy/systemd/munjib-release-broker.socket
- path:deploy/systemd/munjib-release-broker.service
- path:deploy/systemd/munjib-release-reconcile.service
- path:.github/workflows/core-delivery-substrate.yml
- path:deploy/security/capability-fragment-schema-v1.json
- path:deploy/security/protected-artifact-owner-schema-v1.json
- path:deploy/security/protected-artifact-policy-v1.json
- path:deploy/security/capabilities/immutable-private-runtime.json
- path:lib/deploy/release-record.ts
- path:lib/deploy/prefloor-release.ts
- path:lib/deploy/capability-floor.ts
- path:lib/deploy/migration-history.ts
- path:lib/deploy/migration-policy.ts
- path:deploy/postgres/roles-only.sql
- path:deploy/postgres/finalize-ownership.sql
- path:deploy/postgres/verify-role-separation.sql
- path:docker-compose.google.yml
- path:docker-compose.candidate.yml
- path:docker-compose.migrator.yml
- path:docker-compose.tools.yml

Do not claim go.mod because later standard-library Go leaves share the module. Do not claim generated/shared registries, migration ledger, base Dockerfile, package/lock, base Compose full path, aggregate CI, or shared wiki.

- [ ] **Step 4: Implement compatible recovery and rescan**

assertRecoveryCompatibleWithCurrent requires:

~~~text
recovery.capabilityClosure >= current.recoveryRequirements.minimumCapabilities
recovery.migrationSupport includes current.liveSuccessfulMigrationPrefix
recovery.artifactSet includes current.recoveryRequirements.requiredArtifactIds
recovery.evidence is unexpired and signer/source/digest valid
recovery.oldestRetainedPointDrill = passed
recovery.offlineMirror = complete
~~~

It never requires digest/source/floor/evidence equality. Normal deploy cannot open recovery.json for write. Qualification uses separate workflow, recovery-candidate, isolated drill, and atomic promotion.

No-checkout rescan pulls exact digests, runs pinned scanners, signs a subgeneration, and asks broker to revalidate. Under lock broker updates only matching current/rollback/recovery references, republishes matching dynamic capabilities, force-recreates affected containers, and proves restart/restore use new evidence.

- [ ] **Step 5: Run GREEN, stage, wiki-sync, and commit**

~~~bash
pnpm exec vitest run \
  tests/security/immutable-private-runtime-capability.test.ts \
  tests/deploy/capability-floor.test.ts \
  tests/deploy/protected-artifact-owners.test.ts \
  tests/deploy/protected-artifact-projections.test.ts \
  tests/deploy/rescan-restart.test.ts \
  tests/deploy/recovery-record-separation.test.ts \
  tests/deploy/recovery-compatibility.test.ts \
  tests/github-actions/security-rescan.test.ts \
  tests/github-actions/recovery-qualification.test.ts --reporter=dot
pnpm exec tsc --noEmit --pretty false
git add deploy/security/capabilities/immutable-private-runtime.json \
  deploy/security/protected-artifact-owners.json deploy/security/security-floor.json \
  lib/deploy/capability-floor.ts scripts/deploy/verify-security-floor.ts \
  scripts/deploy/rescan-release.ts scripts/deploy/verify-recovery-artifact-set.ts \
  scripts/deploy/verify-recovery-compatibility.ts scripts/deploy/secret-remanence-check.sh \
  .github/workflows/security-rescan.yml .github/workflows/recovery-qualification.yml \
  tests/security/immutable-private-runtime-capability.test.ts \
  tests/deploy/capability-floor.test.ts tests/deploy/protected-artifact-owners.test.ts \
  tests/deploy/protected-artifact-projections.test.ts tests/deploy/rescan-restart.test.ts \
  tests/deploy/recovery-record-separation.test.ts tests/deploy/recovery-compatibility.test.ts \
  tests/github-actions/security-rescan.test.ts \
  tests/github-actions/recovery-qualification.test.ts \
  docs/runbooks/immutable-deploy.md "wiki/CI CD And Monitoring Workflow.md" wiki/log.md
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git diff --cached --check
git commit -m "feat(deploy): publish immutable private runtime capability"
~~~

Expected: capability/owner/evidence tests pass; valid distinct recovery passes; equality without independent proof fails.

## Task 8: Review, Merge, Deploy, Rescan, and Close Leaf 13B

**Files:**

- Verify every 13B implementation/wiki file.
- Store detailed production evidence only in restricted operator storage.

**Interfaces:**

- Consumes: reviewed 13B branch, protected main, exact app/pgvector/host-bundle digests, signed evidence, independent approval, current state, compatible recovery candidate, broker operations.
- Produces: merged private runtime, immutable-private-runtime@1, separated records, rescan propagation, independent recovery qualification, Leaf 13 completion.

- [ ] **Step 1: Run full local/container verification**

~~~bash
pnpm exec vitest run \
  tests/deploy/bootstrap-root-of-trust.test.ts \
  tests/deploy/core-delivery-bundle.test.ts \
  tests/deploy/release-envelope.test.ts \
  tests/deploy/attestation-verification.test.ts \
  tests/deploy/host-bundle-parser.test.ts \
  tests/deploy/delivery-substrate.test.ts \
  tests/deploy/release-submit.test.ts \
  tests/deploy/release-broker-peer-credential.test.ts \
  tests/deploy/release-broker-revalidation.test.ts \
  tests/deploy/release-broker-flood.test.ts \
  tests/deploy/release-systemd-contract.test.ts \
  tests/deploy/release-sshd-contract.test.ts \
  tests/deploy/verify-only-bootstrap.test.ts \
  tests/security/deploy-authority-contract.test.ts \
  tests/docker/build-context.test.ts \
  tests/docker/release-hardening.test.ts \
  tests/docker/compose.test.ts \
  tests/deploy/prefloor-release.test.ts \
  tests/deploy/migration-history.test.ts \
  tests/deploy/migration-policy.test.ts \
  tests/deploy/database-role-separation.test.ts \
  tests/deploy/database-role-bundle.test.ts \
  tests/deploy/capability-floor.test.ts \
  tests/deploy/protected-artifact-owners.test.ts \
  tests/deploy/protected-artifact-projections.test.ts \
  tests/deploy/blue-green-promotion.test.ts \
  tests/deploy/promotion-crash-consistency.test.ts \
  tests/deploy/rescan-restart.test.ts \
  tests/deploy/recovery-record-separation.test.ts \
  tests/deploy/recovery-compatibility.test.ts \
  tests/security/immutable-private-runtime-capability.test.ts \
  tests/github-actions/core-delivery-substrate.test.ts \
  tests/github-actions/ci-cd.test.ts \
  tests/github-actions/security-rescan.test.ts \
  tests/github-actions/recovery-qualification.test.ts --reporter=dot
docker build --platform linux/arm64 --target test \
  -f deploy/delivery/Dockerfile.core-deploy .
pnpm test
pnpm exec tsc --noEmit --pretty false
pnpm build
pnpm audit --prod
pnpm wiki:lint
git diff --check
~~~

Validate overlays with synthetic empty credential files and exact digests without printing rendered config:

~~~bash
compose_tmp="$(mktemp -d)"
trap 'rm -rf "$compose_tmp"' EXIT
install -m 0600 /dev/null "$compose_tmp/postgres-admin"
install -m 0600 /dev/null "$compose_tmp/app-db"
install -m 0600 /dev/null "$compose_tmp/migrator-db"
WEB_IMAGE="ghcr.io/dschoi30/munjib@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" \
POSTGRES_IMAGE="pgvector/pgvector@sha256:b759abdeb144e561a4dbfe9863b5ac58cdd3fb6350cee7e68035baffdbca9693" \
MUNJIB_POSTGRES_ADMIN_PASSWORD_FILE="$compose_tmp/postgres-admin" \
MUNJIB_APP_DATABASE_PASSWORD_FILE="$compose_tmp/app-db" \
MUNJIB_MIGRATOR_DATABASE_PASSWORD_FILE="$compose_tmp/migrator-db" \
docker compose -f docker-compose.yml -f docker-compose.candidate.yml config --quiet
WEB_IMAGE="ghcr.io/dschoi30/munjib@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" \
POSTGRES_IMAGE="pgvector/pgvector@sha256:b759abdeb144e561a4dbfe9863b5ac58cdd3fb6350cee7e68035baffdbca9693" \
MUNJIB_POSTGRES_ADMIN_PASSWORD_FILE="$compose_tmp/postgres-admin" \
MUNJIB_APP_DATABASE_PASSWORD_FILE="$compose_tmp/app-db" \
MUNJIB_MIGRATOR_DATABASE_PASSWORD_FILE="$compose_tmp/migrator-db" \
docker compose -f docker-compose.yml -f docker-compose.migrator.yml \
  -f docker-compose.tools.yml config --quiet
bash -n scripts/deploy/secret-remanence-check.sh
~~~

Expected: all commands pass and the audit has no applicable production advisory.

- [ ] **Step 2: Push, open ready PR, wait, and inspect every review surface**

~~~bash
leaf13_parent="$(awk -F '\t' '$1 == 13 { print $2 }' /private/tmp/munjib-security-leaf-map.tsv)"
test -n "$leaf13_parent"
git push -u origin HEAD
gh pr create --draft --base main --head "$(git branch --show-current)" \
  --title "[Security P0] Activate immutable private runtime" \
  --body "Parent: #$leaf13_parent

Activates the reviewed immutable private runtime. Detailed findings and operational evidence remain in restricted local records."
gh pr ready
~~~

Use five bounded 60-second product waits, stopping early only when all checks are terminal. Then:

~~~bash
gh pr checks
gh pr view --json reviewDecision,reviews,statusCheckRollup
owner="$(gh repo view --json owner --jq .owner.login)"
name="$(gh repo view --json name --jq .name)"
number="$(gh pr view --json number --jq .number)"
gh api graphql -f owner="$owner" -f name="$name" -F number="$number" -f query='
query($owner:String!,$name:String!,$number:Int!){
  repository(owner:$owner,name:$name){
    pullRequest(number:$number){
      reviewThreads(first:100){
        nodes{isResolved comments(first:20){nodes{author{login} body path line}}}
      }
    }
  }
}' --jq '[.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false)]'
~~~

Expected: all checks pass and unresolved actionable threads equal []. Apply every finding with receiving-code-review, RED/GREEN verification, wiki gates, commit, push, and a fresh bounded review loop.

- [ ] **Step 3: Merge, then build/attest only protected main**

Merge only with clean CI/review. Protected main builds exact native ARM64 app and every host bundle, scans, creates SBOM/provenance, and signs closed evidence. PR artifact, tag identity, host checkout/build are never deployable.

- [ ] **Step 4: Deploy through submit and broker**

Send one signed frame through native OpenSSH -> unprivileged submit -> peer-verified root broker. Require migration, role separation, candidate smoke, dual-stack private listeners, auth/RSC/RAG/zero-egress/log sentinel, backend, owner/capability closure, promotion, and restart.

Public evidence contains only digests/result ids, never credentials, private hostname/IP/account id, raw log/DSSE/environment/topology.

- [ ] **Step 5: Run rollback, rescan, and recovery compatibility drills**

Require eligible rollback at/above floor; maintenance/fix-forward below floor; exact rescan propagation/recreation; normal deploy preserving recovery bytes; independently drilled oldest-point candidate; complete offline mirror with registry unavailable; different compatible digest accepted; equal digest without drill/mirror rejected.

- [ ] **Step 6: Close 13B and parent**

Close 13B only after durable production evidence. Close parent only after 13A, deployed Leaves 3/1/4, 13B, registry-outage recovery compatibility, operator checklist, CI, and review links.

## Operator Checklist Outside Code

- SSH password locked, root-owned key, valid plumbing shell, forced submit, no interactive/TTY/forward/tunnel/environment.
- Submit unprivileged/non-setuid/no file capability/sudo/Docker/helper/caller path-env.
- Socket root:dedicated group 0620; only deploy account; exact UID SO_PEERCRED; full broker revalidation; bounded flood.
- Broker service hardening and exact writable/capability allowlist.
- systemd-analyze verify and sshd -t before each atomic unit/config activation/reload.
- Host OS/kernel/reboot/time/core-dump/swap reviewed.
- Dual-stack network only 22/80/443; private/debug/database/Docker/Ollama denied.
- OCI IAM/metadata/NSG/routes/public IP/volume encryption/delete authority reviewed.
- Registry immutability/delete authority/read-only credential/offline mirror custody reviewed.
- DNS registrar MFA/transfer lock/recovery contacts/DNSSEC reviewed.
- GitHub protected main/environment/independent approval/selected actions/SHA pins/security scanning reviewed.
- Observability access/PII/retention/endpoints/log redaction reviewed.
- KMS rotation/offline keys/historical roots/registry-outage oldest restore reviewed.
- Quiet cloud-init/history/journal/stopped-container/image-layer/build-cache remanence scan passed.

Privileged human MFA/passkey and full PostgreSQL tenant RLS remain explicit P2 residual risks and are not silently added to this P0 implementation.
