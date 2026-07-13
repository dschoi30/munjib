# Issue #185 — delivery-substrate installation assessment

**Issue:** #185, `[Security P0] Install and attest the delivery broker on production host`

**Branch:** `codex/leaf185-delivery-substrate-install`

**Scope:** Public-safe design and verification assessment only. No privileged
remote installation, checkout execution on the production host, secret output,
or remote log collection was performed.

## Decision

Production installation is **blocked by missing attestation/bootstrap inputs**.
The merged Leaf 13A source contract is installable in principle, but the
repository does not currently contain a trusted, target-architecture artifact
bundle or the root bootstrap material needed to install it safely. Adding an
installer that guessed those values would weaken the fail-closed boundary and
would not satisfy Issue #185's acceptance criteria.

A safe, public code slice was added instead: the repository now contains a
fixed Linux/ARM64 bundle layout and fail-closed builder/verifier for the
non-secret substrate files. This does not change the production installation
decision.

## Evidence inspected

| Requirement | Current evidence | Result |
| --- | --- | --- |
| Fixed broker/submitter/verify programs | `cmd/munjib-release-broker/main.go`, `cmd/munjib-release-submit/main.go`, `cmd/munjib-release-verify/main.go` | Source contract exists; no compiled host artifact is tracked. |
| Fixed destination allowlist | `deploy/delivery/manifest-v1.json`, `deploy/delivery/bundle-layout-v1.json` | The original operation allowlist remains separate; the new bundle layout binds source/artifact names to destinations, owner/mode metadata, and fixed Linux/ARM64 target. Generated manifests add SHA-256 and bundle digest evidence. |
| Principal and operation policy | `deploy/delivery/principal-policy-v1.json`, `deploy/delivery/broker-operations-v1.json` | Public policy exists. The broker admits `VERIFY_ONLY`; `INSTALL_SUBSTRATE` and `RECONCILE_SUBSTRATE` intentionally return `ROOT_HELPER_NOT_INSTALLED`. |
| Socket and service units | `deploy/systemd/munjib-release-broker.{socket,service}` | Unit source exists. A live socket is not present in this environment, and the repository has no host installer or enable/reload procedure. |
| Forced SSH boundary | `deploy/sshd/munjib-release-submit.conf` | Configuration fragment exists. No safe host-side deployment, `sshd -t`, or reload was performed. |
| Trust root | Broker and verifier require `/var/lib/munjib/security/bootstrap/release-verify.pub` and an Ed25519 public key of the exact expected size. | The key is intentionally absent from the repository and no root-bootstrap handoff is available. |
| Target build | `go.mod`, `deploy/delivery/bundle-layout-v1.json`, and builder tests | CI still has no Go build/attestation job. Local environment is Darwin arm64 and has no `go` binary, so no target Linux artifact was produced or verified; tests use fake artifacts only to exercise fail-closed packaging. |
| Independent host verification | `tests/deploy/delivery-substrate-contract.test.ts` and the unit/source contracts | Static source tests pass in the merged PR lineage, but they cannot prove host ownership, socket activation, SSH parser acceptance, binary digest, or trust-key enrollment. |

The repository-wide deployment workflow (`.github/workflows/ci-cd.yml`) builds
the web/tools images and runs the application deploy. It does not build,
package, sign, attest, transfer, or install the delivery-substrate programs.

The safe packaging slice is intentionally not a host installer: it rejects
symlinked inputs and path escapes, copies only the fixed eight substrate files,
emits a per-file SHA-256 manifest plus a manifest digest, and declares
`release-verify.pub` as a `root-bootstrap` external input without fabricating
it. The verifier checks target, layout digest, ownership/mode metadata, payload
digests, symlink absence, and unexpected top-level files.

## Why automation is not safe yet

The broker's trust decision is tied to a root-managed public key and the
submitter's exact host identity. Neither can be inferred from a checkout:

1. The three Go programs must be built for the production host's Linux
   architecture. Building on or executing the checkout on the host would
   violate the issue's no-checkout-execution acceptance boundary.
2. A bundle must bind each destination to an exact artifact digest and mode.
   `manifest-v1.json` is not such a bundle manifest; it is only an operation
   contract/allowlist.
3. The root operator must provision the trust public key, the
   `munjib-deploy` principal, and the `munjib-release-submit` group. These are
   host bootstrap inputs, not repository data.
4. The signing key and a signed, short-lived `VERIFY_ONLY` envelope must be
   held outside the repository. No signer, key-enrollment record, or safe
   public fixture for the production trust root is present.
5. Installing the systemd socket/service and SSH fragment requires a root
   mutation followed by independent parser/status checks. No authorized
   remote root operation was available for this task.

## Safe implementation shape once inputs exist

The smallest acceptable follow-up is a CI-produced, signed delivery bundle and
a root-only installer that consumes that bundle without reading a caller-
selected checkout:

1. Build the three Go programs for the declared production `GOOS/GOARCH` in a
   clean CI job; record reproducible build inputs and SHA-256 digests.
2. Use the versioned bundle layout/builder to generate a signed bundle
   manifest containing source artifact digests, destination allowlists, exact
   owners/groups/modes, and a bundle digest.
3. Sign the manifest/bundle with the delivery signer; enroll only its public
   key through the root bootstrap procedure. Keep private key material and
   production envelopes out of GitHub-visible artifacts.
4. Have a root-only installer stage files atomically, reject symlinks,
   unexpected paths, duplicate destinations, digest mismatches, and unsafe
   modes, then run `systemd-analyze verify` and `sshd -t` before any reload.
5. Enable/restart only the fixed socket/service after all checks succeed. Do
   not invoke Docker, Compose, Git, or application migrations from the
   installer.
6. Independently verify ownership/modes, socket activation, broker status,
   submitter forced-command behavior, and a signed `VERIFY_ONLY` request that
   returns `VERIFY_ONLY_OK`. Record only public-safe status, version, and
   digest evidence.

## Required unblock inputs

Issue #185 can proceed after the following are supplied through the restricted
operator channel (not GitHub issue/PR text):

- approved production host `GOOS/GOARCH` and a CI build/attestation result;
- signed bundle manifest with per-file digests and an immutable artifact
  location;
- root-approved Ed25519 public-key enrollment and key-rotation record;
- root-bootstrap confirmation for the `munjib-deploy` user and
  `munjib-release-submit` group, without exposing credentials;
- explicit authorization for the host-side root installation and its
  post-install verification window.

Until those inputs exist, the correct state is **not installed / not attested**.
The existing static contract tests must not be reported as proof that the
production host is ready.

## Verification performed in this task

- Reviewed the merged Leaf 13A files and the public runbook/wiki references.
- Confirmed the manifest's listed destination paths do not exist as repository
  source artifacts.
- Added and tested `deploy/delivery/bundle-layout-v1.json`,
  `scripts/deploy/delivery-bundle.ts`, and the build/verify entrypoints. The
  builder/verifier are public-safe packaging code and do not claim host
  installation or key enrollment.
- Confirmed no delivery-substrate installer, Go build step, signer, or
  attestation workflow is present.
- Confirmed the local environment has no `go` executable and no live broker
  socket.
- Did not run a privileged installation or print secrets/remote logs.
