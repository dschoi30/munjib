---
id: security-hardening-public-status
title: Security Hardening Public Status
type: workflow
status: active
summary: Issues #154/#167의 public-safe child status, open readiness PR, dependency gate, and non-claim navigation.
created: 2026-07-13
updated: 2026-07-20
source_count: 1
tags:
  - security
  - deployment
  - workflow
links:
  - "[[index|Wiki Index]]"
  - "[[CI CD And Monitoring Workflow]]"
---

# Security Hardening Public Status

Issues #154 and #167의 공개 상태를 GitHub-visible issue/branch/PR handle과
dependency gate 중심으로 유지한다. 상세 위협 모델, host topology, account
state, secret, operator evidence는 이 wiki와 GitHub-visible history에 기록하지
않는다.

## Current snapshot

- Audit base: `origin/main` `c742a62` (merged PR #207).
- Merged and production-verified P0 chain: #155, #157, #158.
- Delivery substrate code is merged in PR #170 and bundle packaging is merged in
  PR #186; host broker installation, trust enrollment, and independent
  attestation remain a separate open gate in #185.
- Database-authority contracts are merged in PR #181; exact-digest runtime
  continuation is open PR #188 and remains fail-closed on the #185 gate.
- Implementation PRs #199–#207 are merged into main as preparation contracts;
  they do not by themselves close the parent issues or certify deployment.
- Readiness/document PRs #187, #189, #191, #192, #193, #194, #195, #196,
  #198, and signup-gate PR #161 remain open. Their fresh Actions runs are
  blocked before runner start by the repository billing/spending-limit gate.
- PR #190 is closed as a duplicate of the stronger recovery contract in #206.
- Current external blocker: GitHub Actions reports an account-payment failure
  or spending-limit issue for the open readiness PRs. Resolve `Billing & plans`
  before treating a new CI result as merge/deploy evidence.

## Authoritative status map

The full public-safe table, including every child implementation dependency and explicit
non-claim, is in
`docs/runbooks/security-hardening-status.md`. Keep that runbook and this page
aligned when a PR/branch changes. A draft or branch head is a preparation
handoff, not evidence of production deployment, host broker attestation,
snapshot/restore, purge, key rotation, or account mutation.

## Parent closure rule

Do not close #154 or #167 until every child has an accepted implementation,
public-safe verification, and deployment evidence. Restricted operational proof
must remain outside the repository and issue/PR comments.
