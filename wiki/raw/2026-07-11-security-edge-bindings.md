# Security Edge Headers and Private Bindings Implementation Plan

**Tracking:** Issue #166 · remote branch `issue-166-security-edge-bindings`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put Munjib behind a versioned, testable production edge that always enforces a minimal CSP, promotes the same nonce policy from report-only to enforcement, preserves the already-landed Issue 13 private bindings and containment, and proves every public A/AAAA address rejects ports 3000, 55432, and 11434 while serving valid TLS on 443.

**Architecture:** Leaf 12 rebases after every earlier mutation-producing leaf and ships as two monotonic child releases. Child Release A installs Caddy only from a separately attested `edge-caddy-v1` OCI host-bundle artifact, atomically activates a complete root-owned generation, compiles a closed authenticated-mutation inventory plus candidate-specific Next Server Action id map, and enforces one Leaf 12-owned pre-dispatch request gate without rewriting any earlier mutation implementation. It also enforces the minimal Caddy CSP and publishes `edge-minimal-csp-nonce@1`: Leaf 7's invitation nonce CSP remains enforced while the added global app nonce policy is report-only elsewhere. Child Release B publishes the same capability at v2; its exact candidate requires a signed activation derived from an unchanged CSP-critical artifact set or seven clean days in an isolated synthetic shadow. Production v2 can never downgrade to report-only. The CSP report boundary consumes the durable network bucket before it reads/cancels a bounded query-free stream, then consumes the fingerprint bucket only for a sanitized valid report before privacy-safe Sentry aggregation. A strict dual-stack verifier proves TLS/443 and closed private ports through every public A/AAAA address.

**Tech Stack:** Caddy 2, static Go Caddy bridge/validator binaries, Next.js 15 App Router middleware, Docker Compose, Node.js TCP/fetch APIs only for application/CI probes, Sentry, Vitest, Playwright, GitHub Actions. Node.js is never a production Caddy launcher, bridge, credential reader, or validator.

## Global Constraints

- Issues 1 through 11 plus Issue 13 must be merged, deployed, and represented by their canonical current capability/evidence contracts before Leaf 12 is cut. The authenticated-mutation inventory rebases after every route or Server Action added by Leaves 2, 5, 6, 7, 8, 9, 10, and 11; a pre-rebase inventory snapshot is invalid.
- Issue 13 owns the initial production Web loopback publication and removal of the PostgreSQL host publication. This plan only regression-tests, deploy-verifies, and preserves those bindings.
- Local PostgreSQL host access exists only in `docker-compose.dev.yml`; production defaults never bind it publicly.
- Baseline headers are HSTS with `max-age=31536000; includeSubDomains`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, a minimal Permissions Policy, and removal of `Server`/`X-Powered-By` branding.
- Caddy always enforces `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'none'`, and `img-src 'self' data: blob:`. There is no CSP-off or report-only-only state.
- Next.js builds one nonce policy. In observation it emits those exact bytes as `Content-Security-Policy-Report-Only`; after the evidence gate it emits the same bytes as `Content-Security-Policy`. No separate looser enforcement policy is allowed.
- Child Release A alone contains the added global report-only nonce policy while preserving Leaf 7 invitation enforcement, and promotes `edge-minimal-csp-nonce@1`. Child Release B alone contains global production enforcement and promotes the same id to v2 after candidate-bound evidence. No runtime mode environment variable exists in code, Compose, examples, or operator commands.
- The two edge children have separate GitHub issues, branches, PRs, reviews, digests, deployments, and floor promotions. The v2 capability/activation wiring must not exist in the v1 branch or image.
- v1 rollback selects only another eligible v1 digest. Once v2 is promoted, report-only is a prohibited floor downgrade; rollback selects another eligible v2 digest with matching activation or enters fail-closed maintenance/fix-forward. Private bindings, containment, baseline headers, and minimal Caddy CSP are never removed.
- Automated external probes must fail if ports 3000, 55432, or 11434 accept a TCP connection from outside the production host.
- The probe URL is exactly HTTPS on port 443, has no credentials/query/fragment, and its hostname equals the separately supplied DNS host. Resolve all A and AAAA answers, reject non-public addresses, validate TLS/SNI and HTTP headers through every address, and test all three closed ports on every address.
- Caddy's admin API is disabled; no TCP admin listener is allowed. Configuration changes use only Leaf 13A's forced `/usr/local/libexec/munjib-release-dispatch` with a bounded signed `edge-generation` action; it invokes the internal fixed root unit under the shared global deployment lock. No deploy/human sudoers entry, direct helper command, or mutable checkout root execution exists.
- Preserve the active Trial/password-signup/unlinked-Google containment handlers and the trusted Issue 8 client-network header normalization when installing the versioned Caddy file. A missing containment import blocks deploy.
- CSP report bodies are capped while streaming, cancelled on overflow or timeout, and never buffered with `request.text()`. The route consumes Issue 8's durable fail-closed `CSP_REPORT_NETWORK` and `CSP_REPORT_FINGERPRINT` policies before Sentry; no process-local limiter or permissive outage fallback exists.
- Every exported POST/PUT/PATCH/DELETE route, every classified state-changing GET
  protocol operation, and every exported Server Action is represented in deterministic
  `security/authenticated-mutations.v1.json`, including its existing owner capability
  and body/authentication/resource/journal policy. NextAuth's catchall is a closed
  operation table rather than one module tuple. CI and startup reject missing, stale,
  duplicate, dynamically unsupported, or unclassified mutations, an incomplete/stale
  Next build action-id map, and only *unclassified* GET/HEAD paths that resolve to known
  mutation primitives. Leaf 12 enforces canonical `Origin`,
  `Sec-Fetch-Site: same-origin`, and bounded request admission centrally in its
  Caddy/seam/build surfaces before dispatch; there is no Referer fallback or wildcard
  origin. Existing NextAuth, history, invitation, attachment, AI, workspace, document,
  root `middleware.ts`, and all other prior-leaf modules remain byte-identical.
- Leaf 7 permanently owns root `middleware.ts` with Node runtime and the broad API/RSC
  matcher. Leaf 12 owns only the fixed ninth reservation tuple
  `invite-signup-gate -> edge-minimal-csp-nonce -> lib/security/downstream/leaf12-edge-middleware.ts`
  and transitions that seam `0 -> 1 -> 2`; it never claims, edits, or stages the root.
- Caddy runtime/access logging is explicitly fail closed: request URI/query and request headers are removed or replaced before emission, response headers including `Set-Cookie` are removed, and auth/invitation/CSP-report surfaces are skipped. OAuth code/state/token/error values, cookies, Authorization/Referer/proxy credentials, CSP URLs/bodies, and private paths must be absent from Caddy, systemd, app console, Sentry, deploy logs, and rollback logs; live sentinel tests prove this.
- Production nonce CSP `connect-src` is generated only from the exact catalog `['self', <validated exact Sentry ingest origin when configured>]`. The origin must equal the HTTPS/443 origin parsed from `NEXT_PUBLIC_SENTRY_DSN`, have no credentials/path/query/fragment, match the pinned Sentry ingest hostname grammar, and is hashed into policy/activation evidence. Wildcards such as `https://*.ingest.sentry.io`, arbitrary provider origins, alternate ports, and caller additions are forbidden.
- No production Caddy/helper payload is extracted from the app image. The signed release manifest binds the exact app digest/source/floor to a separately attested deterministic `edge-caddy-v1` OCI artifact digest and manifest hash. The bounded archive parser accepts only manifest-listed regular files and rejects symlink/hardlink/sparse/directory/FIFO/socket/device, absolute/traversal/confusable path, duplicate/extra/trailing member, oversize, and binding mismatch before atomic installation.
- Local and CI Caddy syntax checks use exactly `caddy:2.10.2-alpine@sha256:4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d`; production validates with the installed host binary before reload.
- Never put a public hostname, IP address, provider credential, auth secret, private content, raw CSP URL, or exact production topology into source, tests, logs, issue bodies, or PR text. Runtime hostnames come from protected environment/repository variables.
- This plan and the restricted remediation design remain local-only. Stage only implementation files and public-safe wiki summaries after a separate diff review.
- Every `git commit` command below is shorthand for a mandatory task-local wiki gate: before that commit, update the smallest relevant public-safe wiki page plus `wiki/log.md`, stage those files, run `pnpm wiki:install-hooks`, `pnpm wiki:sync-plan --staged`, `pnpm wiki:manifest`, stage `wiki/manifest.json`, then run `pnpm wiki:lint` and `pnpm wiki:sync-check --staged`. A no-op log entry is forbidden; if a task creates no durable knowledge or source delta, fold it into the next task instead of making a standalone commit.

---

## File Structure

- Create `deploy/caddy/Caddyfile.production`: production reverse proxy and baseline/report-only header policy.
- Create `deploy/caddy/conf.d/munjib-maintenance.caddy`: installed empty import used later by the recovery-window procedure.
- Create `deploy/caddy/conf.d/munjib-containment.caddy`: password-signup and retired Trial/development-provider edge denial preserved through every edge rollout.
- Create `deploy/caddy/conf.d/munjib-log-redaction.caddy`: fail-closed structured request/response redaction and sensitive-route log skipping.
- Create `deploy/caddy/conf.d/munjib-csp-report.caddy`: exact query-free, credential/header-stripped CSP-report proxy handler.
- Create in Task 1 as an installed empty include, then modify in Task 2A:
  `deploy/caddy/conf.d/munjib-authenticated-mutations.caddy` — central request admission
  loaded before the generic reverse proxy and present in every root-bundle manifest.
- Create `deploy/edge/attested-root-bundle/manifest.json`, `deploy/edge/attested-root-bundle/munjib-edge-generation`, and `deploy/edge/attested-root-bundle/munjib-edge-evidence`: deterministic source payload for separately attested `edge-caddy-v1` OCI artifact.
- Create `deploy/edge/attested-root-bundle/dispatcher-operation.json`, `scripts/security/build-edge-root-bundle-manifest.ts`, `tests/security/edge-bootstrap.test.ts`, `tests/security/edge-generation.test.ts`, and `tests/security/edge-log-redaction.test.ts`. Create no leaf sudoers file.
- Preserve Leaf 8's protected `deploy/systemd/caddy.service.d/20-munjib-auth-proxy.conf` and static Go `munjib-caddy-credential-bridge` byte-for-byte. Create `deploy/systemd/caddy.service.d/30-munjib-edge-validation.conf` with only the non-secret public-host EnvironmentFile and fixed `ExecStartPre` validator.
- Create `cmd/munjib-caddy-validate/main.go`: reproducible static Leaf 12 validator built directly by the pinned Go stage in `deploy/caddy/Dockerfile.validation`, with the same systemd-credential invariants, fixed `caddy validate` child, no run mode, and no host interpreter. Create no Node/JavaScript/`.mjs` Caddy bridge, wrapper, or validator builder.
- Create `deploy/caddy/Dockerfile.validation`, `scripts/security/run-caddy-validator-validation.sh`, and `tests/security/caddy-validator-validation.test.ts`: pinned Go-build+Caddy validation harness with a mounted synthetic credential and no direct secret env.
- Verify `docker-compose.yml`/`docker-compose.dev.yml`: preserve Issue 13 production-private and development-loopback bindings; this leaf does not own their first change.
- Modify `next.config.mjs`: disable the Next.js branding header.
- Modify `tests/docker/compose.test.ts`: production/development binding regression assertions.
- Create `tests/security/edge-static-contract.test.ts`: Caddy/header/branding regression assertions.
- Create `lib/security/log-redaction.ts` and `tests/security/log-redaction.test.ts`; modify `lib/observability/sentry-scrub-event.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation-client.ts`, and their scrub tests — one exact allowlisted diagnostic boundary for app console and Sentry.
- Create `lib/security/csp-report.ts`: bounded, privacy-safe CSP report parser.
- Create `lib/security/read-bounded-request-body.ts`: timeout-aware streaming reader with cancellation.
- Create `app/api/security/csp-report/route.ts`: no-store report ingestion endpoint.
- Create `tests/security/csp-report.test.ts`: raw URL/secret non-disclosure and route tests.
- Create `security/authenticated-mutations.v1.json`, `lib/http/authenticated-mutation-gate.ts`, `scripts/security/build-authenticated-mutation-inventory.ts`, `scripts/security/compile-authenticated-mutation-runtime.ts`, `scripts/security/verify-authenticated-mutation-startup.ts`, `tests/security/authenticated-mutation-runtime-adapters.ts`, `tests/security/authenticated-mutation-inventory.test.ts`, `tests/security/authenticated-mutation-build-map.test.ts`, and `tests/security/authenticated-mutation-runtime.test.ts`.
- Modify the Task 1-created `deploy/caddy/conf.d/munjib-authenticated-mutations.caddy`:
  central pre-dispatch Origin/fetch-metadata/content-length/request-body admission for
  mutation methods and every request carrying `Next-Action`. It contains no application
  authorization logic and does not name or replace a prior-leaf handler.
- Create `lib/security/csp.ts`: nonce-enforced CSP builder.
- Create `lib/security/csp-connect-catalog.ts`: exact self plus validated Sentry ingest-origin catalog; no wildcard.
- Create a v1-only `lib/security/csp-activation.ts` in Child A; extend it and create
  `scripts/security/create-csp-carry-forward.ts`,
  `scripts/security/verify-csp-activation.ts`, `tests/security/csp-carry-forward.test.ts`,
  and `tests/security/csp-shadow-observation.test.ts` only in Child B.
- Modify in Task 2A/Task 3 only:
  `lib/security/downstream/leaf12-edge-middleware.ts` — activate Leaf 7's complete
  version-0 context/result seam at v1 and later v2 while root `middleware.ts` remains
  byte-identical.
