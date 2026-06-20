# AI Provider 503 Sentry Capture Design

## Context

Issue #116 addresses two related AI observability problems in Munjib:

- Selecting OpenRouter or switching between OpenRouter and OpenAI-compatible
  chat models can produce a user-facing `503 AI_UNAVAILABLE` response.
- Those `503` responses are handled route responses, so Sentry does not record
  them as uncaught request errors.

The current public API contract intentionally normalizes recoverable RAG and
provider failures to `AI_UNAVAILABLE`. That protects users from provider
details, credentials, prompt content, document body, and raw model output. The
same normalization also hides actionable production failures from Sentry unless
the application explicitly captures a sanitized event.

This design keeps the public response contract unchanged while adding an
internal, privacy-safe Sentry capture path for handled AI provider failures in
both document Ask AI and workspace chatbot flows.

## Decisions From Brainstorming

- Preserve the existing `503 AI_UNAVAILABLE` public response shape.
- Treat handled RAG/provider failures as expected API responses and capture
  them explicitly for observability.
- Keep raw question, prompt, retrieved context, answer, document body, API key,
  and provider base URL out of Sentry events.
- Cover both document Ask AI and workspace chatbot failure paths.
- Use local and deployed OpenRouter/OpenAI failures as reproduction surfaces,
  but make the code path provider-neutral.
- Update wiki documentation because this changes the durable observability
  contract for AI failures.

## Goals

- Add a focused observability helper for handled AI unavailable errors.
- Capture sanitized Sentry events when Ask AI maps a RAG runtime error to
  `503 AI_UNAVAILABLE`.
- Capture sanitized Sentry events when workspace chatbot preparation maps a RAG
  runtime error to `503 AI_UNAVAILABLE`.
- Capture sanitized Sentry events when workspace chatbot streaming fails after
  the NDJSON response has already started and emits `{ type: "error",
  error: "AI_UNAVAILABLE" }`.
- Include useful tags or context such as AI surface, workspace slug, status,
  RAG error code, chat provider, and chat model when known.
- Avoid sending prompt, context, answer, request body, document body, secrets,
  headers, cookies, full URLs with query strings, or provider base URLs to
  Sentry.
- Keep Sentry optional and fail-open. Missing DSN or Sentry SDK failure must not
  change AI API behavior.
- Add targeted tests for capture behavior and existing response behavior.

## Non-Goals

- Do not change the public error response from `AI_UNAVAILABLE`.
- Do not expose OpenRouter, OpenAI, or LangChain raw error bodies to users.
- Do not add API key, base URL, or provider credential fields to the settings
  panel.
- Do not change chat provider/model validation semantics.
- Do not fetch the OpenRouter model catalog.
- Do not change Langfuse capture mode or make full prompt tracing the default.
- Do not solve every provider failure category in this slice. Fine-grained
  auth/quota/rate-limit/model-not-found taxonomy can follow after sanitized
  capture exists.
- Do not change embedding provider, embedding model, vector dimensions, or
  indexing behavior.

## Architecture

Add a small server-side helper under `lib/observability/` rather than placing
Sentry calls directly throughout RAG business logic. The helper should own:

- importing `@sentry/nextjs`
- building a wrapper error name/message safe for Sentry
- converting known inputs into tags/context
- avoiding no-op or thrown behavior when Sentry is disabled or unavailable

Proposed public seam:

```ts
captureHandledAiUnavailable({
  error,
  surface,
  workspaceSlug,
  status: 503,
  ragErrorCode,
  chatProvider,
  chatModel,
});
```

`surface` should distinguish at least:

- `ask_document`
- `workspace_chat_prepare`
- `workspace_chat_stream`

The helper should create a sanitized wrapper error such as
`HandledAiUnavailableError`. It can attach the original error as `cause` only if
tests verify the captured payload does not include prompt/context/provider
response bodies. If that cannot be guaranteed, it should omit the original error
and record only the stable RAG error code.

## Data Flow

### Document Ask AI

`app/api/workspaces/[workspaceSlug]/documents/[documentId]/ask/route.ts`
currently catches errors from `askDocumentQuestion()`. When
`isRagRuntimeError(message)` is true, the route returns `503 AI_UNAVAILABLE`.

The implementation should call the new helper immediately before returning that
response. The route already has `workspaceSlug`, and it can inspect the request
body's validated `chatProvider` and `chatModel` fields. If the request had no
override, the route may omit provider/model rather than reading more config in
the catch block.

### Workspace Chat Preparation

`app/api/workspaces/[workspaceSlug]/assistant/error-response.ts` maps RAG
runtime errors to `503 AI_UNAVAILABLE` before a stream starts. The helper should
be called on that branch. To preserve a focused helper and keep route behavior
readable, the error response helper can accept optional context:

```ts
workspaceChatErrorResponse(error, {
  surface: "workspace_chat_prepare",
  workspaceSlug,
});
```

The message route should pass `workspaceSlug` when calling this function.

### Workspace Chat Streaming

