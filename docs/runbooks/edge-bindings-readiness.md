# Edge bindings and continuous probes readiness

Issue #166 is a dependency-gated, public-safe handoff. The machine-readable
contract is `deploy/security/edge-bindings-v1.json`.

## Current state

- `origin/main` serves the web container on `127.0.0.1:3000`; no public edge
  configuration is shipped by the application repository.
- The contract is `PREPARATORY` with `activation: DISABLED`. It is an
  acceptance checklist for the eventual edge owner, not a production command
  or a claim that the headers/probes are active.
- The public probe uses `GET /api/auth/providers`, which is already a bounded,
  unauthenticated Auth.js metadata route. It records status and latency only;
  response bodies, cookies, authorization headers, query strings, request
  bodies, and client IPs are never retained.
- The loopback probe verifies the origin independently of the public edge. The
  wrong-host probe must receive a 4xx response so an unrecognized Host header
  cannot select the application site.

## Header contract

The edge owner must prove these exact response headers on the public HTTPS
probe:

| Header | Required value |
| --- | --- |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |

Authentication, API, login, workspace, and probe responses must be
`Cache-Control: no-store`. A future CSP or cross-origin isolation policy needs
an owner-reviewed compatibility decision; this preparatory contract does not
silently add one at the edge.

## Continuous-probe contract

The public HTTPS and loopback probes run every 60 seconds with a 10-second and
5-second timeout respectively. Three consecutive failures open the alert. The
unknown-host negative probe runs every five minutes and must remain a 4xx.
Probe requests use no cookies or credentials and discard response bodies. Alert
payloads contain only `probeId`, status, latency, timestamp, and outcome.
The evaluator also requires normalized request metadata (transport, canonical
connect address, Host header, and exact path) to match the configured probe.
The unknown-host negative probe connects to `munjib.example.invalid` and only
overrides the Host header to `unknown.invalid`; a DNS/TLS failure cannot count
as a successful 4xx rejection. Malformed headers, timestamps, paths, or request
metadata fail closed.

## Activation gates

Do not edit `/etc/caddy/Caddyfile`, DNS, TLS state, firewall rules, or host
monitoring until all of the following are attached to the same release
evidence:

1. Leaves 3, 4, 7, 8, 9, 10, 11v2, and 13B are merged and deployed, with their
   protected artifact owners and database/runtime contracts attested.
2. The edge owner has recorded certificate/DNS ownership and the exact
   loopback upstream binding; no alternate public origin is accepted.
3. A header-conformance run proves every required header and the no-store cache
   policy over the canonical HTTPS origin.
4. A continuous-probe run proves public success, loopback success, and
   unknown-host rejection for at least three consecutive intervals.
5. Leaf 13A/13B immutable broker evidence authorizes the candidate and its
   rollback floor. This branch must not perform privileged installation or
   production traffic changes.

The branch can be rebased after those gates close. Until then, keeping the
contract and readiness note documentation-only prevents an unverified Caddy
change or a probe that accidentally captures authentication material.
