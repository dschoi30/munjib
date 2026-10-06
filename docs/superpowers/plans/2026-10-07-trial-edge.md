# Trial Edge Proof Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect production Caddy to the existing anonymous Trial signed-network contract.
**Architecture:** Loopback-only Go signer behind Caddy forward_auth; no body proxy or app authorization changes.
**Tech Stack:** Go standard library, Caddy, systemd.
**Spec:** `docs/superpowers/specs/2026-10-07-trial-edge-design.md`

## Global Constraints
- Match `trustedNetworkDigest` HMAC domain, separators, seconds timestamp and unpadded base64url.
- Use a dedicated systemd DynamicUser, a 0400 regular non-symlink key and loopback port 9187.
- Keep client data and secrets out of logs; no new dependencies or public ports.

## Review Focus
- IPv6 and mapped IPv6 normalize identically to Node.
- Query-bearing viewer URLs and original POST methods survive forward_auth rewriting.
- Forged/duplicate headers cannot become trusted edge evidence.
- Unsafe key files fail startup; malformed paths never produce a proof.
- Unrelated routes and streaming bodies preserve the existing proxy path.

### Task 1: Signer and deployment configuration
**Files:** `cmd/munjib-trial-edge/main.go`, `main_test.go`, `deploy/caddy/munjib-trial.caddy`, `deploy/systemd/munjib-trial-edge.service`, `docs/runbooks/demo-public-access.md`.
**Interfaces:** `proof(key, timestamp, method, uri, ip string) (string,error)`; `handler(key string, now func() time.Time) http.Handler`.
- [x] Write independent Node-vector and negative HTTP/input tests; observe undefined-symbol failure.
- [x] Implement bounded signer, strict key loader, Caddy header replacement and systemd service.
- [x] Run Go race tests, Linux ARM64 build, adapted Caddy validation and independent review.
- [ ] Update wiki, commit/push/create ready PR and inspect review/CI after five minutes.
- [ ] Install approved files with backups, verify live behavior and keep Trial closed on any missing prerequisite.
