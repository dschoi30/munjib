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

## Native Caddy edge proof service (Issue #217)

`cmd/munjib-trial-edge` implements the existing proof contract without touching bodies or changing application authorization. Build for this OCI host with `CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -trimpath -o munjib-trial-edge ./cmd/munjib-trial-edge`. Run `go test -race ./cmd/munjib-trial-edge`; old Go/macOS linker combinations may require `-ldflags=-linkmode=external` for local tests only.

Install the reviewed binary at `/usr/local/libexec/munjib-trial-edge` (root-owned, 0755) and `deploy/systemd/munjib-trial-edge.service` at `/etc/systemd/system/`. The service runs as a dedicated systemd DynamicUser and obtains the existing key through `LoadCredential`, keeping `/etc/munjib/secrets` permissions unchanged. Restart the service whenever rotating that key; the application must receive the same bytes. The listener is strictly `127.0.0.1:9187`.

Back up `/etc/caddy/Caddyfile`. Inside the canonical site, replace its final `reverse_proxy` with `deploy/caddy/munjib-trial.caddy` contents. The snippet places the legacy Trial-provider denial inside the route before its final proxy; an old top-level respond would otherwise become unreachable because Caddy sorts route before respond. Remove the redundant old top-level denial only after confirming the inner matcher covers both original paths. This template assumes Caddy directly receives the client connection; do not put another proxy in front without reviewing client-IP authority. Run `caddy adapt --config /etc/caddy/Caddyfile --adapter caddyfile --pretty` and confirm request-header removal precedes the signer and the signer sets original method/URI. Then `caddy validate`, start the signer, and reload Caddy. No public port or DNS change is needed.

Before enabling Trial, verify IPv4 and IPv6 proof vectors, POST method and query exclusion, forged client proof replacement, and actual entitlement → viewer → AI requests. Unmatched ordinary routes keep their direct proxy. A failed signer closes the matched routes (including authenticated Ask/Workspace AI); roll back Caddy to its previous direct proxy and keep Trial disabled if the signer is unhealthy. Keep all IPs, cookies and proof headers out of operational logs.

The signer accepts the systemd-managed credential at its fixed `/run/credentials/munjib-trial-edge.service/trial-edge-proof-secret` path with systemd's root:root 0440 plus service-only ACL envelope; arbitrary group-readable files remain rejected. The application secret under `/etc/munjib/secrets` retains its existing UID 10001/0400 contract. Host validation must check a sustained active service and an actual signed request, not just the initial `systemctl start` result.

After starting the signer, run `sudo python3 scripts/deploy/verify-trial-edge.py < deploy/caddy/munjib-trial.caddy` on the host. It uses temporary loopback Caddy/upstream processes, verifies signatures privately and leaves public routing unchanged. `uri /proof?` deliberately clears the copied query on the signer subrequest, while the original URI header preserves the path used for HMAC.