- Modify `scripts/docker/release-entrypoint.sh`: derive CSP mode only from verified baked floor/activation and reject caller mode overrides.
- Modify `.env.example`, `.env.docker.example`, and `docker-compose.yml`: remove production CSP mode authority; document only the exact non-secret Sentry connect origin contract.
- Create `tests/security/csp.test.ts`: enforced-policy and middleware tests.
- Create `lib/security/edge-probe.ts`: reusable header and closed-port assertions.
- Create `scripts/security/verify-edge-contract.ts`: post-deploy CLI.
- Create `deploy/edge-probe/Dockerfile`, `deploy/edge-probe/manifest.json`, and `tests/security/edge-probe-artifact.test.ts`: fixed-entrypoint separately attested `edge-probe-v1` OCI tool for no-checkout deploy verification.
- Create `lib/security/csp-observation.ts`, `scripts/security/verify-csp-observation.ts`, and `scripts/security/record-csp-observation.ts`: signed v1/shadow observation evidence.
- Create `deploy/security/capabilities/edge-minimal-csp-nonce.json`: canonical stable v1/v2 capability record consumed by Issue 13 promotion.
- Modify `deploy/security/protected-artifact-owners.json` and create `tests/security/edge-protected-artifact-owners.test.ts`: exact `ACTIVE` Leaf 12 owner entries for Leaf 12-only edge/CSP/mutation-gate cores; prior routes and shared aggregates remain owned elsewhere.
- Create `tests/security/edge-probe.test.ts`: probe unit coverage.
- Modify `.github/workflows/ci-cd.yml` and `tests/github-actions/ci-cd.test.ts`: run the post-deploy edge probe.
- Create `docs/runbooks/production-edge.md`: secret-free rollout, listener, report-only, enforcement, and rollback commands.
- Modify `wiki/CI CD And Monitoring Workflow.md`, `wiki/log.md`, and regenerate `wiki/manifest.json`: public-safe durable knowledge.

### Task 1: Version the Baseline Edge and Verify the Existing Private-Binding Floor

**Files:**
- Create: `tests/security/edge-static-contract.test.ts`
- Modify: `tests/docker/compose.test.ts`
- Create: `deploy/caddy/Caddyfile.production`
- Create: `deploy/caddy/conf.d/munjib-maintenance.caddy`
- Create: `deploy/caddy/conf.d/munjib-containment.caddy`
- Create: `deploy/caddy/conf.d/munjib-log-redaction.caddy`
- Create: `deploy/caddy/conf.d/munjib-csp-report.caddy`
- Create: `deploy/caddy/conf.d/munjib-authenticated-mutations.caddy` (installed empty
  include reserved for Task 2A)
- Create: `deploy/edge/attested-root-bundle/manifest.json`
- Create: `deploy/edge/attested-root-bundle/munjib-edge-generation`
- Create: `deploy/edge/attested-root-bundle/munjib-edge-evidence`
- Create: `deploy/edge/attested-root-bundle/dispatcher-operation.json`
- Create: `scripts/security/build-edge-root-bundle-manifest.ts`
- Create: `tests/security/edge-bootstrap.test.ts`
- Create: `tests/security/edge-generation.test.ts`
- Create: `tests/security/edge-log-redaction.test.ts`
- Create: `lib/security/log-redaction.ts`
- Create: `tests/security/log-redaction.test.ts`
- Modify: `lib/observability/sentry-scrub-event.ts`
- Modify: `sentry.server.config.ts`
- Modify: `sentry.edge.config.ts`
- Modify: `instrumentation-client.ts`
- Verify unchanged: `deploy/systemd/caddy.service.d/20-munjib-auth-proxy.conf`, `cmd/munjib-caddy-credential-bridge/main.go`, and `tests/security/caddy-credential-bridge.test.ts`
- Create: `deploy/systemd/caddy.service.d/30-munjib-edge-validation.conf`
- Create: `cmd/munjib-caddy-validate/main.go`
- Create: `deploy/caddy/Dockerfile.validation`
- Create: `scripts/security/run-caddy-validator-validation.sh`
- Create: `tests/security/caddy-validator-validation.test.ts`
- Verify: `docker-compose.yml`
- Verify: `docker-compose.dev.yml`
- Modify: `next.config.mjs`

**Interfaces:**
- Consumes: Caddy's `{$MUNJIB_PUBLIC_HOST}` interpolation, the deployed Leaf 13 `immutable-private-runtime` capability, existing loopback/internal Compose contract, active auth containment include, and host Caddy reverse proxy access to `127.0.0.1:3000`.
- Produces: a versioned Caddy template with admin off, containment and fail-closed log-redaction imports, always-enforced minimal CSP, a separately attested OCI host bundle, atomic root generation activation/rollback, a pinned static-Go validator harness that preserves Leaf 8's separate static-Go runtime bridge, regression proof that Issue 13 bindings remain private, and `poweredByHeader: false`.

- [ ] **Step 1: Add failing static edge assertions**

Create `tests/security/edge-static-contract.test.ts` with:

```ts
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("production edge contract", () => {
  test("versions baseline headers and a self-only image policy", () => {
    const caddy = read("deploy/caddy/Caddyfile.production");

    expect(caddy).toContain("{$MUNJIB_PUBLIC_HOST}");
    expect(caddy).toContain("reverse_proxy 127.0.0.1:3000");
    expect(caddy).toContain("header_up -X-Munjib-Client-IP");
    expect(caddy).toContain("header_up -X-Munjib-Proxy-Authorization");
    expect(caddy).toContain("header_up X-Munjib-Client-IP {remote_host}");
    expect(caddy).toContain("header_up X-Munjib-Proxy-Authorization {$MUNJIB_CADDY_PROXY_HEADER_SECRET}");
    expect(caddy).toContain("Strict-Transport-Security \"max-age=31536000; includeSubDomains\"");
    expect(caddy).toContain("X-Content-Type-Options \"nosniff\"");
    expect(caddy).toContain("Referrer-Policy \"no-referrer\"");
    expect(caddy).toContain("Permissions-Policy");
    expect(caddy).toContain("+Content-Security-Policy");
    expect(caddy).not.toContain("Content-Security-Policy-Report-Only");
    expect(caddy).toContain("frame-ancestors 'none'");
    expect(caddy).toContain("object-src 'none'");
    expect(caddy).toContain("base-uri 'none'");
    expect(caddy).toContain("img-src 'self' data: blob:");
    expect(caddy).toContain("report-uri /api/security/csp-report");
    expect(caddy).toContain("admin off");
    expect(caddy).toContain("import conf.d/munjib-containment.caddy");
    expect(caddy).toContain("import conf.d/munjib-log-redaction.caddy");
    expect(caddy).toContain("import conf.d/munjib-csp-report.caddy");
    expect(caddy).toContain("import conf.d/munjib-authenticated-mutations.caddy");
    expect(caddy).toContain("-Server");
    expect(caddy).toContain("-X-Powered-By");
    expect(caddy).not.toMatch(/img-src[^;\n]*https?:/);
  });

  test("keeps the maintenance import disabled by default", () => {
    const caddy = read("deploy/caddy/Caddyfile.production");
    const disabled = read("deploy/caddy/conf.d/munjib-maintenance.caddy");

    expect(caddy).toContain("import conf.d/munjib-maintenance.caddy");
    expect(disabled.trim()).toBe("# Intentionally empty during normal operation.");
  });

  test("installs the empty mutation include before generic proxying", () => {
    const caddy = read("deploy/caddy/Caddyfile.production");
    const reserved = read("deploy/caddy/conf.d/munjib-authenticated-mutations.caddy");
    expect(reserved.trim()).toBe("# Activated by Leaf 12 Task 2A.");
    expect(caddy.indexOf("import conf.d/munjib-authenticated-mutations.caddy"))
      .toBeLessThan(caddy.indexOf("reverse_proxy 127.0.0.1:3000"));
  });

  test("preserves closed password signup and retired provider containment", () => {
    const containment = read("deploy/caddy/conf.d/munjib-containment.caddy");
    expect(containment).toContain("/api/auth/signup");
    expect(containment).toContain("/api/auth/signin/trial");
    expect(containment).toContain("/api/auth/callback/trial");
    expect(containment).toContain("/api/auth/signin/development-login");
    expect(containment).toContain("/api/auth/callback/development-login");
    expect(containment).toContain("respond @blocked_auth_surface 404");
  });

  test("removes Next.js framework branding", () => {
    expect(read("next.config.mjs")).toContain("poweredByHeader: false");
  });

  test("loads protected edge variables without printing them and validates before start", () => {
    const authUnit = read("deploy/systemd/caddy.service.d/20-munjib-auth-proxy.conf");
    const edgeUnit = read("deploy/systemd/caddy.service.d/30-munjib-edge-validation.conf");
    const bridge = read("cmd/munjib-caddy-credential-bridge/main.go");
    const validator = read("cmd/munjib-caddy-validate/main.go");
    expect(edgeUnit).toContain("EnvironmentFile=/etc/munjib/caddy-public.env");
    expect(edgeUnit).toContain("ExecStartPre=/usr/local/libexec/munjib-caddy-validate");
    expect(authUnit).toContain("LoadCredential=munjib_proxy_header_current:");
    expect(authUnit).toContain("ExecStart=/usr/local/libexec/munjib-caddy-credential-bridge");
    expect(authUnit + edgeUnit + bridge + validator).not.toContain("--environ");
    expect(validator).toContain("MUNJIB_CADDY_PROXY_CREDENTIAL_NAME");
    expect(validator).toContain('"validate"');
    expect(validator).not.toContain('"run"');
    expect(validator).not.toContain("set -x");
    expect(bridge).toContain("package main");
    expect(validator).toContain("package main");
    expect(existsSync(join(process.cwd(), "deploy/systemd/caddy.service.d/munjib-security.conf"))).toBe(false);
    expect(existsSync(join(process.cwd(), "deploy/caddy/munjib-caddy-run"))).toBe(false);
    for (const stale of [
      "deploy/caddy/munjib-caddy-run.mjs",
      "scripts/security/munjib-caddy-credential-bridge.mjs",
      "scripts/security/build-caddy-validator.ts",
    ]) expect(existsSync(join(process.cwd(), stale))).toBe(false);
  });
});
```

Extend the parsed Compose type in `tests/docker/compose.test.ts` so a service may have `ports?: string[]`, then add:

```ts
  test("keeps production listeners private and development database access explicit", () => {
    const production = readCompose();
    const development = parse(read("docker-compose.dev.yml")) as {
      services: Record<string, { ports?: string[] }>;
    };

    expect(production.services.postgres.ports).toBeUndefined();
    expect(production.services.web.ports).toEqual([
      "127.0.0.1:${WEB_PORT:-3000}:3000",
    ]);
    expect(development.services.postgres.ports).toEqual([
      "127.0.0.1:${POSTGRES_PORT:-55432}:5432",
    ]);
  });
```

- [ ] **Step 2: Run the focused contracts and verify RED**

Run:

```bash
pnpm exec vitest run tests/security/edge-static-contract.test.ts tests/security/caddy-credential-bridge.test.ts tests/security/caddy-validator-validation.test.ts tests/docker/compose.test.ts --reporter=dot
```

Expected: FAIL because the versioned Caddy/admin/minimal-CSP contract, separate
static-Go validation harness, and branding change do not exist. If the Compose assertions fail, stop and repair/redeploy Issue 13
on its own branch before continuing; Leaf 12 must not assume ownership by silently
editing the initial private bindings.

- [ ] **Step 3: Create the production Caddy template**

Create `deploy/caddy/Caddyfile.production` with:

```caddyfile
{
	admin off
	log default {
		format filter {
			wrap json
			fields {
				request>uri replace REDACTED
				request>headers delete
				resp_headers delete
			}
		}
	}
}

{$MUNJIB_PUBLIC_HOST} {
	import conf.d/munjib-maintenance.caddy
	import conf.d/munjib-containment.caddy
	import conf.d/munjib-log-redaction.caddy
	import conf.d/munjib-csp-report.caddy
	import conf.d/munjib-authenticated-mutations.caddy

	encode zstd gzip
	reverse_proxy 127.0.0.1:3000 {
		header_up -X-Munjib-Client-IP
		header_up -X-Munjib-Proxy-Authorization
		header_up X-Munjib-Client-IP {remote_host}
		header_up X-Munjib-Proxy-Authorization {$MUNJIB_CADDY_PROXY_HEADER_SECRET}
	}

	header {
		defer
		-Server
		-X-Powered-By
	}

	header {
		defer
		Strict-Transport-Security "max-age=31536000; includeSubDomains"
		X-Content-Type-Options "nosniff"
		Referrer-Policy "no-referrer"
		Permissions-Policy "camera=(), geolocation=(), microphone=(), payment=(), usb=()"
		X-Frame-Options "DENY"
		+Content-Security-Policy "base-uri 'none'; object-src 'none'; frame-ancestors 'none'; img-src 'self' data: blob:; report-uri /api/security/csp-report"
	}
}
```

Create `deploy/caddy/conf.d/munjib-maintenance.caddy` with:

```caddyfile
# Intentionally empty during normal operation.
```

Create `deploy/caddy/conf.d/munjib-authenticated-mutations.caddy` with exactly:

```caddyfile
# Activated by Leaf 12 Task 2A.
```

It is imported and packaged now so Task 2A cannot create an uninstalled include. The
static, adapted-JSON, and live-Caddy tests require the baseline policy to compile as an
additive response-field operation. When an upstream invitation or nonce policy is also
present, both CSP field values must survive as separate policies; a deferred unprefixed
set operation that overwrites the upstream policy fails.