`app/api/workspaces/[workspaceSlug]/assistant/messages/route.ts` can fail after
the NDJSON stream has already emitted `{ type: "start" }` and possibly token
events. In that case the HTTP status remains `200`, but the stream emits
`{ type: "error", error: "AI_UNAVAILABLE" }`.

The streaming catch branch should call the same helper before emitting the
error event, except when the request was aborted or the only error is the
expected `THREAD_ARCHIVED` race. The captured surface should be
`workspace_chat_stream`, and context can include the prepared chat provider/model
when available from the prepared object.

## Error Handling

The user-facing behavior remains:

- invalid provider/model input: `400 INVALID_CHAT_MODEL`
- missing question/message: `400`
- missing workspace/document: `404`
- recoverable RAG/provider failure in document Ask AI: `503 AI_UNAVAILABLE`
- recoverable RAG/provider failure before workspace chat stream starts:
  `503 AI_UNAVAILABLE`
- recoverable RAG/provider failure after workspace chat stream starts:
  NDJSON `{ type: "error", error: "AI_UNAVAILABLE" }`

Sentry capture must never throw back into these paths. If Sentry SDK capture
fails or is not initialized because `SENTRY_DSN` is empty, the route should still
return the same public response.

## Security And Privacy

Sentry events for handled AI failures may include:

- stable AI surface
- HTTP status or stream error shape
- stable RAG error code such as `RAG_CHAT_REQUEST_FAILED`
- workspace slug or workspace id if already available in the route context
- chat provider and model id when already validated or prepared
- whether the failure happened before or after streaming started

Sentry events must not include:

- user question text
- prompt text
- current document markdown
- retrieved chunks
- model answer text
- API keys
- provider base URLs
- cookies
- request/response headers
- full request URLs or query strings
- raw provider response body if it might include prompt, key, or model output

The existing Sentry scrubber remains active as a second layer, but this feature
should not rely on scrubber cleanup for fields it can avoid sending in the
first place.

## Provider Debugging

This design does not assume the OpenRouter/OpenAI 503 root cause. The first
implementation should preserve enough sanitized signal to distinguish common
failure classes later:

- missing or invalid server provider config
- provider rejected selected model id
- provider auth/quota/rate-limit failure
- network or provider availability failure
- LangChain chat invocation returned an empty response

The current answer chain collapses provider invocation failures into
`RAG_CHAT_REQUEST_FAILED` after logging the original error to server logs. This
slice may keep that collapse and capture the stable code first. If adding a
safe error classifier is small and testable, it can be added as metadata without
changing public responses.

## Testing

Add focused tests for:

- document Ask AI route captures a handled RAG runtime error and still returns
  `503 AI_UNAVAILABLE`
- document Ask AI route does not capture validation errors as provider failures
- workspace chatbot preparation errors capture a handled RAG runtime error and
  still return `503 AI_UNAVAILABLE`
- workspace chatbot streaming errors capture a handled RAG runtime error while
  still emitting NDJSON `AI_UNAVAILABLE`
- aborted streams and `THREAD_ARCHIVED` stream races do not create misleading
  provider-unavailable Sentry events
- the helper sends only sanitized tags/context
- Sentry capture failures are swallowed

Run the focused route and observability tests:

```bash
pnpm exec vitest run tests/rag/ask-route.test.ts tests/rag/workspace-chat-route.test.ts tests/observability/sentry-config.test.ts tests/observability/sentry-scrub-event.test.ts tests/observability/sentry-files.test.ts --reporter=dot
pnpm exec tsc --noEmit --pretty false
```

Full verification before PR should also include the wiki sync commands required
by `AGENTS.md`.

## Wiki And Documentation

Update the smallest durable wiki set:

- `wiki/RAG Process Workflow.md`: document that handled AI provider failures
  still return `AI_UNAVAILABLE` publicly but are captured as sanitized Sentry
  events.
- `wiki/Production Observability Workflow.md`: document that Sentry covers
  handled AI 503 responses in addition to uncaught App Router errors, while
  Docker logs remain the source for startup/env/container failures.
- `wiki/index.md`: update the AI/RAG or monitoring status summary only if the
  navigation summary needs to mention this behavior.
- `wiki/log.md` and `wiki/manifest.json`: update through the standard wiki
  maintenance flow.

## Rollout

No database migration is required.

Local behavior can be verified with Sentry disabled to confirm responses remain
unchanged, and with a configured DSN or mocked Sentry module in tests to confirm
capture calls. Deployed behavior requires the production container to have
`SENTRY_DSN` or `NEXT_PUBLIC_SENTRY_DSN` configured for server-side capture.

After implementation, validate the deployed environment separately from route
health:

- confirm the container has server Sentry DSN env configured
- trigger a real OpenRouter/OpenAI provider failure or use a controlled test
  failure path if one exists
- confirm the route still returns `AI_UNAVAILABLE`
- confirm Sentry receives a sanitized handled AI unavailable event
- inspect Docker logs for raw provider details that should not be sent to
  Sentry
