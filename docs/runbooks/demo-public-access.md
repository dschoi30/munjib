# Public signup and anonymous Trial demo access

Issue #214 adds manual opt-in access with no automatic expiry. Code delivery does not activate production by itself.

## Open

In the root-owned `/etc/munjib/env`, set `MUNJIB_PUBLIC_SIGNUP_ENABLED=true` and `MUNJIB_ANONYMOUS_TRIAL_ENABLED=true`. Both default closed. Restart/recreate the web container after changes. Password signup and new Google signup share the first flag. Existing users can still log in after closing it. Google requires the existing `docker-compose.google.yml` configuration and OAuth credentials.

Trial requires `docker-compose.trial.yml` plus all of:

- `MUNJIB_TRIAL_DEMO_WORKSPACE_ID` and `MUNJIB_TRIAL_DEMO_WORKSPACE_SLUG` identifying the existing exact demo workspace. Inspect the documents before sharing it: active documents without explicit grants are visible to anonymous visitors.
- `MUNJIB_TRIAL_AI_GLOBAL_DAILY_LIMIT` as a positive integer chosen by the operator. Visitor/network quotas remain unchanged.
- `MUNJIB_TURNSTILE_HOSTNAME` matching the HTTPS `NEXTAUTH_URL` hostname, and the public `MUNJIB_TURNSTILE_SITE_KEY` for that hostname.
- Five files under `/etc/munjib/secrets/`: `trial-visitor-signing-key`, `trial-visitor-digest-key`, `trial-network-bucket-key`, `trial-edge-proof-secret`, `turnstile-secret`. The overlay maps them to the exact runtime paths. Use existing strict secret ownership/mode requirements (runtime UID 10001, mode 0400); generate independent random signing/digest keys. Obtain the Turnstile secret from its configured widget; do not invent one.
- A trusted edge that removes client-supplied network headers and signs the normalized client IP, HTTP method and exact pathname. The HMAC contract is in `trustedNetworkDigest` in `lib/auth/trial-entitlement.ts`. Plain IP headers are insufficient. Do not enable development raw-header trust in production.
- Applied migrations including `20260825010000_anonymous_trial_ai_admission`, working chat/embedding providers, and the existing retention maintenance schedule.

`scripts/deploy/munjib-deploy.sh` selects the fixed Trial overlay when the host env has `MUNJIB_ANONYMOUS_TRIAL_ENABLED=true`. Update the root-owned installed wrapper using the existing runner runbook before deploying this version; changing the repository copy does not replace the installed wrapper.

## Verify

Run auth preflight with the same Compose overlays and host env as deployment. Check actual new email signup, first Google login, personal workspace creation, Trial entry, document visibility, Ask AI and Workspace AI with a fresh browser session. Confirm quota exhaustion still returns the documented limit response. Never claim production activation from a passing build or visible Trial button alone: missing keys or edge proof keep Trial unavailable.

## Close

Set both flags to `false` and recreate `web` with the same deployment setup. The wrapper omits the Trial overlay when closed. No expiry is scheduled, no accounts are deleted, and existing account login remains enabled. Trial capability checks also reject previously issued anonymous cookies when Trial is disabled. Check signup returns `403 SIGNUP_NOT_ALLOWED`, new unlinked Google users are denied, and Trial entry is unavailable.

## Evidence boundary

This change supplies application and deployment wiring. Live keys, edge configuration, selected demo workspace, OAuth callbacks, AI responses and production activation require verification on the actual host.