Create `deploy/caddy/conf.d/munjib-containment.caddy` with:

```caddyfile
@blocked_auth_surface {
	path /api/auth/signup /api/auth/signin/trial /api/auth/callback/trial /api/auth/signin/development-login /api/auth/callback/development-login
}
respond @blocked_auth_surface 404
```

Create `deploy/caddy/conf.d/munjib-log-redaction.caddy` with an exact sensitive-route
matcher covering `/api/auth/*`, every invitation-attempt/invitation route, and
`/api/security/csp-report`; apply `log_skip` to that matcher. For all remaining access
logs use the same filter encoder shown in the global logger: replace the whole URI so
no query/path escapes, delete the complete request-header object, and delete response
headers including `Set-Cookie`. No unfiltered access/runtime fallback logger is
permitted. `tests/security/edge-log-redaction.test.ts` validates adapted JSON and runs
the pinned Caddy with sentinel OAuth code/state/id/access-token/error query values,
invitation tokens, CSP URLs/samples, Cookie, Authorization, Proxy-Authorization,
Referer, `X-Munjib-Proxy-Authorization`, and response `Set-Cookie`; none may appear in
access/runtime stdout or stderr.

`lib/security/log-redaction.ts` accepts only fixed event names, stable error codes,
closed classification tags, status class, and bounded numeric duration/count; unknown
keys or arbitrary strings fail closed. Auth/OAuth/invitation/CSP code logs only through
this boundary. Extend the existing Sentry scrubber and every server/edge/browser
initializer so `beforeSend`/`beforeBreadcrumb` remove request URL/query, headers,
cookies, user, breadcrumbs, extra/context/body, response headers, and native exception
messages before allowing only those fixed classifications. A scrub error drops the
event rather than sending raw input. The credential bridge/systemd helpers retain
no-output or stable-code-only behavior. Unit and live tests capture app console, Caddy,
systemd journal, and Sentry transport and require zero sentinel occurrence.

Keep Leaf 8's protected
`deploy/systemd/caddy.service.d/20-munjib-auth-proxy.conf` and statically linked Go
`/usr/local/libexec/munjib-caddy-credential-bridge` unchanged. Leaf 12 creates the
separately owned `deploy/systemd/caddy.service.d/30-munjib-edge-validation.conf` with
only:

```ini
[Service]
EnvironmentFile=/etc/munjib/caddy-public.env
ExecStartPre=/usr/local/libexec/munjib-caddy-validate
```

The separately attested, statically linked Go `munjib-caddy-validate` reuses the exact
Leaf 8 protected `internal/caddyauthcredential` package without modifying it and
contains no second credential-validation implementation; a source-contract test pins
that import and rejects local file/secret parsing. It cannot run the service and accepts no argv,
path, command, environment override, or mode. It performs the same no-follow/same-FD
regular-file/owner/mode/nlink/size/canonical-secret checks against
`$CREDENTIALS_DIRECTORY/$MUNJIB_CADDY_PROXY_CREDENTIAL_NAME`, clears secret-like
environment, retains only the fixed non-secret `MUNJIB_PUBLIC_HOST`, and launches
exactly `/usr/bin/caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile`
without `--environ`. Tests prove there is one Leaf 8 credential drop-in/LoadCredential/
bridge, one separate Leaf 12 validation drop-in/validator, and no Node, shell,
duplicate credential reader, or later-leaf modification of a Leaf 8 protected path.

Leaf 7's application guard remains the authority for unlinked Google identities;
Task 5's browser matrix proves an uninvited/unlinked Google callback remains denied.

- [ ] **Step 4: Verify Issue 13 ownership and remove Next.js branding**

Do not change either Compose port mapping in this task. Run the existing Issue 13
Compose/private-binding tests and require production Web exactly
`127.0.0.1:${WEB_PORT:-3000}:3000`, production PostgreSQL with no `ports` key, and
development PostgreSQL exactly `127.0.0.1:${POSTGRES_PORT:-55432}:5432`. Add this
property immediately inside `nextConfig` in `next.config.mjs`:

```js
  poweredByHeader: false,
```

- [ ] **Step 5: Run contracts and Caddy validation and verify GREEN**

Run:

```bash
pnpm exec vitest run tests/security/edge-static-contract.test.ts tests/security/caddy-credential-bridge.test.ts tests/security/caddy-validator-validation.test.ts tests/docker/compose.test.ts --reporter=dot
scripts/security/run-caddy-validator-validation.sh
docker compose -f docker-compose.yml config >/dev/null
docker compose -f docker-compose.yml -f docker-compose.dev.yml config >/dev/null
```

The validation Dockerfile pins the reviewed Go builder and Caddy images and runs only
`CGO_ENABLED=0 go build -trimpath -buildvcs=false` for
`cmd/munjib-caddy-validate`; no Node image, package runner, `.js`, or `.mjs` helper is
part of the build or production payload. The script
creates a mode-`0400` synthetic credential in a `0700` temp directory, mounts it
read-only as `CREDENTIALS_DIRECTORY`, supplies only its non-secret credential name and
public host, and invokes the static validator with no arguments. The validator alone puts
`MUNJIB_CADDY_PROXY_HEADER_SECRET` in the child environment and then executes exact
`caddy validate`; the script traps and deletes the file/directory. Direct secret env,
host Node/shell, `--environ`, alternate child commands, and tag-only images fail
source-contract tests.

Expected: Vitest passes, the preserved Leaf 8 static Go bridge plus separate Leaf 12
static Go validator produce `Valid configuration`, and both Compose configs exit 0.

- [ ] **Step 6: Publish and activate one attested edge generation**

CI deterministically packages Caddyfile, containment/maintenance/log/CSP-report and
the installed empty authenticated-mutation includes, the
Leaf 12 validation drop-in/static validator, internal generation/evidence units,
manifest, and forced-dispatch operation descriptor as the
separately attested `edge-caddy-v1` OCI host-bundle artifact. The signed release
manifest binds artifact digest/manifest hash to exact app digest/source/floor/bundle
id/signing identity. The manifest also binds the required already-installed Leaf 8
credential drop-in/bridge digests as immutable prerequisites but does not package or
overwrite them. The app image is not a privileged-payload source.

The protected deploy workflow submits one bounded signed envelope to Leaf 13A's forced
dispatcher with exact current app digest, `edge-caddy-v1` artifact binding, monotonic
sequence, nonce, expiry, expected previous generation, and literal `edge-generation`
action. The dispatcher resolves by bound artifact digest, independently verifies
provenance, and applies the bounded regular-file-only archive contract. It rejects caller
artifact/path/tag/destination/env/key, mutable checkout input, app-container extraction,
symlink/hardlink/sparse/directory/FIFO/socket/device, traversal/absolute/confusable
path, duplicate/extra/trailing member, oversize, and every binding/hash/mode mismatch.

The forced dispatcher accepts signed `activate`, `verify`, or `rollback` and invokes
the internal fixed root unit with no caller arguments; there is no direct helper or
sudoers path. The unit clears caller environment and acquires the shared global
deployment lock. `activate` derives current app/artifact/floor records, stages immutable
`/var/lib/munjib/edge/generations/<digest>-<manifest-sha256>`, verifies manifest and
member ownership/modes, containment/log imports, admin-off/listeners, static validator
with a synthetic credential, `caddy validate`, and `systemd-analyze verify`. Only then
does it atomically switch stable Caddy/systemd paths, run daemon-reload/restart, verify
health/listeners/containment/redaction, and publish root current-generation evidence.

Any failure restores the previous attested generation, daemon-reloads/restarts, and
re-verifies it. If rollback also fails, leave fail-closed maintenance and emit only
`EDGE_GENERATION_ROLLBACK_FAILED`; never leave mixed files. Manual `rollback` selects
only a still-eligible same-capability generation. Tests inject failure at every step,
assert one global lock, atomic switch, exact rollback, no checkout/root install, and no
half-generation.

- [ ] **Step 7: Commit the green baseline edge**

```bash
git add deploy/caddy deploy/edge/attested-root-bundle scripts/security/build-edge-root-bundle-manifest.ts cmd/munjib-caddy-validate/main.go scripts/security/run-caddy-validator-validation.sh deploy/systemd/caddy.service.d/30-munjib-edge-validation.conf next.config.mjs tests/security/edge-static-contract.test.ts tests/security/caddy-validator-validation.test.ts tests/security/edge-bootstrap.test.ts tests/security/edge-generation.test.ts tests/security/edge-log-redaction.test.ts tests/docker/compose.test.ts
git commit -m "feat: add private production edge baseline"
```

Expected: one green commit with no hostname, IP address, or secret value.

### Task 2: Ingest CSP Reports Without Collecting URLs or Content

**Files:**
- Create: `lib/security/csp-report.ts`
- Create: `lib/security/read-bounded-request-body.ts`
- Create: `lib/security/csp-report-guard.ts`
- Create: `app/api/security/csp-report/route.ts`
- Create: `tests/security/csp-report.test.ts`
- Modify: `deploy/caddy/conf.d/munjib-csp-report.caddy`
- Modify: `deploy/edge/attested-root-bundle/manifest.json`
- Modify: `tests/security/edge-log-redaction.test.ts`
- Consume unchanged: `lib/auth/abuse/policies.ts` — Leaf 8 already owns the exact CSP report policies.

**Interfaces:**
- Consumes: legacy `{ "csp-report": ... }` and Reporting API `[{ body: ... }]` streams; Issue 8 trusted network HMAC plus atomic PostgreSQL limiter; exact policies `CSP_REPORT_NETWORK` (capacity 60, refill one/second) and `CSP_REPORT_FINGERPRINT` (capacity one, refill one/600 seconds).
- Produces: a query-free/header-and-cookie-stripped hard 16 KiB/2-second cancel-on-overflow reader, `parseCspReport(body): SanitizedCspReport | null`, durable fail-closed network/fingerprint admission, and a `POST` route that sends only directive/disposition/blocked-target/status classifications to Sentry once per dedupe window.

- [ ] **Step 1: Write failing parser and route tests**

Create `tests/security/csp-report.test.ts` with:

```ts
import * as Sentry from "@sentry/nextjs";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { POST } from "@/app/api/security/csp-report/route";
import { parseCspReport } from "@/lib/security/csp-report";
import { readBoundedRequestBody } from "@/lib/security/read-bounded-request-body";

vi.mock("@sentry/nextjs", () => ({ captureMessage: vi.fn() }));
const guard = vi.hoisted(() => {
  class Unavailable extends Error {}
  return { network: vi.fn(), fingerprint: vi.fn(), Unavailable };
});
vi.mock("@/lib/security/csp-report-guard", () => ({
  guardCspReportNetwork: guard.network,
  guardCspReportFingerprint: guard.fingerprint,
  CspReportGuardUnavailableError: guard.Unavailable,
}));

function streamedRequest(chunks: Uint8Array[], stall = false) {
  let cancelled = false;
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (stall) return new Promise<void>(() => undefined);
      const chunk = chunks[index++];
      if (chunk) controller.enqueue(chunk);
      else controller.close();
    },
    cancel() { cancelled = true; },
  });
  return {
    request: new Request("https://app.invalid/api/security/csp-report", {
      method: "POST", body, duplex: "half",
    } as RequestInit & { duplex: "half" }),
    cancelled: () => cancelled,
  };
}

function reportRequest() {
  return new Request("https://app.invalid/api/security/csp-report", {
    method: "POST",
    headers: { "content-type": "application/csp-report" },
    body: JSON.stringify({ "csp-report": { "effective-directive": "img-src", "blocked-uri": "inline" } }),
  });
}

describe("CSP report ingestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    guard.network.mockResolvedValue({ allowed: true });
    guard.fingerprint.mockResolvedValue({ allowed: true });
  });

  test("keeps only bounded classifications", () => {
    const body = JSON.stringify({
      "csp-report": {
        "document-uri": "https://private.example/workspaces/secret?token=never-log",
        "blocked-uri": "https://attacker.example/pixel?document=private",
        "effective-directive": "img-src",
        disposition: "report",
        "status-code": 200,
        sample: "private document content",
      },
    });

    expect(parseCspReport(body)).toEqual({
      effectiveDirective: "img-src",
      disposition: "report",
      blockedTarget: "external",
      statusCode: 200,
    });
    expect(JSON.stringify(parseCspReport(body))).not.toMatch(
      /private|attacker|token|document content/,
    );
  });

  test("rejects oversized and malformed reports", () => {
    expect(parseCspReport("x".repeat(16 * 1024 + 1))).toBeNull();
    expect(parseCspReport("not-json")).toBeNull();
  });

  test("cancels a chunked body on overflow or timeout without request.text", async () => {
    const overflow = streamedRequest([new Uint8Array(9_000), new Uint8Array(9_000)]);
    await expect(readBoundedRequestBody(overflow.request, { maxBytes: 16 * 1024, timeoutMs: 2_000 }))
      .rejects.toThrow("CSP_BODY_TOO_LARGE");
    expect(overflow.cancelled()).toBe(true);
    const stalled = streamedRequest([], true);
    await expect(readBoundedRequestBody(stalled.request, { maxBytes: 16 * 1024, timeoutMs: 10 }))
      .rejects.toThrow("CSP_BODY_TIMEOUT");
    expect(stalled.cancelled()).toBe(true);
    expect(readFileSync("app/api/security/csp-report/route.ts", "utf8")).not.toContain("request.text(");
  });

  test("uses durable network and fingerprint admission and fails closed", async () => {
    guard.network.mockResolvedValueOnce({ allowed: false });
    expect((await POST(reportRequest())).status).toBe(204);
    expect(guard.fingerprint).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).not.toHaveBeenCalled();

    guard.network.mockRejectedValueOnce(new guard.Unavailable("RATE_STORE"));
    const unavailable = await POST(reportRequest());
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toEqual({ error: { code: "CSP_REPORT_GUARD_UNAVAILABLE" } });
  });

  test("captures only sanitized tags and returns no-store 204", async () => {
    const response = await POST(
      new Request("https://app.invalid/api/security/csp-report", {
        method: "POST",
        headers: { "content-type": "application/csp-report" },
        body: JSON.stringify({
          "csp-report": {
            "document-uri": "https://private.example/secret",
            "blocked-uri": "inline",
            "effective-directive": "script-src-elem",
            disposition: "report",
            "status-code": 200,
          },
        }),
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(Sentry.captureMessage).toHaveBeenCalledWith("munjib.csp.violation", {
      level: "warning",
      tags: {
        effective_directive: "script-src-elem",
        disposition: "report",
        blocked_target: "inline",
        status_code: "200",
      },
    });
    expect(JSON.stringify(vi.mocked(Sentry.captureMessage).mock.calls)).not.toContain(
      "private.example",
    );
  });
});
```

