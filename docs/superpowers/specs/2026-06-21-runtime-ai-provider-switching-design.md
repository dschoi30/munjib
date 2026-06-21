# Runtime AI Provider Switching Design

## Context

Ask AI and Workspace AI already accept client-side chat provider and model
overrides from the settings panel. The current failure path appears when the UI
selects `openai-compatible` with an OpenRouter model while the running Docker
web container does not have `MUNJIB_OPENAI_COMPATIBLE_BASE_URL` or the matching
API key configured. The server treats that missing provider config as a RAG
runtime failure and returns `503 AI_UNAVAILABLE`.

The desired behavior is runtime provider switching by settings value: a user can
select Ollama, OpenAI, or OpenRouter/OpenAI-compatible in the settings panel, and
both Ask AI and Workspace AI use that selected provider/model without requiring
code changes.

## Goals

- Keep the existing settings panel provider/model override flow.
- Support runtime switching among `ollama`, `openai`, and `openai-compatible`
  for both Ask AI and Workspace AI.
- Ensure the deployed web container has the required environment values for all
  providers that may be selected at runtime.
- Keep the embedding provider independent from the chat provider. The current
  deployed embedding path remains Ollama `bge-m3` with 1024 dimensions.
- Improve diagnostics so provider misconfiguration is distinguishable from
  provider outages or model request failures.

## Non-Goals

- Do not store provider API keys in browser storage or workspace database rows.
- Do not redesign the settings panel.
- Do not replace the existing RAG prompt, retriever, or citation flow.
- Do not introduce a separate model gateway service.

## Runtime Configuration

The Docker web service should be started with all provider-specific values that
the server may need:

```text
MUNJIB_RAG_CHAT_PROVIDER=ollama
MUNJIB_RAG_CHAT_MODEL=gemma4:e4b

MUNJIB_OLLAMA_BASE_URL=http://host.docker.internal:11434

OPENAI_API_KEY=official-openai-key-if-openai-is-selectable
MUNJIB_OPENAI_API_KEY=optional-official-openai-fallback-key
MUNJIB_OPENAI_BASE_URL=optional-official-openai-proxy-url

MUNJIB_OPENAI_COMPATIBLE_BASE_URL=https://openrouter.ai/api/v1
MUNJIB_OPENAI_COMPATIBLE_API_KEY=openrouter-key-if-openrouter-is-selectable

MUNJIB_RAG_EMBED_PROVIDER=ollama
MUNJIB_RAG_EMBED_MODEL=bge-m3
MUNJIB_RAG_EMBED_DIMENSIONS=1024
```

`MUNJIB_RAG_CHAT_PROVIDER` and `MUNJIB_RAG_CHAT_MODEL` only define the default
server-side chat choice. They must not limit what a valid request override can
use. A request with `{ chatProvider, chatModel }` should use the selected
provider as long as that provider's server-side config is present.

## Application Behavior

The Ask AI route and Workspace AI route continue validating provider/model pairs
with `validateChatProvider` and `validateChatModelId`.

When a provider override is supplied, `getRagModelConfig` builds only that
selected chat provider plus the configured embedding provider. Missing required
values remain configuration errors:

- OpenAI requires `OPENAI_API_KEY` or `MUNJIB_OPENAI_API_KEY`.
- OpenAI-compatible requires `MUNJIB_OPENAI_COMPATIBLE_BASE_URL`; an API key is
  optional for unauthenticated compatible endpoints but required in practice for
  OpenRouter.
- Ollama requires `MUNJIB_OLLAMA_BASE_URL`, defaulting to local Ollama if absent.

Handled AI unavailable telemetry should include the selected provider, model,
and `RAG_INVALID_CONFIG` when configuration is missing. The client-facing error
can stay generic, but server logs and Sentry should make the missing provider
configuration clear.

## Deployment Fix

The production Docker Compose invocation currently reads `.env`, while
OpenRouter values were present only in `.env.docker`. The fix is to place the
runtime provider values in the env file actually used by Compose, or to change
the deployment command to always pass the intended env file. The chosen fix
should avoid committing secret values.

For this server, the smallest immediate fix is to add non-secret provider
variable names and required runtime values to the local untracked `.env`, then
recreate the `web` service so the container receives them.

## Verification Plan

1. Confirm `docker compose config` shows provider variables for Ollama, OpenAI,
   and OpenAI-compatible as expected, without printing secrets in public output.
2. Recreate the web container and confirm `printenv` inside the container shows
   required provider values as present.
3. Confirm Ollama is reachable from inside the container at
   `MUNJIB_OLLAMA_BASE_URL`.
4. Confirm OpenRouter model metadata includes `google/gemma-4-31b-it:free`.
5. Exercise Ask AI with an OpenRouter model override and verify it no longer
   fails with `RAG_INVALID_CONFIG`.
6. Exercise Workspace AI with the same override.
7. Optionally test official OpenAI after an official OpenAI key is configured.

## Risks

OpenRouter or official OpenAI can still fail for quota, auth, provider outage,
or model-specific availability. Those should remain `RAG_CHAT_REQUEST_FAILED`
runtime failures, not configuration failures.

Free OpenRouter models may be rate-limited or temporarily unavailable even when
the model id exists. Verification should distinguish model/provider failure from
missing server configuration.
