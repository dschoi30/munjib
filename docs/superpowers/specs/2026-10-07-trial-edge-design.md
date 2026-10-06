# Trial edge proof deployment

The approved manually closed demo needs the application's existing signed-network contract connected to the live Caddy edge. Keep the application verifier, quotas and isolated principal unchanged. Caddy directly terminates TLS on this host.

A small standard-library Go service listens only on 127.0.0.1:9187. Caddy strips incoming proof headers and supplies the actual peer IP plus its overwritten original method/URI. The service validates these inputs, excludes query parameters, normalizes IP exactly like the TypeScript verifier, and returns the three HMAC headers through forward_auth. Scope is entitlement, Trial viewer, document Ask and Workspace AI routes. Streaming request/response bodies stay between Caddy and the app.

Run as a dedicated systemd DynamicUser with a fixed root-provisioned 0400 secret file delivered through systemd LoadCredential (no secret-directory traversal permission changes). Bound HTTP timeouts and headers. Never log IPs, cookies, queries or keys. Refuse invalid requests and missing/unsafe secret files. No public listener or development raw-header trust.

Validate independent Node HMAC vectors, IPv4/IPv6, query exclusion, original POST binding, duplicate authority headers, malformed inputs, secret permissions and actual adapted Caddy handler order. Deployment requires a rollback copy of Caddyfile, caddy validate, and live entitlement/viewer/AI checks. Existing user approval covers opening the demo; this supplies its required existing trust contract.

Existing Trial retention policy is activated by a daily 00:40 KST systemd timer. A separate DB role can only SELECT/DELETE the four usage tables; no user/document access. A shared deploy lock prevents execution during checkout/image changes. Verify dry-run → execute → dry-run before enabling.