Add route tests proving a non-empty query, fragment-like encoded query, Cookie,
Authorization, Proxy-Authorization, Referer, client-supplied trusted-proxy header,
unsupported/duplicate content type, or unexpected content encoding is rejected before
body read, limiter use, parser, or Sentry. Successful responses contain no `Set-Cookie`.
Run the live Caddy sentinel harness with OAuth/CSP/invitation query/header/body values
and assert they are absent from Caddy runtime/access logs, systemd journal capture,
application stdout/stderr, and Sentry calls.

Instrument the body reader and require the durable network bucket before its first
call. A network denial or network-store outage performs zero body reads and zero
fingerprint work. Malformed JSON, invalid report shape, chunk overflow, timeout, and
unsupported sanitized fields have already consumed the network bucket; only a valid
sanitized classification tuple consumes the fingerprint bucket. Opposite
current/previous key orders remain lexicographically identical and every active epoch
must admit. No test, source, or adapter may reference a single-key
`requireTrustedNetworkKeyHash` or `consumeAuthRateLimit` API.

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
pnpm exec vitest run tests/security/csp-report.test.ts --reporter=dot
```

Expected: FAIL because the parser and route do not exist.

- [ ] **Step 3: Implement the bounded parser**

Create `lib/security/csp-report.ts` with:

```ts
export const MAX_CSP_REPORT_BYTES = 16 * 1024;

export type BlockedTargetClass =
  | "inline"
  | "eval"
  | "data"
  | "blob"
  | "self"
  | "external"
  | "unknown";

export type SanitizedCspReport = {
  effectiveDirective: string;
  disposition: "report" | "enforce" | "unknown";
  blockedTarget: BlockedTargetClass;
  statusCode: number;
};

const SAFE_DIRECTIVE = /^[a-z0-9-]{1,64}$/;

export function classifyBlockedTarget(value: unknown, documentUrl: unknown): BlockedTargetClass {
  if (value === "inline") return "inline";
  if (value === "eval") return "eval";
  if (typeof value !== "string") return "unknown";
  if (value.startsWith("data:")) return "data";
  if (value.startsWith("blob:")) return "blob";
  try {
    const blocked = new URL(value);
    const document = typeof documentUrl === "string" ? new URL(documentUrl) : null;
    return document && blocked.origin === document.origin ? "self" : "external";
  } catch {
    return "unknown";
  }
}

