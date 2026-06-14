# OpenRouter Chat Model Selection Design

## Context

Issue #102 adds a lightweight model testing workflow to Munjib Ask AI. The
existing RAG implementation already supports provider-neutral chat and
embedding configuration through environment variables. OpenRouter can use the
current `openai-compatible` provider path when the server is configured with:

```text
MUNJIB_RAG_CHAT_PROVIDER=openai-compatible
MUNJIB_OPENAI_COMPATIBLE_BASE_URL=https://openrouter.ai/api/v1
MUNJIB_OPENAI_COMPATIBLE_API_KEY=<server secret>
MUNJIB_RAG_CHAT_MODEL=<server default model>
```

The current live embedding index is still Ollama `bge-m3` with 1024 dimensions.
This design preserves that index contract and lets the user compare answer
generation models without changing retrieval, embeddings, pgvector schema, or
workspace-wide indexing behavior.

## Decisions From Brainstorming

- Use server env for OpenRouter connection details and default chat model.
- Expose only chat model selection in the workspace settings panel.
- Do not expose OpenRouter API key or base URL in the browser.
- Keep embedding provider, embedding model, and embedding dimensions fixed.
- Store the selected chat model only in the current browser, scoped by
  workspace slug.
- Support both preset model choices and direct model-id entry.
- Apply the selected model to Ask AI requests until the browser setting is reset
  or changed.

## Goals

- Add an `AI` section to the existing workspace settings dialog.
- Let a user choose a chat model preset or type a custom OpenRouter-compatible
  model id.
- Persist the selected model in browser `localStorage` per workspace.
- Show the currently applied model in the Ask AI panel.
- Send an optional chat model override with Ask AI requests.
- Override only `modelConfig.chat.model` on the server.
- Preserve the saved-content-only RAG request and citation behavior.
- Keep Langfuse metadata aligned with the actual chat model used for the answer.
- Keep the feature small enough to implement without a new Prisma model.

## Non-Goals

- Do not store AI model settings in the database.
- Do not create team-wide or organization-wide model defaults.
- Do not store, edit, or reveal API keys in client-side code or browser storage.
- Do not fetch the live OpenRouter model catalog in this slice.
- Do not change embedding provider, embedding model, embedding dimensions, or
  vector index identity.
- Do not implement automatic reindexing or vector dimension migration.
- Do not add multi-turn chat history.
- Do not allow per-question prompt editing, temperature tuning, or provider
  switching in this slice.

## UX

The workspace settings dialog gains a second left-navigation item named `AI`.
The existing `Import` item remains the default selected section when the dialog
opens from the workspace menu.

The `AI` section contains:

- current effective model status
- a compact preset selector for project-maintained model ids
- a custom model-id input
- a save/apply action
- a reset action that returns the browser to the server default
- short status copy for saved, reset, and validation states

The UI makes the secret boundary clear by showing that credentials are
configured on the server. It does not include an API key field or base URL
field.

The Ask AI panel shows a small "Model" line near the question form. If the
browser has no override, it shows the server default label. If a local override
exists, it shows that model id. The panel remains document-focused; model
selection stays in workspace settings so the assistant panel does not become a
configuration surface.

The server default model id is safe to display because it is not a credential.
The workspace page reads the env-based RAG config on the server and passes only
the default chat model id into client components. It does not pass provider base
URLs, API keys, Langfuse keys, or embedding configuration into the browser.

## Presets

Preset model ids live in a project-owned code constant named
`RAG_CHAT_MODEL_PRESETS`. The first implementation uses static presets rather
than querying OpenRouter at runtime. Direct custom entry remains available so a
stale preset list does not block testing a newly available model id.

Preset values are product defaults, not security policy. Server-side validation
uses the same model-id syntax rules for presets and custom entries.

## Client State

Add a focused client helper at `lib/rag/client-model-settings.ts`.

Responsibilities:

- Build a stable `localStorage` key from the workspace slug.
- Read the stored chat model override.
- Save a validated chat model override.
- Reset the override.
- Validate model ids consistently for the settings panel and Ask AI panel.
- Emit and listen for a browser event when the setting changes.

The storage key includes the workspace slug so testing one workspace does not
silently change another workspace. The helper is safe during server rendering
by checking for `window` before touching browser APIs.

Validation rules are intentionally simple:

