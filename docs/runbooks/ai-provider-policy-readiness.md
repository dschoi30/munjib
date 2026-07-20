# AI provider policy readiness

Issue #164 tracks the server-side policy that controls which AI providers,
models, and destinations may receive Munjib content. This note is a
public-safe readiness handoff; it is not a provider activation or a production
configuration change.

## Current release evidence

- Ask AI and Workspace AI accept only a validated provider/model pair from the
  request. The request does not accept an API key, provider base URL, or
  embedding configuration.
- Provider credentials and destinations are read only from server environment
  variables. The browser availability map is a UI hint; it is not a server
  authorization policy.
- Model identifiers are syntax-checked and provider-compatible, but the
  current release does not enforce an operator-owned model allowlist or a
  destination/egress allowlist. A configured OpenAI-compatible endpoint can
  therefore receive any syntactically valid model id that the endpoint accepts.
- Missing provider configuration is normalized to `RAG_INVALID_CONFIG` and a
  public `AI_UNAVAILABLE` response. This prevents credential disclosure but
  does not replace an explicit policy decision.

## Required policy contract

The implementation leaf must add a single server-owned policy resolver used by
both Ask AI and Workspace AI before model construction. It must:

1. allow only explicitly enabled providers;
2. allow only operator-approved model ids (including a deliberate custom-model
   policy, if custom ids remain supported);
3. resolve credentials and base URLs from server-side secret/config sources;
4. reject client attempts to supply credentials, URLs, embedding identity, or
   policy bypass flags;
5. fail closed with a stable internal error before any provider request when a
   provider/model/destination is not allowed; and
6. emit only provider, model, and stable error code in telemetry, never keys,
   URLs, prompts, retrieved content, or provider response bodies.

The destination policy must cover chat, embedding, and optional Langfuse
egress. URL parsing must reject credentials, non-approved schemes, loopback or
private destinations in production, and redirects that escape the approved
destination set. Local development may opt into loopback through an explicit
non-production gate.

## Dependency gate

Do not activate this policy or change live provider/schema behavior until the
following are rebased and verified together:

- Issue #139: workspace model-profile and embedding authority, so a new policy
  cannot be bypassed by a second profile/configuration source;
- Issue #163: AI-history authorization, so policy and audit metadata are bound
  to the same actor/workspace authority;
- Issue #160: document authorization, so provider requests cannot be used to
  read content outside the canonical document boundary;
- Issue #184 and Issue #185: exact-digest private runtime and delivery broker,
  so the policy file and its configuration cannot be replaced through the
  current mutable deployment path.

Until those gates close, keep this branch documentation-only. The eventual
implementation must include unit tests for provider/model/destination matrix,
route tests proving credentials and URLs are never request-controlled, and a
production-like no-egress probe that records only redacted destination
identifiers.

## Rollback and evidence boundary

Roll back by reverting the policy resolver and its configuration projection;
never fall back to accepting an arbitrary client provider or URL. GitHub issue
and PR records may contain this contract, test names, and pass/fail outcomes
only. Secret values, private host topology, provider payloads, and restricted
operational evidence remain local.