export function parseCspReport(body: string): SanitizedCspReport | null {
  if (Buffer.byteLength(body, "utf8") > MAX_CSP_REPORT_BYTES) return null;
  try {
    const payload = JSON.parse(body) as unknown;
    const root = Array.isArray(payload) ? payload[0] : payload;
    if (!root || typeof root !== "object") return null;
    const record = root as Record<string, unknown>;
    const candidate =
      (record["csp-report"] as Record<string, unknown> | undefined) ??
      (record.body as Record<string, unknown> | undefined) ??
      record;
    if (!candidate || typeof candidate !== "object") return null;
    const directiveValue = candidate["effective-directive"] ?? candidate.effectiveDirective;
    const effectiveDirective =
      typeof directiveValue === "string" && SAFE_DIRECTIVE.test(directiveValue)
        ? directiveValue
        : "unknown";
    const dispositionValue = candidate.disposition;
    const disposition =
      dispositionValue === "report" || dispositionValue === "enforce"
        ? dispositionValue
        : "unknown";
    const statusValue = candidate["status-code"] ?? candidate.statusCode;
    const statusCode =
      typeof statusValue === "number" && Number.isInteger(statusValue) && statusValue >= 0 && statusValue <= 599
        ? statusValue
        : 0;
    return {
      effectiveDirective,
      disposition,
      blockedTarget: classifyBlockedTarget(
        candidate["blocked-uri"] ?? candidate.blockedURL,
        candidate["document-uri"] ?? candidate.documentURL,
      ),
      statusCode,
    };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Implement the no-store route**

Before the route, create `readBoundedRequestBody(request, { maxBytes, timeoutMs })`.
It gets `request.body.getReader()`, races every `reader.read()` against one absolute
deadline, appends chunks only while the cumulative byte count is within 16 KiB, calls
and awaits `reader.cancel()` on overflow/timeout/error, clears the timer and releases
the lock in `finally`, and decodes UTF-8 only after EOF. A missing body is an empty
string. It throws only stable `CSP_BODY_TOO_LARGE`, `CSP_BODY_TIMEOUT`, or
`CSP_BODY_READ_FAILED`; it never calls `request.text()`, `arrayBuffer()`, or logs bytes.

Consume the two exact policies already present in Issue 8's frozen catalog; Leaf 12
does not modify that catalog. `guardCspReportNetwork(request)` calls only
`trustedClientNetwork(request, runtime)`,
`authIdentifierHmacKeys("csp-report-network", canonicalPrefix, runtime)`, and
`consumeAuthRateLimitKeys(..., CSP_REPORT_NETWORK, sortedKeys)`. It runs before any
body read or parse. `guardCspReportFingerprint(report)` canonicalizes the four already
sanitized classification fields, derives one-or-two keys only through
`authIdentifierHmacKeys("csp-report-fingerprint", tuple, runtime)`, and consumes
`CSP_REPORT_FINGERPRINT`. It runs only for a valid report. Either store error throws
`CspReportGuardUnavailableError`; there is no Map/LRU/process fallback, single-key
shortcut, caller-defined domain/policy, raw IP, URL, directive sample, or body in either
key/table.

Create `app/api/security/csp-report/route.ts` with:

```ts
import * as Sentry from "@sentry/nextjs";
import { MAX_CSP_REPORT_BYTES, parseCspReport } from "@/lib/security/csp-report";
import {
  guardCspReportFingerprint,
  guardCspReportNetwork,
  CspReportGuardUnavailableError,
} from "@/lib/security/csp-report-guard";
import { readBoundedRequestBody } from "@/lib/security/read-bounded-request-body";

export async function POST(request: Request) {
  const url = new URL(request.url);
  if (url.search !== "" || request.headers.has("cookie") ||
    request.headers.has("authorization") || request.headers.has("proxy-authorization") ||
    request.headers.has("referer") || request.headers.has("content-encoding")) {
    return noStore(400);
  }
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/csp-report" && contentType !== "application/reports+json") {
    return noStore(415);
  }
  try {
    const networkDecision = await guardCspReportNetwork(request);
    if (!networkDecision.allowed) return noStore(204);
    const length = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(length) && length > MAX_CSP_REPORT_BYTES) return noStore(413);
    const body = await readBoundedRequestBody(request, {
      maxBytes: MAX_CSP_REPORT_BYTES,
      timeoutMs: 2_000,
    });
    const report = parseCspReport(body);
    if (!report) return noStore(204);
    const fingerprintDecision = await guardCspReportFingerprint(report);
    if (!fingerprintDecision.allowed) return noStore(204);
    Sentry.captureMessage("munjib.csp.violation", {
      level: "warning",
      tags: {
        effective_directive: report.effectiveDirective,
        disposition: report.disposition,
        blocked_target: report.blockedTarget,
        status_code: String(report.statusCode),
      },
    });
    return noStore(204);
  } catch (error) {
    if (error instanceof CspReportGuardUnavailableError) {
      Sentry.captureMessage("munjib.csp.guard_unavailable", {
        level: "error",
        tags: { cause: "RATE_STORE" },
      });
      return Response.json(
        { error: { code: "CSP_REPORT_GUARD_UNAVAILABLE" } },
        { status: 503, headers: { "cache-control": "private, no-store", "retry-after": "30" } },
      );
    }
    if (error instanceof Error && error.message === "CSP_BODY_TOO_LARGE") return noStore(413);
    if (error instanceof Error && error.message === "CSP_BODY_TIMEOUT") return noStore(408);
    return noStore(400);
  }
}

function noStore(status: number) {
  return new Response(null, { status, headers: { "cache-control": "private, no-store" } });
}
```

Create `deploy/caddy/conf.d/munjib-csp-report.caddy` as a higher-priority exact-path
handler for `/api/security/csp-report`. Reject a non-empty query before proxying; remove
Cookie, Authorization, Proxy-Authorization, Referer, and every client-supplied
`X-Munjib-*`/forwarded identity header; inject only the canonical Leaf 8 trusted client
identity and proxy proof; do not add response cookies. Import it before the generic
reverse proxy and include it in `edge-caddy-v1`. The sensitive matcher remains
`log_skip`, while global filter redaction protects errors before matcher routing.

- [ ] **Step 5: Run the parser/route tests and verify GREEN**

Run:

```bash
pnpm exec vitest run tests/security/csp-report.test.ts tests/auth/postgres-rate-limit.test.ts tests/auth/auth-guard-outage.test.ts --reporter=dot
pnpm exec tsc --noEmit --pretty false
```

Expected: both commands exit 0; tests pass without emitting any raw URL or report body.

- [ ] **Step 6: Commit the green report boundary**

```bash
git add lib/security/csp-report.ts lib/security/read-bounded-request-body.ts lib/security/csp-report-guard.ts app/api/security/csp-report/route.ts tests/security/csp-report.test.ts deploy/caddy/conf.d/munjib-csp-report.caddy deploy/edge/attested-root-bundle/manifest.json tests/security/edge-log-redaction.test.ts wiki/CI\ CD\ And\ Monitoring\ Workflow.md wiki/log.md
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git commit -m "feat: collect privacy-safe CSP reports"
```

Expected: one green report-ingestion commit.

### Task 2A: Compile and Enforce the Complete Authenticated Mutation Inventory

**Files:**
- Create: `security/authenticated-mutations.v1.json`
- Create: `lib/http/authenticated-mutation-gate.ts`
- Create: `scripts/security/build-authenticated-mutation-inventory.ts`
- Create: `scripts/security/compile-authenticated-mutation-runtime.ts`
- Create: `scripts/security/verify-authenticated-mutation-startup.ts`
- Modify: `deploy/caddy/conf.d/munjib-authenticated-mutations.caddy`
- Modify: `deploy/edge/attested-root-bundle/manifest.json`
- Create: `tests/security/authenticated-mutation-inventory.test.ts`
- Create: `tests/security/authenticated-mutation-build-map.test.ts`
- Create: `tests/security/authenticated-mutation-runtime-adapters.ts`
- Create: `tests/security/authenticated-mutation-runtime.test.ts`
- Modify: `lib/security/downstream/leaf12-edge-middleware.ts`
- Verify byte-identical: `middleware.ts`
- Modify: `next.config.mjs`
- Modify: `package.json`
- Modify: `scripts/docker/release-entrypoint.sh`
- Modify: `.github/workflows/ci-cd.yml`
- Modify: `tests/github-actions/ci-cd.test.ts`
- Modify: `tests/security/edge-log-redaction.test.ts`
- Modify: `wiki/CI CD And Monitoring Workflow.md`
- Modify: `wiki/log.md`

**Interfaces:**
- Consumes: the fully rebased App Router tree, canonical public origin, Next's candidate build output, Leaf 8 request guards, current session/resource/ACL resolvers, invitation/OAuth protocol guards, canonical journal-kind registry, and a closed Leaf 12 test-adapter registry that invokes prior-owner exports without modifying them.
- Produces: one deterministic closed source manifest, one untracked candidate-bound
  build map from Next action ids to inventory ids, and one Leaf 12-owned Caddy/reserved-
  seam admission gate. It never wraps, exports, imports for replacement, or edits a
  prior-leaf mutation module or root middleware.

- [ ] **Step 1: Write the RED inventory, build-map, ownership, and central-gate tests**

The static test takes SHA-256 snapshots of every discovered mutation module before the
Leaf 12 change and proves the implementation diff leaves all of them unchanged. Pin
explicit named sentinels for the canonical NextAuth route, AI-history routes/actions,
invitation attempt/acceptance routes/actions, and every other inventory entry; a prior
owner module in the staged diff is an immediate failure. The AST fixture matrix covers
aliases, re-exports, top-level `"use server"`, route methods, unsupported computed or
dynamic exports, and GET/HEAD reachability to known mutation primitives.

The build-map test supplies synthetic Next `server-reference-manifest` variants and
rejects an unknown, missing, duplicate, stale, cross-build, or unmapped action id. The
runtime test enumerates every inventory entry and invokes its central test adapter
through the real exported prior-owner implementation. It must observe the declared body
limit/parser boundary, authentication or registered anonymous protocol proof, active
resource/ACL decision, and exact journal-kind behavior. A label-only/mock-only entry,
an entry with no executable owner evidence, or an entry that passes only the central
gate fails.

For the central gate, RED tests prove wrong/missing `Origin`, `Origin: null`, forwarded-
host inference, wrong/missing `Sec-Fetch-Site`, unsupported content type, malformed or
conflicting length/transfer framing, oversized declared length, and chunked/HTTP2 body
overflow fail before dispatch. They also prove
an unknown `Next-Action` cannot bypass the central policy and reaches no owner handler,
a valid mapped request reaches the original handler exactly once, and the gate never
claims session/resource/journal authorization.

Run:

```bash
pnpm exec vitest run tests/security/authenticated-mutation-inventory.test.ts tests/security/authenticated-mutation-build-map.test.ts tests/security/authenticated-mutation-runtime.test.ts tests/github-actions/ci-cd.test.ts --reporter=dot
```

Expected: FAIL because the closed inventory, candidate action-id map, startup verifier,
and central pre-dispatch gate do not exist. Record the exact discovered prior-owner file
hashes as test fixtures; do not edit those files to make the test pass.

- [ ] **Step 2: Define the exact closed source manifest**

```ts
export type AuthenticatedMutationInventoryEntryV1 = {
  id: string;
  kind: "route" | "server-action";
  module: string;
  exportName: string;
  methods: Array<"GET" | "POST" | "PUT" | "PATCH" | "DELETE">;
  routePattern: string;
  protocolOperation:
    | "none"
    | "nextauth:start"
    | "nextauth:callback"
    | "nextauth:session"
    | "nextauth:signout"
    | "nextauth:csrf"
    | "nextauth:providers"
    | "nextauth:error";
  ownerCapability: `${string}@${number}`;
  authentication: "session" | "anonymous-protocol";
  provenance: "same-origin" | "oauth-state-pkce" | "invitation-attempt" | "csp-report";
  bodyLimitBytes: number;
  contentTypes: string[];
  authorization:
    | "workspace-active"
    | "document-write"
    | "invitation-attempt"
    | "auth-protocol"
    | "csp-report";
  reductionJournalKinds: string[];
  runtimeEvidence: { testModule: string; caseId: string };
};
```

The outer exact-key document is `{ "format":
"munjib-authenticated-mutations-v1", "entries": [...] }`, sorted by id. Reject
unknown fields, duplicate ids or
module/export/method/routePattern/protocolOperation tuples, arbitrary policy labels,
unregistered journal kinds, noncanonical paths, noncanonical capability ids, missing
runtime evidence, and entries not present in the AST. `runtimeEvidence` is a public-safe
test selector, not a bypass: it must resolve to the closed central
`authenticated-mutation-runtime-adapters.ts` registry, whose adapter imports and invokes
the actual exported prior-owner code without changing that source.

- [ ] **Step 3: Discover every mutation and compile the candidate Next action-id map**

Build a `ts.Program` and use the type checker, never regex, to resolve all exported
GET/POST/PUT/PATCH/DELETE route handlers including aliases/re-exports and every exported
function/function-valued binding in a top-level `"use server"` module. Expand the
canonical NextAuth catchall into its closed route-pattern/operation table; a GET start,
callback, session, or signout operation is represented separately and receives only its
declared protocol proof. Resolve imported symbol identities so an unclassified GET/HEAD
handler that reaches a known Prisma/service mutation primitive fails. A classified
state-changing GET is not rejected merely for using GET. Unsupported dynamic exports
fail closed. Generated canonical
bytes must equal the committed JSON exactly; a new, removed, renamed, stale, duplicate,
or unclassified mutation breaks CI.

The inventory is cut only after rebasing auth/NextAuth/signup, Google-link,
invitation-attempt/acceptance/workspace invitation, workspace/document/folder/comment/
attachment actions, AI ask/chat/thread/reset/policy actions, CSP report, and all Leaf 11
explicit import actions. The AST result, not this prose list, is authoritative.

After `next build`, `compile-authenticated-mutation-runtime.ts` reads the candidate's
exact `.next/server/server-reference-manifest.json`, resolves each opaque Next action id
back to one and only one source inventory entry, and writes canonical untracked bytes to
`.next/munjib-security/authenticated-mutations.runtime.json`. The exact-key output binds
`buildId`, source SHA, inventory SHA-256, Next manifest SHA-256, every route tuple, and
every action id/inventory id tuple. No action id is committed or copied across builds.
The package build command and CI run source verification before `next build`, compile
the runtime map after it, and then run the startup verifier. A missing/extra/dynamic/
ambiguous action, a changed build id/hash, or a stale map fails the build.

`verify-authenticated-mutation-startup.ts` safe-reads only those fixed candidate paths,
recomputes every binding, and exits with a stable code before `next start`. The fixed
release entrypoint invokes it without caller paths or bypass flags. Missing, stale,
unsupported, or malformed inventory/build output therefore also fails startup.

- [ ] **Step 4: Close anonymous protocol exceptions without changing their owners**

The only `anonymous-protocol` categories are the closed NextAuth operation table:
start/callback protected by exact state plus PKCE and Leaf 8 guards, and its separately
classified session/signout/CSRF/providers/error operations with their exact existing
read or mutation contract; invitation attempt creation/exchange/acceptance
protected by canonical same-origin, bounded body, attempt cookie/hash, and durable
guards; and the query-free CSP report protected by edge header stripping, bounded
stream, and durable network/fingerprint limits. Every other mutation requires a
current session. Closed signup does not create another exception.

- [ ] **Step 5: Enforce only the central pre-dispatch request policy**

Task 2A replaces the installed empty
`deploy/caddy/conf.d/munjib-authenticated-mutations.caddy`, regenerates the exact
root-bundle manifest, and proves the include still precedes generic proxying. It matches
every mutation method
and every request carrying `Next-Action`. It requires the exact protected canonical
origin and `Sec-Fetch-Site: same-origin` for `same-origin` entries, rejects malformed/
conflicting framing and oversized declared length, and applies a streaming request-body
maximum so a request without `Content-Length`, chunked transfer, or HTTP/2 body cannot
overflow into Web. Registered OAuth-state/PKCE, invitation-attempt, and CSP-
report provenances receive only their exact central exception; they do not inherit a
new auth bypass. Caddy emits stable private/no-store failures and logs no URI, action
id, query, header, cookie, body, or native error.

`lib/http/authenticated-mutation-gate.ts` and version-1
`lib/security/downstream/leaf12-edge-middleware.ts` repeat canonical Origin/fetch-
metadata/content-type admission for source route-pattern/operation tuples and every
request carrying the bounded `Next-Action` header before dispatch. The Node-runtime
seam reads only the fixed generated candidate map and rejects an unknown action id at
request time; startup validation separately proves that opaque id map is complete and
current. Root `middleware.ts` remains Leaf 7-owned and byte-identical.
`next.config.mjs` supplies one
global Server Action body ceiling at least as
strict as the largest inventory entry; the prior owner retains each smaller per-field/
parser limit. The central gate never parses business input, resolves a session or
resource, writes a journal event, or wraps/imports/re-exports a handler. The real owner
continues the declared order after admission. NextAuth, history, invitation, attachment,
AI, workspace, document, and all other discovered mutation modules remain byte-for-byte
identical to the pre-Leaf-12 snapshot.

- [ ] **Step 6: Run GREEN completeness/runtime tests and commit only central files**

Run:

```bash
pnpm exec vitest run tests/security/authenticated-mutation-inventory.test.ts tests/security/authenticated-mutation-build-map.test.ts tests/security/authenticated-mutation-runtime.test.ts tests/github-actions/ci-cd.test.ts --reporter=dot
pnpm run build
pnpm exec tsx scripts/security/verify-authenticated-mutation-startup.ts
```

Expected: PASS. Static tests prove exact regeneration, candidate action-id completeness,
startup binding, central pre-dispatch rejection, and an unchanged hash for every prior-
owner mutation file. Runtime tests invoke every inventory entry and prove its original
implementation supplies the declared body/auth/resource/journal controls after the
central gate. No entry can satisfy coverage with a policy label alone.

Add a public-safe mutation-inventory paragraph to `wiki/CI CD And Monitoring
Workflow.md` plus an evidence-only `wiki/log.md` entry, then stage only:

```bash
git add security/authenticated-mutations.v1.json lib/http/authenticated-mutation-gate.ts scripts/security/build-authenticated-mutation-inventory.ts scripts/security/compile-authenticated-mutation-runtime.ts scripts/security/verify-authenticated-mutation-startup.ts deploy/caddy/conf.d/munjib-authenticated-mutations.caddy deploy/edge/attested-root-bundle/manifest.json lib/security/downstream/leaf12-edge-middleware.ts next.config.mjs package.json scripts/docker/release-entrypoint.sh tests/security/authenticated-mutation-runtime-adapters.ts tests/security/authenticated-mutation-inventory.test.ts tests/security/authenticated-mutation-build-map.test.ts tests/security/authenticated-mutation-runtime.test.ts tests/security/edge-log-redaction.test.ts .github/workflows/ci-cd.yml tests/github-actions/ci-cd.test.ts 'wiki/CI CD And Monitoring Workflow.md' wiki/log.md
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
if git diff --cached --name-only | rg -q '^(app/.*/(route|actions)\.tsx?|lib/.*/(route|actions)\.tsx?)$'; then echo 'prior mutation module staged' >&2; exit 1; fi
if git diff --cached --name-only | rg -q '^middleware\.ts$'; then echo 'Leaf 7 middleware staged' >&2; exit 1; fi
git diff --cached --check
git commit -m "security: add central authenticated mutation gate"
```

Expected: the commit contains only Leaf 12 central inventory/gate/build/CI/wiki files;
no discovered prior route or Server Action module is staged.

### Task 3: Build the Exact Nonce Policy and Verified Deployment Mode

**Files:**
- Create: `lib/security/csp.ts`
- Create: `lib/security/csp-connect-catalog.ts`
- Create in Child A, extend only in Child B: `lib/security/csp-activation.ts`
- Modify in Child A, then Child B: `lib/security/downstream/leaf12-edge-middleware.ts`
- Verify byte-identical: `middleware.ts`
- Create: `tests/security/csp.test.ts`
- Create: `tests/security/leaf12-edge-middleware.test.ts`
- Modify: `scripts/docker/release-entrypoint.sh`
- Modify: `docker-compose.yml`, `.env.example`, `.env.docker.example`

**Interfaces:**
- Child A consumes baked `edge-minimal-csp-nonce@1`, verified required floor, and the exact validated Sentry ingest origin. Child B extends the same resolver for baked `@2`, exact running digest, and target-specific v2 activation.
- Produces: version-1 seam behavior that preserves invitation enforcement while using report-only elsewhere, followed only in Child B by version-2 global enforcement. A caller environment cannot select or lower mode.

- [ ] **Step 1: Write RED policy, catalog, reserved-seam, and mode tests**

Child A tests nonce strictness, v1 report-only on non-invitation requests, exact
preservation of Leaf 7's already enforced invitation nonce/policy, rejection of every
caller-selected mode, the exact ninth-tuple `0 -> 1` transition, and byte-identical root
middleware. They reject any v2 activation/carry-forward/shadow source in the Child A
tree. Child B adds identical report/enforce policy-byte tests, v2 enforcement,
missing/wrong target activation failure, the `1 -> 2` seam transition, and continued
invitation-policy preservation. For connect sources test no DSN -> only `'self'`; exact matching configured
Sentry origin -> one extra origin; and reject wildcard, HTTP, alternate port,
credentials/path/query/fragment in the origin value, arbitrary host, DSN-origin
mismatch, duplicate, or extra provider origin.

- [ ] **Step 2: Implement the exact connect catalog and policy**

`resolveCspConnectSources({publicSentryDsn,configuredOrigin})` returns exactly
`["'self'"]` or `["'self'", configuredOrigin]`. When configured, parse the public DSN,
require HTTPS/default 443, require configuredOrigin to equal its `.origin`, and require
hostname `^o[0-9]+\\.ingest(?:\\.[a-z0-9-]+)?\\.sentry\\.io$`. The catalog is sorted,
deduplicated, immutable, and contains no wildcard. `buildNonceContentSecurityPolicy`
joins only that catalog for `connect-src` and retains strict script/style nonce,
`strict-dynamic`, self/data/blob image policy, frame/object/base/form restrictions,
upgrade-insecure-requests, and the fixed report endpoint.

- [ ] **Step 3: Derive mode only from verified release state**

Child A `lib/security/csp-activation.ts` exposes a v1-only resolver: an exact baked
`edge-minimal-csp-nonce@1` resolves to `report-only` for non-invitation requests and has
no activation parser, v2 branch, carry-forward type, shadow type, or verifier import.
Child B extends that same protected file so exact `@2` resolves to `enforce` only after
target digest/source/floor/policy/Caddy/critical-artifact hashes and signature verify.
The release entrypoint verifies the applicable floor/running digest before Web starts.
Missing, lower, stale, or wrong evidence exits. No caller or internal mode environment
value exists.

- [ ] **Step 4: Activate only the reserved nonce seam**

Root middleware already creates the request shell and invitation nonce and invokes the
reserved seam. Version 1 calls only the v1 resolver and validated connect catalog. For
an invitation request it reuses Leaf 7's nonce and returns the existing enforced policy
and header exactly; it must never replace, remove, or downgrade it to report-only. For
every other matched path it creates/propagates a cryptographic nonce for RSC and emits
the global policy only as `Content-Security-Policy-Report-Only`. Version 2 exists only
in Child B and emits that same global policy as an additional enforced CSP; invitation
requests retain Leaf 7's enforced policy, reuse its nonce, and receive both policies as
an intersection. Neither version reads a mode environment variable or caller origin
list. The extension test rejects any diff or owner claim for root `middleware.ts`.

- [ ] **Step 5: Verify and commit the v1-capable policy**

```bash
pnpm exec vitest run tests/security/csp.test.ts tests/docker/compose.test.ts --reporter=dot
pnpm exec tsc --noEmit --pretty false
pnpm run build
```

Expected: strict exact catalog, invitation enforced-policy preservation, v1 report-only
mode, ninth-tuple seam activation, and byte-identical root middleware pass; a wildcard
Sentry origin, operator mode, or any Child A v2 wiring fails. Commit
`lib/security/csp.ts`, `lib/security/csp-connect-catalog.ts`, the v1-only
`lib/security/csp-activation.ts`, the version-1 downstream seam, entrypoint, tests,
Compose/env removal, and public-safe wiki delta. Child B later extends only the
activation resolver and seam after Task 5 evidence exists.

### Task 4: Automate Header and External-Port Verification

**Files:**
- Create: `lib/security/edge-probe.ts`
- Create: `scripts/security/verify-edge-contract.ts`
- Create: `tests/security/edge-probe.test.ts`
- Create: `deploy/edge-probe/Dockerfile`
- Create: `deploy/edge-probe/manifest.json`
- Create: `tests/security/edge-probe-artifact.test.ts`
- Modify: `.github/workflows/ci-cd.yml`
- Modify: `tests/github-actions/ci-cd.test.ts`

**Interfaces:**
- Consumes: CLI arguments `--url "$MUNJIB_PUBLIC_URL"`, `--host "$MUNJIB_PUBLIC_HOST"`, and a fixed read-only verified deployment record supplied by the Issue 13 workflow. The expected CSP mode is derived from capability v1/v2 plus activation, never a repository variable or CLI override.
- Produces: strict URL/host validation; deterministic A+AAAA resolution with private-address rejection; TLS/SNI plus path/header probes through each resolved address on 443; and explicit-address TCP rejection checks for 3000/55432/11434. The CLI exits non-zero if any answer is skipped, re-resolved, private, lacks valid TLS, lacks headers, or accepts a private-service connection.

- [ ] **Step 1: Write failing probe unit tests and workflow assertions**

Create `tests/security/edge-probe.test.ts` with:

```ts
import { describe, expect, test, vi } from "vitest";
import { assertEdgeHeaders, assertStrictEdgeTarget, verifyEveryEdgeAddress } from "@/lib/security/edge-probe";

const secureHeaders = () =>
  new Headers({
    "strict-transport-security": "max-age=31536000; includeSubDomains",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "permissions-policy": "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
    "content-security-policy": "frame-ancestors 'none'; object-src 'none'; base-uri 'none'; img-src 'self' data: blob:",
    "content-security-policy-report-only": "default-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; img-src 'self' data: blob:; script-src 'self' 'nonce-fixed-nonce-value-123456' 'strict-dynamic'",
  });

function testProbe(addresses: string[], open?: { openAddress: string; openPort: number }) {
  return {
    url: "https://app.invalid/", host: "app.invalid", mode: "report-only" as const,
    resolve: async () => addresses.map((address) => ({
      address, family: address.includes(":") ? 6 as const : 4 as const,
    })),
    probeHttps: async () => secureHeaders(),
    probeTcp: async ({ address, port }: { address: string; port: number }) =>
      address === open?.openAddress && port === open.openPort,
  };
}

describe("edge probe", () => {
  test("accepts the baseline report-only header contract", () => {
    expect(() => assertEdgeHeaders(secureHeaders(), "report-only")).not.toThrow();
  });

  test("requires a matching HTTPS host on port 443 with no URL extras", () => {
    expect(assertStrictEdgeTarget("https://app.invalid/", "app.invalid").hostname).toBe("app.invalid");
    for (const value of [
      "http://app.invalid/", "https://user@app.invalid/", "https://app.invalid:444/",
      "https://app.invalid/path", "https://app.invalid/?x=1", "https://other.invalid/",
    ]) expect(() => assertStrictEdgeTarget(value, "app.invalid")).toThrow("EDGE_TARGET_INVALID");
  });

  test("requires an enforced header in enforce mode", () => {
    expect(() => assertEdgeHeaders(secureHeaders(), "enforce")).toThrow(
      "EDGE_CSP_ENFORCEMENT_MISSING",
    );
  });

  test("probes 443 and every closed port on every public A and AAAA answer", async () => {
    const calls: string[] = [];
    await verifyEveryEdgeAddress({
      url: "https://app.invalid/", host: "app.invalid", mode: "report-only",
      resolve: async () => [
        { address: "93.184.216.34", family: 4 as const },
        { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 as const },
      ],
      probeHttps: async ({ address, path }) => { calls.push(`https:${address}:${path}`); return secureHeaders(); },
      probeTcp: async ({ address, port }) => { calls.push(`tcp:${address}:${port}`); return false; },
    });
    for (const address of ["93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946"]) {
      for (const path of ["/", "/login", "/api/auth/providers"]) expect(calls).toContain(`https:${address}:${path}`);
      for (const port of [3000, 55432, 11434]) expect(calls).toContain(`tcp:${address}:${port}`);
    }
  });

  test("rejects private answers and one open address without skipping siblings", async () => {
    await expect(verifyEveryEdgeAddress(testProbe(["10.0.0.8"]))).rejects.toThrow("EDGE_DNS_NON_PUBLIC");
    await expect(verifyEveryEdgeAddress(testProbe(["93.184.216.34", "93.184.216.35"], {
      openAddress: "93.184.216.35", openPort: 55432,
    }))).rejects.toThrow("EDGE_PORT_OPEN:93.184.216.35:55432");
  });
});
```

Add workflow assertions to `tests/github-actions/ci-cd.test.ts`:

```ts
  test("verifies headers and private ports after public health", () => {
    const deploy = workflow.jobs.deploy;
    const runCommands = deploy.steps
      .map((step: { run?: string }) => step.run)
      .filter(Boolean)
      .join("\n");

    expect(runCommands).toContain("$EDGE_PROBE_IMAGE_DIGEST");
    expect(runCommands).toContain("--url \"$MUNJIB_PUBLIC_URL\"");
    expect(runCommands).toContain("--host \"$MUNJIB_PUBLIC_HOST\"");
    expect(runCommands).toContain("--deployment-record \"$MUNJIB_DEPLOYMENT_RECORD\"");
    expect(runCommands).not.toMatch(/CSP.*MODE|MODE.*CSP/);
    expect(JSON.stringify(deploy.steps)).not.toContain("actions/checkout");
  });
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
pnpm exec vitest run tests/security/edge-probe.test.ts tests/security/edge-probe-artifact.test.ts tests/github-actions/ci-cd.test.ts --reporter=dot
```

Expected: FAIL because the probe module/CLI and workflow step do not exist.

- [ ] **Step 3: Implement the reusable probe**

Create `lib/security/edge-probe.ts` with:

```ts
import dns from "node:dns/promises";
import https from "node:https";
import net from "node:net";

export type CspProbeMode = "report-only" | "enforce";
export type ResolvedEdgeAddress = { address: string; family: 4 | 6 };

function requireHeader(headers: Headers, name: string, expected: string) {
  const value = headers.get(name) ?? "";
  if (!value.includes(expected)) throw new Error(`EDGE_HEADER_INVALID:${name}`);
}

export function assertEdgeHeaders(headers: Headers, mode: CspProbeMode) {
  requireHeader(headers, "strict-transport-security", "max-age=31536000");
  requireHeader(headers, "x-content-type-options", "nosniff");
  requireHeader(headers, "referrer-policy", "no-referrer");
  requireHeader(headers, "permissions-policy", "camera=()");
  const minimal = headers.get("content-security-policy") ?? "";
  for (const required of [
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "img-src 'self' data: blob:",
  ]) {
    if (!minimal.includes(required)) throw new Error("EDGE_MINIMAL_CSP_INVALID");
  }
  if (/img-src[^;]*https?:/.test(minimal)) throw new Error("EDGE_CSP_EXTERNAL_IMAGE_ALLOWED");
  const noncePolicy = headers.get(
    mode === "enforce" ? "content-security-policy" : "content-security-policy-report-only",
  ) ?? "";
  if (!/script-src[^;]*'nonce-[A-Za-z0-9+/_=-]{16,256}'/.test(noncePolicy)) {
    throw new Error("EDGE_CSP_ENFORCEMENT_MISSING");
  }
  if (headers.has("x-powered-by") || headers.has("server")) {
    throw new Error("EDGE_FRAMEWORK_BRANDING_PRESENT");
  }
}

export function assertStrictEdgeTarget(value: string, expectedHost: string): URL {
  const url = new URL(value);
  const host = expectedHost.trim().toLowerCase();
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host) ||
      url.protocol !== "https:" || url.hostname !== host || url.port !== "" ||
      url.username !== "" || url.password !== "" || url.pathname !== "/" ||
      url.search !== "" || url.hash !== "") throw new Error("EDGE_TARGET_INVALID");
  return url;
}

const blocked = new net.BlockList();
for (const [address, prefix] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10],
  ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24],
  ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4]] as const) {
  blocked.addSubnet(address, prefix, "ipv4");
}
for (const [address, prefix] of [["::", 128], ["::1", 128], ["::ffff:0:0", 96],
  ["100::", 64], ["2001:db8::", 32], ["fc00::", 7], ["fe80::", 10],
  ["ff00::", 8]] as const) blocked.addSubnet(address, prefix, "ipv6");

export function assertPublicAddress(entry: ResolvedEdgeAddress) {
  const family = entry.family === 4 ? "ipv4" : "ipv6";
  if (net.isIP(entry.address) !== entry.family || blocked.check(entry.address, family)) {
    throw new Error(`EDGE_DNS_NON_PUBLIC:${entry.address}`);
  }
}

export async function resolveEveryAddress(host: string): Promise<ResolvedEdgeAddress[]> {
  const optional = async (family: 4 | 6) => {
    try {
      const values = family === 4 ? await dns.resolve4(host) : await dns.resolve6(host);
      return values.map((address) => ({ address, family }));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENODATA" || code === "ENOTFOUND") return [];
      throw new Error("EDGE_DNS_RESOLUTION_FAILED");
    }
  };
  const entries = [...await optional(4), ...await optional(6)]
    .filter((entry, index, all) => all.findIndex((other) => other.address === entry.address) === index)
    .sort((a, b) => a.family - b.family || a.address.localeCompare(b.address));
  if (entries.length === 0) throw new Error("EDGE_DNS_EMPTY");
  entries.forEach(assertPublicAddress);
  return entries;
}

export function probeTcpAddress(input: { address: string; family: 4 | 6; port: number; timeoutMs?: number }): Promise<boolean> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (open: boolean) => {
      if (settled) return;
      settled = true;
      resolve(open);
    };
    const socket = net.createConnection({ host: input.address, family: input.family, port: input.port });
    socket.setTimeout(input.timeoutMs ?? 3_000);
    socket.once("connect", () => {
      socket.destroy();
      finish(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      finish(false);
    });
    socket.once("error", () => finish(false));
  });
}

export function probeHttpsAddress(input: { address: string; family: 4 | 6; host: string; path: string }): Promise<Headers> {
  return new Promise((resolve, reject) => {
    const request = https.request({ host: input.address, family: input.family, port: 443,
      servername: input.host, method: "GET", path: input.path, headers: { host: input.host },
      timeout: 10_000, rejectUnauthorized: true }, (response) => {
      response.resume();
      if ((response.statusCode ?? 500) >= 500) return reject(new Error("EDGE_HTTPS_STATUS"));
      const headers = new Headers();
      for (const [name, value] of Object.entries(response.headers)) {
        if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
      }
      resolve(headers);
    });
    request.once("timeout", () => request.destroy(new Error("EDGE_HTTPS_TIMEOUT")));
    request.once("error", () => reject(new Error("EDGE_HTTPS_FAILED")));
    request.end();
  });
}

export async function verifyEveryEdgeAddress(input: {
  url: string; host: string; mode: CspProbeMode;
  resolve?: (host: string) => Promise<ResolvedEdgeAddress[]>;
  probeHttps?: typeof probeHttpsAddress; probeTcp?: typeof probeTcpAddress;
}) {
  assertStrictEdgeTarget(input.url, input.host);
  const addresses = await (input.resolve ?? resolveEveryAddress)(input.host);
  addresses.forEach(assertPublicAddress);
  for (const entry of addresses) {
    for (const path of ["/", "/login", "/api/auth/providers"]) {
      assertEdgeHeaders(await (input.probeHttps ?? probeHttpsAddress)({ ...entry, host: input.host, path }), input.mode);
    }
    for (const port of [3000, 55432, 11434]) {
      if (await (input.probeTcp ?? probeTcpAddress)({ ...entry, port })) {
        throw new Error(`EDGE_PORT_OPEN:${entry.address}:${port}`);
      }
    }
  }
}
```

- [ ] **Step 4: Implement the post-deploy CLI**

Create `scripts/security/verify-edge-contract.ts` with:

```ts
import { verifyEveryEdgeAddress, type CspProbeMode } from "@/lib/security/edge-probe";
import { verifyCurrentEdgeDeployment } from "@/lib/security/csp-activation";

function argument(name: string) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1]?.trim() : undefined;
  if (!value) throw new Error(`EDGE_ARGUMENT_REQUIRED:${name}`);
  return value;
}

async function main() {
  const url = argument("--url");
  const host = argument("--host");
  const deploymentRecord = argument("--deployment-record");
  if (deploymentRecord !== "/run/munjib-security/current-deployment.json") {
    throw new Error("EDGE_DEPLOYMENT_RECORD_PATH_INVALID");
  }
  const cspMode = (await verifyCurrentEdgeDeployment(deploymentRecord)).mode as CspProbeMode;
  await verifyEveryEdgeAddress({ url, host, mode: cspMode });
  process.stdout.write("edge contract OK\n");
}

main().catch((error) => {
  const code = error instanceof Error ? error.message.split(":", 1)[0] : "EDGE_PROBE_FAILED";
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
});
```

- [ ] **Step 5: Add the immutable-workflow post-deploy step**

The deploy job has no checkout and executes no repository script. Build/test publishes
a separately attested fixed-entrypoint `edge-probe-v1` OCI tool artifact and the signed
release manifest binds its digest to the app/source/floor. After public health, the
no-checkout deploy job verifies/pulls that exact digest and runs only its fixed probe
entrypoint against the signed public-safe deployment record:

```yaml
      - name: Verify edge headers and private ports
        env:
          MUNJIB_PUBLIC_URL: ${{ vars.MUNJIB_PUBLIC_URL }}
          MUNJIB_PUBLIC_HOST: ${{ vars.MUNJIB_PUBLIC_HOST }}
          MUNJIB_DEPLOYMENT_RECORD: /run/munjib-security/current-deployment.json
          EDGE_PROBE_IMAGE_DIGEST: ${{ needs.attest.outputs.edge_probe_digest }}
        run: >-
          docker run --rm --read-only --cap-drop=ALL
          -v "$MUNJIB_DEPLOYMENT_RECORD:/run/munjib-security/current-deployment.json:ro"
          "$EDGE_PROBE_IMAGE_DIGEST"
          --url "$MUNJIB_PUBLIC_URL"
          --host "$MUNJIB_PUBLIC_HOST"
          --deployment-record /run/munjib-security/current-deployment.json
```

- [ ] **Step 6: Run tests and verify GREEN**

Run:

```bash
pnpm exec vitest run tests/security/edge-probe.test.ts tests/security/edge-probe-artifact.test.ts tests/github-actions/ci-cd.test.ts --reporter=dot
pnpm exec tsc --noEmit --pretty false
```

Expected: both commands exit 0; the test proves open TCP connections fail the probe.

- [ ] **Step 7: Commit the automated probe**

```bash
git add lib/security/edge-probe.ts scripts/security/verify-edge-contract.ts deploy/edge-probe tests/security/edge-probe.test.ts tests/security/edge-probe-artifact.test.ts .github/workflows/ci-cd.yml tests/github-actions/ci-cd.test.ts
git commit -m "ci: verify edge headers and private ports"
```

Expected: one green automation commit.

### Task 5: Publish v1 Observation and Candidate-Bound v2 Enforcement

**Files:**
- Create in Child A: `lib/security/csp-observation.ts`
- Create in Child A: `scripts/security/record-csp-observation.ts`
- Create in Child A: `scripts/security/verify-csp-observation.ts`
- Create in Child A: `tests/security/csp-observation.test.ts`
- Create in Child A, modify in Child B: `deploy/security/capabilities/edge-minimal-csp-nonce.json`
- Modify independently in each child: `deploy/security/protected-artifact-owners.json`
- Create in Child A, extend in Child B: `tests/security/edge-protected-artifact-owners.test.ts`
- Create only in Child B: `scripts/security/create-csp-carry-forward.ts`
- Create only in Child B: `scripts/security/verify-csp-activation.ts`
- Create only in Child B: `tests/security/csp-carry-forward.test.ts`
- Create only in Child B: `tests/security/csp-shadow-observation.test.ts`
- Modify only in Child B: `lib/security/csp-activation.ts`
- Modify only in Child B: `lib/security/downstream/leaf12-edge-middleware.ts`

**Interfaces:**
- Child A consumes root-owned aggregate records, exact app/source/floor/policy/Caddy-generation/connect-catalog/critical-artifact hashes, required browser/limiter/consent/log-redaction probes, and protected approval. Child B additionally consumes exact candidate attestation and either valid carry-forward or isolated-shadow evidence.
- Child A produces only v1 observation/capability and version-1 seam behavior. Child B alone produces a KMS-signed target-specific v2 activation, version-2 seam behavior, and capability v2. No raw report, URL, host, IP, identity, query, header, cookie, content, or raw count leaves restricted storage.

- [ ] **Step 1: Write child-separated RED tests**

Child A rejects missing/duplicate/nonconsecutive days, changed hashes within a run,
first-party violations, limiter/auth/RSC/Sentry/zero-egress/provider-consent/log-
redaction failure, forbidden raw keys, wrong approval, enforcement on non-invitation
paths, any downgrade of Leaf 7 invitation enforcement, and every v2/carry-forward/shadow
source or test. Child B adds target-activation tests. Carry-forward rejects any critical
byte/hash change or candidate attestation mismatch. Shadow rejects public routing,
production cookies/data/identity, real traffic mirroring, or fewer than seven clean
synthetic UTC days. Floor tests reject version decrease or a second capability id. The
owner-map test enforces the fixed ninth reservation transition, rejects a missing/
duplicate/non-`ACTIVE` Leaf 12 seam tuple, any Leaf 12 claim on root middleware, a prior
route/action or Leaf 8 bridge/drop-in/package, and any claim on shared floor/owner maps,
package/build/env/Compose/CI/wiki files.

- [ ] **Step 2: Publish Child Release A at v1 and observe**

```json
{"format":"munjib-security-capability-v1","id":"edge-minimal-csp-nonce","version":1,"leaf":12,"requires":["secure-next-runtime@1","zero-ambient-media-egress@1","invite-signup-gate@1","issue-08-auth-abuse@1","ai-history-reauthorization@1","issue-10-ai-provider-policy@1","attachment-integrity-lifecycle@2","immutable-private-runtime@1"],"evidenceTests":["tests/security/edge-static-contract.test.ts","tests/security/caddy-validator-validation.test.ts","tests/security/edge-bootstrap.test.ts","tests/security/edge-generation.test.ts","tests/security/edge-log-redaction.test.ts","tests/security/authenticated-mutation-inventory.test.ts","tests/security/authenticated-mutation-build-map.test.ts","tests/security/authenticated-mutation-runtime.test.ts","tests/security/leaf12-edge-middleware.test.ts","tests/security/edge-protected-artifact-owners.test.ts","tests/security/csp-report.test.ts","tests/security/csp.test.ts","tests/security/edge-probe.test.ts","tests/security/edge-probe-artifact.test.ts","tests/security/csp-observation.test.ts"]}
```

Deploy and promote Child A v1 with Caddy generation active, the Leaf 7 invitation nonce
policy still enforced, and the global nonce policy report-only on other paths.
The Leaf 12 capability/protected-owner record claims only its inventory, central
Caddy/reserved-seam gate, candidate build-map compiler/startup verifier, CSP/report/
redaction/edge-generation/probe sources, and tests. It records every prior mutation
module only as an immutable prerequisite hash owned by its earlier capability; it never
claims, stages, or republishes one. Capability compilation rejects any changed prior-
owner route/action hash, including the named NextAuth, history, and invitation
sentinels, or any inventory entry without executable body/auth/resource/journal
evidence from its real owner.

The exact Leaf 12 `ACTIVE` protected-path set is:

```text
deploy/caddy/Caddyfile.production
deploy/caddy/conf.d/munjib-containment.caddy
deploy/caddy/conf.d/munjib-log-redaction.caddy
deploy/caddy/conf.d/munjib-csp-report.caddy
deploy/caddy/conf.d/munjib-authenticated-mutations.caddy
deploy/caddy/Dockerfile.validation
deploy/systemd/caddy.service.d/30-munjib-edge-validation.conf
cmd/munjib-caddy-validate/main.go
deploy/edge/attested-root-bundle/manifest.json
deploy/edge/attested-root-bundle/dispatcher-operation.json
deploy/edge/attested-root-bundle/munjib-edge-generation
deploy/edge/attested-root-bundle/munjib-edge-evidence
deploy/edge-probe/Dockerfile
deploy/edge-probe/manifest.json
security/authenticated-mutations.v1.json
lib/http/authenticated-mutation-gate.ts
scripts/security/build-authenticated-mutation-inventory.ts
scripts/security/compile-authenticated-mutation-runtime.ts
scripts/security/verify-authenticated-mutation-startup.ts
scripts/security/build-edge-root-bundle-manifest.ts
scripts/security/run-caddy-validator-validation.sh
lib/security/log-redaction.ts
lib/security/read-bounded-request-body.ts
lib/security/csp-report.ts
lib/security/csp-report-guard.ts
app/api/security/csp-report/route.ts
lib/security/csp.ts
lib/security/csp-connect-catalog.ts
lib/security/csp-activation.ts
lib/security/edge-probe.ts
scripts/security/verify-edge-contract.ts
lib/security/csp-observation.ts
scripts/security/record-csp-observation.ts
scripts/security/verify-csp-observation.ts
deploy/security/capabilities/edge-minimal-csp-nonce.json
lib/security/downstream/leaf12-edge-middleware.ts
```

Create one canonical protected-owner entry per exact path with owner
`edge-minimal-csp-nonce`, leaf `12`, state `ACTIVE`, the correct capability version and
source hash, and the owner-map evidence test. Child B updates only the version/hash for
paths whose exact bytes change. The set deliberately excludes
`deploy/caddy/conf.d/munjib-maintenance.caddy` (the separately reserved recovery seam),
`deploy/security/protected-artifact-owners.json`, `deploy/security/security-floor.json`,
Leaf 8's drop-in/bridge/shared credential package, every earlier route/action, and all
shared package/config/env/Compose/release-entrypoint/Sentry/CI/wiki aggregates.
Root `middleware.ts` is also excluded: Leaf 12 activates only the program's fixed ninth
tuple for `lib/security/downstream/leaf12-edge-middleware.ts`. Child A's owner set and
image contain no carry-forward, v2 activation, or shadow artifacts; Child B adds those
paths only when it performs `1 -> 2`.

The fixed root evidence helper writes exact-key 0600 daily records containing date,
app/source/floor, policy, Caddy generation, exact connect-catalog and critical-set
hashes plus only passed/zero classifications. It accepts fixed inbox/output paths and
no caller paths. Seven-day verification safe-reads regular files, validates protected
approval, and signs the latest consecutive clean window.

- [ ] **Step 3: Hash the exact CSP-critical artifact set**

Hash canonical bytes for `lib/security/csp.ts`, connect catalog, activation resolver,
the reserved downstream seam, Leaf 7 root-middleware immutable prerequisite hash,
`next.config.mjs`, complete attested Caddy payload/manifest, CSP report
reader/parser/guard/route, observation/activation scripts, nonce/redaction tests, and
the exact relevant package/lock importer nodes. Exclude only the v1-to-v2 fragment
version byte. Any other changed byte blocks carry-forward.

- [ ] **Step 4: Create a target-specific v2 activation**

```ts
export type CspActivationV2 = {
  format: "munjib-csp-activation-v2";
  targetDigest: `sha256:${string}`;
  sourceSha: string;
  floorSha256: string;
  policySha256: string;
  caddyGenerationSha256: string;
  connectCatalogSha256: string;
  criticalArtifactSetSha256: string;
  basis:
    | { kind: "carry-forward"; priorObservationSha256: string; candidateAttestationSha256: string }
    | { kind: "shadow-observation"; observationSha256: string };
  issuedAt: string;
  nonce: string;
  signerKeyId: string;
  signature: string;
};
```

Initial v2 may carry the v1 observation forward only when policy/Caddy/connect/
critical-set hashes are byte-identical and the new candidate digest/source/floor/
attestation verify. Otherwise keep current production enforced (or v1 report-only for
the initial transition) and run the candidate seven consecutive UTC days in a
no-public-route, no-production-cookie/data/identity, no-real-traffic-mirroring shadow
with synthetic authenticated login/RSC/editor/attachment/AI-consent/Sentry/limiter/
zero-egress/log-redaction probes. Protected approval signs only that exact candidate.

- [ ] **Step 5: Publish Child Release B at v2 and make the floor one-way**

```json
{"format":"munjib-security-capability-v1","id":"edge-minimal-csp-nonce","version":2,"leaf":12,"requires":["secure-next-runtime@1","zero-ambient-media-egress@1","invite-signup-gate@1","issue-08-auth-abuse@1","ai-history-reauthorization@1","issue-10-ai-provider-policy@1","attachment-integrity-lifecycle@2","immutable-private-runtime@1"],"evidenceTests":["tests/security/edge-static-contract.test.ts","tests/security/caddy-validator-validation.test.ts","tests/security/edge-bootstrap.test.ts","tests/security/edge-generation.test.ts","tests/security/edge-log-redaction.test.ts","tests/security/authenticated-mutation-inventory.test.ts","tests/security/authenticated-mutation-build-map.test.ts","tests/security/authenticated-mutation-runtime.test.ts","tests/security/leaf12-edge-middleware.test.ts","tests/security/edge-protected-artifact-owners.test.ts","tests/security/csp-report.test.ts","tests/security/csp.test.ts","tests/security/edge-probe.test.ts","tests/security/edge-probe-artifact.test.ts","tests/security/csp-observation.test.ts","tests/security/csp-carry-forward.test.ts","tests/security/csp-shadow-observation.test.ts"]}
```

The v2 entrypoint requires its exact activation before Web starts. A v1 observation or
another digest's activation is insufficient. Promote v2 only after enforced browser/
Sentry/redaction/external-port oracles pass. Thereafter report-only and v1 rollback are
ineligible; use another eligible activated v2 generation or fail-closed fix-forward.

- [ ] **Step 6: Verify and commit each child independently**

Run floor build, observation/carry-forward/shadow/CSP/edge-generation/log/mutation
tests, the exact protected-owner test, typecheck, build, wiki gates, and review
independently for Child A and Child B. Stage the capability and
`deploy/security/protected-artifact-owners.json` together; reject any extra Leaf 12
owner tuple or omitted exact `ACTIVE` path.
The v2 branch is cut only after v1 observation evidence exists and never co-publishes
both fragment versions.

### Task 6: Document, Exercise, and Roll Out the Edge Contract

**Files:**
- Create: `docs/runbooks/production-edge.md`
- Modify: `wiki/CI CD And Monitoring Workflow.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`
- Test: all files from Tasks 1-4.

**Interfaces:**
- Consumes: the versioned Caddy template, Compose bindings, CSP report endpoint, nonce gate, and post-deploy probe.
- Produces: an operator sequence with report-only observation, nonce-enforcement approval, listener checks, browser/Sentry validation, and security-boundary-preserving rollback.

- [ ] **Step 1: Create the secret-free production runbook**

Create `docs/runbooks/production-edge.md` with these exact sections and commands:

````markdown
# Production Edge Runbook

## Protected deployment contract

`MUNJIB_PUBLIC_HOST`, `MUNJIB_PUBLIC_URL`, exact Sentry connect origin, current app
digest, and signed deployment/host-bundle records are protected non-secret inputs.
Secrets remain root credentials and are never printed. Operators never copy or execute
checkout files as root.

## Activate the attested v1 edge generation

The protected Leaf 13A delivery job signs and submits bounded `edge-generation`
envelopes with actions `activate` then `verify` to the forced SSH dispatcher. Each
binds exact app/bundle/floor/previous-generation identities, monotonic sequence,
expiry, and unique nonce. There is no host shell, sudo, direct installer/helper, or
caller argument command.

Expected: a complete immutable generation validates and switches atomically; Caddy
restarts with admin off, containment/CSP-report/log-redaction imports, minimal CSP, and
the exact listener contract. Failure automatically restores and verifies the previous
attested generation or leaves fail-closed maintenance. No PostgreSQL recreation or
Compose binding change occurs.

## Verify local listeners

Submit a signed `edge-generation:verify` envelope through the Leaf 13A forced
dispatcher. Its internal fixed root unit safe-reads listeners and returns only the
stable result code. Expected: port 3000 is loopback-only, port 55432 has no host
listener, and port 11434 is absent or on the approved private binding, never a wildcard.

From the GitHub-hosted external runner, run:

```bash
pnpm exec tsx scripts/security/verify-edge-contract.ts \
  --url "$MUNJIB_PUBLIC_URL" --host "$MUNJIB_PUBLIC_HOST" \
  --deployment-record /run/munjib-security/current-deployment.json
```

Expected: valid TLS and required headers through every public A/AAAA answer on 443;
every answer rejects 3000, 55432, and 11434.

## Observe Child Release A v1

Keep the verified v1 digest live for at least seven consecutive UTC days. Its baked
capability keeps the invitation nonce policy enforced and makes the added global nonce
policy report-only on other paths; no environment switch exists. Exercise
login, logout, workspace navigation, editor/preview, attachments, Ask AI, Workspace
AI, exact Sentry ingest, log-redaction sentinels, and browser refresh. Review only sanitized
`munjib.csp.violation` directive/classification tags. Do not copy raw browser reports,
URLs, paths, query strings, content, or identities into tickets.

After each day, the protected evidence job submits a signed fixed-input
`edge-evidence:record` envelope to the forced dispatcher. It accepts no caller path.

The seventh-day protected GitHub environment approval is attested. The protected job
submits `edge-evidence:verify` through the same forced dispatcher and fixed root unit.

Expected: `CSP_OBSERVATION_OK`; seven dates are consecutive and bound to the current
digest/source/floor/policy/Caddy/connect/critical hashes, with every required check passed.

## Deploy Child Release B v2 enforcement

Build a new v2 candidate. Create its target-bound activation by carry-forward only when
the critical set is identical, otherwise from the approved isolated shadow. Deploy the
new digest; startup verifies activation and the baked v2 floor before enforcing. Run:

```bash
pnpm exec tsx scripts/security/verify-edge-contract.ts \
  --url "$MUNJIB_PUBLIC_URL" --host "$MUNJIB_PUBLIC_HOST" \
  --deployment-record /run/munjib-security/current-deployment.json
```

Expected: `edge contract OK`; normal browser paths and Sentry remain functional and
external ports 3000, 55432, and 11434 remain closed.

Also require the closed password-signup/Trial/development-provider probes and the Leaf
7 uninvited/unlinked Google probe to remain denied, and the Leaf 10 external-provider
opt-in test to remain explicit.

## Roll back an enforced edge generation

Submit signed `edge-generation:rollback` and then `edge-generation:verify` envelopes
through the Leaf 13A forced dispatcher. No direct root command is authorized.

After v2 floor promotion, rollback may select only a previously attested v2 generation
whose activation and current eligibility still verify. If none exists, remain in
maintenance and fix forward. Never lower the floor, return to report-only, restore
public bindings, or remove containment/baseline/log-redaction policy.
````

- [ ] **Step 2: Run the complete local verification matrix**

Run:

```bash
pnpm exec vitest run tests/security/edge-static-contract.test.ts tests/security/caddy-validator-validation.test.ts tests/security/edge-bootstrap.test.ts tests/security/edge-generation.test.ts tests/security/edge-log-redaction.test.ts tests/security/authenticated-mutation-inventory.test.ts tests/security/authenticated-mutation-build-map.test.ts tests/security/authenticated-mutation-runtime.test.ts tests/security/leaf12-edge-middleware.test.ts tests/security/edge-protected-artifact-owners.test.ts tests/security/csp-report.test.ts tests/security/csp.test.ts tests/security/edge-probe.test.ts tests/security/edge-probe-artifact.test.ts tests/security/csp-observation.test.ts tests/security/csp-carry-forward.test.ts tests/security/csp-shadow-observation.test.ts tests/auth/network-identity.test.ts tests/auth/postgres-rate-limit.test.ts tests/auth/auth-guard-outage.test.ts tests/docker/compose.test.ts tests/github-actions/ci-cd.test.ts --reporter=dot
pnpm exec tsc --noEmit --pretty false
pnpm run build
docker compose -f docker-compose.yml config >/dev/null
docker compose -f docker-compose.yml -f docker-compose.dev.yml config >/dev/null
scripts/security/run-caddy-validator-validation.sh
```

Expected: every command exits 0.

- [ ] **Step 3: Run the browser network oracle before enforcement**

Against Child A, where invitation CSP is enforced and the added global CSP is
report-only on other paths, run:

```bash
PLAYWRIGHT_TEST_BASE_URL="$MUNJIB_PUBLIC_URL" pnpm exec playwright test tests/e2e/security-runtime.spec.ts --reporter=line
```

Expected: auth and RSC smoke pass with no CSP-caused browser failure. Confirm the Issue 4 zero-egress tests also pass and no attacker-domain browser request appears.

- [ ] **Step 4: Add only public-safe wiki knowledge**

Add this exact section to `wiki/CI CD And Monitoring Workflow.md`:

```markdown
## Enforced edge contract

Caddy disables its admin API, preserves closed-signup/retired-provider containment,
removes branding, and always enforces the minimal frame/object/base/image CSP. The
application creates one per-request nonce policy; the same policy bytes run
report-only outside invitations in a v1 child release while the Leaf 7 invitation
policy remains enforced. A separately reviewed v2 candidate enforces globally only
with target-bound carry-forward or isolated-shadow evidence; the v2 floor cannot
downgrade. `connect-src` contains self plus at most one exact validated Sentry ingest
origin and no wildcard. CSP bodies are query/header/cookie constrained, stream-bounded,
and cancelled, and Issue 8 PostgreSQL limits fail closed before privacy-safe telemetry.

Issue 13 owns Web loopback and non-published PostgreSQL bindings; the edge leaf only
verifies and preserves them. After deployment, a GitHub-hosted verifier requires an
exact HTTPS/443 URL-host pair, resolves every public A/AAAA answer, validates TLS/SNI
and headers through each address, and requires each address to reject ports 3000,
55432, and 11434. The complete mutation inventory requires canonical Origin and fetch
metadata. Caddy config arrives only through an attested OCI generation; admin is off
and live sentinel tests prove query/header/cookie redaction across Caddy, systemd, app,
and Sentry. Rollback preserves the current capability version, minimal CSP,
containment, private bindings, logging policy, and baseline headers.
```

Append this exact `wiki/log.md` entry:

```markdown
## 2026-07-12T00:05:00+09:00 - security edge

- Source evidence: `deploy/caddy/`, the Leaf 7-owned `middleware.ts` prerequisite, `lib/security/downstream/leaf12-edge-middleware.ts`, CSP parser/guard/observation modules, dual-stack edge probe, capability fragment, and focused security/browser tests.
- Affected pages: [[CI CD And Monitoring Workflow]], [[log|Wiki Log]].
- Result: the edge now has attested atomic Caddy generations, an always-enforced minimal CSP, monotonic v1/v2 nonce enforcement, exact Sentry connect catalog, complete mutation inventory, bounded report admission, fail-closed log redaction, disabled admin API, preserved auth containment, and all-address listener verification.
- Verification: focused Vitest, mutation regeneration, OCI generation/rollback, live redaction sentinels, production build, Caddy validation, browser zero-egress/auth/RSC checks, v1/carry-forward/shadow evidence, wiki manifest/lint, and staged sync check.
```

Do not include hostnames, IPs, incident evidence, raw CSP reports, or observation
counts.

- [ ] **Step 5: Stage, regenerate, lint, and check disclosure**

```bash
git add deploy/caddy deploy/edge/attested-root-bundle deploy/edge-probe deploy/systemd/caddy.service.d/30-munjib-edge-validation.conf cmd/munjib-caddy-validate/main.go scripts/security/run-caddy-validator-validation.sh deploy/security/capabilities/edge-minimal-csp-nonce.json deploy/security/protected-artifact-owners.json deploy/security/security-floor.json security/authenticated-mutations.v1.json next.config.mjs package.json scripts/docker/release-entrypoint.sh .env.example .env.docker.example lib/security lib/http/authenticated-mutation-gate.ts lib/observability/sentry-scrub-event.ts sentry.server.config.ts sentry.edge.config.ts instrumentation-client.ts app/api/security scripts/security tests/security tests/docker/compose.test.ts .github/workflows/ci-cd.yml tests/github-actions/ci-cd.test.ts docs/runbooks/production-edge.md 'wiki/CI CD And Monitoring Workflow.md' wiki/log.md
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
git add wiki/manifest.json
pnpm wiki:lint
pnpm wiki:sync-check --staged
git diff --cached --name-only
if git diff --cached --name-only | rg -q '^middleware\.ts$'; then echo 'Leaf 7 middleware staged' >&2; exit 1; fi
pnpm exec tsx scripts/security/build-authenticated-mutation-inventory.ts --assert-prior-owner-files-unchanged --staged
if git diff --cached -- . ':!docs/superpowers/' | \
  rg -q '(BEGIN (RSA|OPENSSH|EC) PRIVATE KEY|NEXTAUTH_SECRET=\S+|API_KEY=\S+|raw CSP|https?://[^ ]+\?[^ ]+)'; then
  printf 'staged secret-or-raw-report scan failed\n' >&2
  exit 1
fi
```

Expected: all checks exit 0 and no restricted design/plan is staged.

- [ ] **Step 6: Commit the runbook and public-safe knowledge**

```bash
git commit -m "docs: add production edge rollout runbook"
```

Expected: one green docs/operations commit.

- [ ] **Step 7: Push, review, and inspect CI after the required wait**

```bash
git push -u origin HEAD
gh pr create --fill --draft
gh pr ready
```

Use five bounded 60-second Codex product waits, stopping early only when every check is
terminal; never use shell sleep. Then run:

```bash
gh pr checks
gh pr view --json reviewDecision,reviews,statusCheckRollup
OWNER="$(gh repo view --json owner --jq .owner.login)"
NAME="$(gh repo view --json name --jq .name)"
NUMBER="$(gh pr view --json number --jq .number)"
gh api graphql -f owner="$OWNER" -f name="$NAME" -F number="$NUMBER" -f query='
query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:100){nodes{isResolved comments(first:20){nodes{author{login}body path line}}}}}}}
' --jq '[.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false)]'
```

Expected: required checks pass and the GraphQL result is `[]`. Fix any failure or
actionable unresolved thread on this branch with its own red-green cycle, push, then
repeat bounded polling and the query.

- [ ] **Step 8: Deploy and review the two child releases independently**

Deploy Child A's exact v1 digest, install/activate its bound `edge-caddy-v1` artifact,
promote `edge-minimal-csp-nonce@1`, and verify private bindings, admin-off, containment,
log redaction, exact Sentry catalog, mutation inventory, TLS/headers/closed ports, auth/
RSC/AI consent/zero-egress, and CSP-report controls. Complete the signed seven-day v1
observation without a mode environment variable.

Cut Child B only after that evidence. Build a new v2 digest, produce its exact
carry-forward or shadow activation, deploy with startup preflight, then promote
`edge-minimal-csp-nonce@2`. Repeat every external/browser/Sentry/redaction oracle and
confirm the durable limiter. Review/CI/PR lifecycle is separate for each child.

Expected: minimal CSP, containment, log redaction, baseline headers, exact connect
catalog, and private bindings remain continuous; both verified deployments print
`edge contract OK`; Caddy exposes no admin; after v2 promotion no report-only/v1
rollback is eligible.