- trim leading and trailing whitespace
- reject empty values
- reject values longer than 160 characters
- reject whitespace and control characters
- require the first character to be alphanumeric
- allow only ASCII letters, digits, `/`, `.`, `-`, `_`, and `:`

The implementation does not enforce a provider allow-list. OpenRouter model ids
and compatible model ids can change, and direct entry is part of the testing
workflow.

## Server Request Flow

The Ask AI route accepts the current body shape plus one optional string field:

```json
{
  "question": "What changed in this document?",
  "chatModel": "provider/model-id"
}
```

Route behavior:

1. Continue to require the current user before service execution.
2. Continue to treat malformed JSON as a missing question.
3. Validate `question` exactly as today.
4. Validate `chatModel` only when it is present.
5. Pass the optional chat model override into `askDocumentQuestion()`.
6. Preserve the current public error response normalization.

Service behavior:

1. Load the regular env-based `RagModelConfig`.
2. Assert the current embedding index exactly as today.
3. If a validated chat model override exists, create an in-memory config where
   only `chat.model` is replaced.
4. Use the effective config for `createChatModel()`, answer-chain invocation,
   and Langfuse metadata.
5. Keep embedding, retrieval, reranking, prompt construction, citations, and
   vector search unchanged.

The server owns final validation even if the client already validated the model
id. A bad override is treated as invalid request input rather than a provider
failure.

## Security And Privacy

The browser stores only model ids. Model ids are not secrets. API keys and base
URLs stay in server env and Docker/deploy configuration.

The override does not allow changing provider type. If the server default is
`ollama`, the override changes only the Ollama chat model name. If the server is
configured for OpenRouter through `openai-compatible`, the override selects an
OpenRouter chat model id. This keeps provider credentials and egress policy in
server-owned configuration.

The route must not pass user-controlled provider names, base URLs, API keys, or
embedding settings into the model factory. It passes only a validated chat model
string.

Langfuse metadata mode remains safe by default. When Langfuse is enabled, the
metadata reflects the effective chat model so test runs can be compared without
sending prompt, context, question, answer, or raw document body in the default
metadata mode.

## Error Handling

Client-side validation errors stay in the settings panel and do not trigger an
Ask AI request.

If the Ask AI panel has a stale or manually corrupted stored model id, the
client ignores it before submit. The server still validates the value. Invalid
server-side override input returns a stable 400 response from the route with an
`INVALID_CHAT_MODEL` error code.

If the server OpenRouter env is missing or invalid, or if OpenRouter rejects the
selected model, the existing RAG runtime error path continues to normalize the
user-facing response to `AI_UNAVAILABLE`. Server logs can retain the underlying
provider error for debugging.

Resetting the model setting removes the local override and returns future Ask AI
requests in that browser/workspace to the env default model.

## Testing

Add focused tests at these layers:

- Client helper tests for workspace-scoped keys, validation, read, write, reset,
  and change events.
- `WorkspaceSettingsPanel` tests for the `AI` tab, preset selection, custom
  entry, saved status, invalid entry, and reset behavior.
- `AiAssistantPanel` tests verifying that the current model is displayed and
  that Ask AI request bodies include `chatModel` only when an override exists.
- Ask route tests verifying valid override forwarding and invalid override 400
  handling.
- RAG service tests verifying the override changes only `chat.model` while
  leaving embedding identity and index compatibility checks untouched.
- Langfuse tests verifying metadata uses the effective chat model.

The implementation also runs the existing RAG and component tests touched by the
feature, plus TypeScript.

## Wiki And Documentation

Because this changes the durable RAG operation model, update the wiki alongside
the implementation:

- `wiki/RAG Process Workflow.md`: document optional browser-scoped chat model
  overrides in the Ask AI request flow.
- `wiki/Local Development Workflow.md`: add a short OpenRouter env example for
  `openai-compatible` chat.
- `wiki/index.md`: update the AI/RAG status summary to mention browser-scoped
  chat model overrides after the behavior is implemented.
- `wiki/log.md` and `wiki/manifest.json`: record the maintenance update through
  the existing wiki tooling.

The wiki distinguishes implemented behavior from this design while the feature
is still unimplemented. The implementation commit updates the wiki when the
behavior actually exists.

## Rollout

The feature can ship as a normal application update. Existing environments keep
using their env default model until a user selects a browser-local override.

For OpenRouter testing, configure the server with `openai-compatible` provider
env and the OpenRouter API key. The settings UI then changes only the chat model
id sent to that already configured provider.

No database migration is required for this slice.
