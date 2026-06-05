# LangChain and Langfuse RAG Provider Abstraction Design

## Context

Issue #100 extends the existing saved-content-only Ask AI RAG system. The
current implementation is intentionally document-centered:

- `askDocumentQuestion()` enforces workspace membership and readable document
  permissions.
- `safeIndexSavedDocument()` refreshes chunks from saved DB document content.
- `buildRetrievalScopes()`, `searchSimilarChunks()`, and
  `rerankRetrievedChunks()` keep graph-aware retrieval inside local code.
- `buildRagPrompt()` instructs the model to use only retrieved saved document
  context.
- `lib/rag/ollama.ts` is the current model boundary for both chat and
  embeddings.

This design keeps the saved-document, permission, pgvector, and retriever
contracts intact while replacing the model boundary with LangChain provider
adapters and adding Langfuse observability.

## Goals

- Use LangChain for chat and embedding provider integration.
- Support `ollama`, `openai`, and `openai-compatible` providers.
- Let the server switch chat and embedding providers through environment
  variables.
- Keep the existing Ask AI route response shape and assistant UI behavior.
- Keep pgvector as the local vector store for this slice.
- Add Langfuse tracing for the LangChain answer-generation path.
- Fail open when Langfuse is missing or unavailable.
- Protect production document data by defaulting production traces to metadata
  rather than prompt, context, answer, or raw document body capture.
- Fail fast for embedding configurations that do not match the current
  `vector(1024)` storage contract.

## Non-Goals

- Do not add workspace-level or request-level provider selection.
- Do not migrate `DocumentChunk.embedding` away from `vector(1024)`.
- Do not implement automatic workspace-wide reindexing after provider/model
  changes.
- Do not replace graph-aware retrieval, reranking, readable document filtering,
  or pgvector raw SQL with LangChain vector store abstractions.
- Do not add durable multi-turn chat history.
- Do not expose Langfuse trace ids in the assistant panel UI.

## Architecture

The first slice should keep the existing RAG orchestration shape:

1. Load workspace, membership, documents, and explicit permissions.
2. Filter readable documents with the same policy used by the workspace page.
3. Verify the selected document is readable.
4. Load persisted document links.
5. Best-effort index the selected saved document.
6. Build graph-aware retrieval scopes from saved readable document content.
7. Embed the user question.
8. Search pgvector chunks and rerank them with existing scope/keyword boosts.
9. Build the saved-context prompt and citations.
10. Invoke the model through a LangChain answer chain.

Only steps 7 and 10 move behind a provider-neutral LangChain seam in this
design. Steps 1-6 and 8-9 remain local domain logic because they contain the
project-specific permission, saved-content, graph, and pgvector freshness
contracts.

## Modules

Add or refactor focused modules under `lib/rag/`:

- `model-config.ts`: reads and validates provider/model/dimension env.
- `model-factory.ts`: creates LangChain chat and embedding model instances.
- `embedding-client.ts`: exposes provider-neutral `embedText()` and optionally
  `embedDocuments()` using LangChain embedding interfaces.
- `answer-chain.ts`: builds and invokes the LCEL prompt/model/parser chain.
- `langfuse.ts`: creates optional Langfuse callback config and metadata.

`lib/rag/ollama.ts` can become a compatibility shim during implementation or be
removed once tests and imports move to provider-neutral modules. The public seam
for app code should become provider-neutral rather than Ollama-specific.

## Provider Configuration

Configuration is server-wide and environment-variable based.

```text
MUNJIB_RAG_CHAT_PROVIDER=ollama|openai|openai-compatible
MUNJIB_RAG_EMBED_PROVIDER=ollama|openai|openai-compatible

MUNJIB_RAG_CHAT_MODEL=gemma4:e4b
MUNJIB_RAG_EMBED_MODEL=bge-m3
MUNJIB_RAG_EMBED_DIMENSIONS=1024

MUNJIB_OLLAMA_BASE_URL=http://localhost:11434
MUNJIB_OPENAI_BASE_URL=
MUNJIB_OPENAI_COMPATIBLE_BASE_URL=
```

Defaults preserve current behavior:

- chat provider: `ollama`
- embedding provider: `ollama`
- Ollama base URL: `http://localhost:11434`
- chat model: `gemma4:e4b`
- embedding model: `bge-m3`
- embedding dimensions: `1024`

Official OpenAI should use the standard OpenAI SDK credential environment where
possible, including `OPENAI_API_KEY`. OpenAI-compatible endpoints should be
tagged separately from official OpenAI in config and traces even if the
underlying LangChain class is `ChatOpenAI` / `OpenAIEmbeddings` with a custom
base URL. This keeps provider attribution, cost policy, and data egress policy
clear.

Provider values outside `ollama`, `openai`, and `openai-compatible` are invalid
config. Blank env values fall back only where a default is safe.

## Embedding Compatibility

The current database stores embeddings in a pgvector `vector(1024)` column and
the vector SQL casts query vectors as `vector(1024)`. This first slice does not
change that schema.

`MUNJIB_RAG_EMBED_DIMENSIONS` must be `1024`. A different value should produce a
stable configuration error before a vector enters the store/search layer.

Changing provider or embedding model changes semantic space. Existing chunks
for the old embedding model must not be treated as compatible with the new
model. This slice should fail fast for live Ask AI requests when the configured
embedding provider/model/dimension identity is not the current indexed identity.
The current indexed identity is the existing Ollama `bge-m3` 1024 setup unless a
later reindex workflow records a different compatible state.

The implementation should not silently create a partial index for only the
selected document under a new embedding identity. Selected-document best-effort
indexing remains valid for the current compatible identity only. Workspace-wide
reindexing and durable embedding index-state metadata are follow-up tasks.

OpenAI embeddings can use a 1024-dimension option for models that support
dimension reduction. If a selected OpenAI or OpenAI-compatible embedding model
does not return exactly 1024 finite numbers, the embedding client returns
`RAG_INVALID_EMBEDDING`. Even when the embedding result shape is valid, a
non-current embedding identity returns `RAG_EMBEDDING_INDEX_INCOMPATIBLE` for
live Ask AI until a reindex workflow makes that identity current.

## LangChain Answer Chain

The answer path should use LangChain for prompt formatting and chat invocation,
while preserving the existing prompt contract.

The chain shape is:

```text
ChatPromptTemplate
  | selected ChatModel
  | StringOutputParser
```

The prompt must preserve these behavioral rules:

- Use only the saved document context provided in the request.
- Do not use unsaved editor draft title or markdown.
- Do not use outside knowledge.
- If evidence is insufficient, say the saved documents do not contain enough
  evidence to answer.
- Answer in the user's language where possible.
- Cite support with bracketed citation numbers such as `[1]`.

Citation metadata should continue to be built locally from the ranked chunks.
The model output remains answer text only; the route response remains
`{ answer, citations }`.

## Langfuse Observability

Langfuse is an optional observability layer. If Langfuse env is missing, invalid,
or unavailable, Ask AI should continue without tracing.

The implementation should create Langfuse callbacks only when tracing is
configured. The callback should be passed in the LangChain invocation config, not
wired into unrelated retrieval or permission code.

Production trace mode defaults to metadata-focused capture. Metadata should be
useful for debugging without sending document bodies:

- route or operation name
- workspace slug or workspace id
- selected document id
- actor id if allowed by privacy policy, otherwise an internal hash or omit
- chat provider and model
- embedding provider, model, and dimensions
- retrieved chunk count
- citation document ids
- error code if one occurs

Production traces must not intentionally include:

- raw saved document content
- retrieved chunk text
- full prompt text
- user question text
- model answer text
- unsaved editor draft title or markdown

Development can allow full prompt/answer trace data through an explicit env
opt-in. Test mode should avoid network trace delivery.

Langfuse callback failures, flush failures, or SDK queue failures must not turn
successful model answers into user-facing errors.

## Error Handling

Provider-neutral RAG errors should replace Ollama-specific public service
imports.

Stable error categories:

- `RAG_INVALID_CONFIG`: invalid provider/env/model/dimension configuration.
- `RAG_EMBEDDING_REQUEST_FAILED`: embedding provider request failed.
- `RAG_INVALID_EMBEDDING`: embedding result is empty, non-finite, or wrong
  dimension.
- `RAG_CHAT_REQUEST_FAILED`: chat provider request failed or returned empty
  text.
- `RAG_EMBEDDING_INDEX_INCOMPATIBLE`: configured embedding identity is not the
  current indexed identity.

The ask route should continue to normalize recoverable model/runtime failures to
`AI_UNAVAILABLE` unless a more specific client-visible status is intentionally
chosen during implementation. Permission and not-found errors keep the current
404 behavior. Blank questions keep the current 400 behavior.

## Testing

Unit tests should stay hermetic and avoid real OpenAI, OpenAI-compatible, Ollama,
or Langfuse network calls.

Expected focused coverage:

- config defaults preserve the current Ollama behavior
- provider enum parsing rejects unsupported values
- blank env values fall back only where expected
- non-1024 embedding dimension fails fast
- Ollama chat and embedding factories receive model/base URL options
- official OpenAI factories use model and standard SDK credential behavior
- OpenAI-compatible factories set custom base URLs and provider tags
- embedding client validates array shape, finite values, and dimensions
- answer chain extracts non-empty string content and rejects empty output
- Langfuse disabled path returns no callbacks and does not throw
- Langfuse enabled path attaches callbacks and metadata without requiring
  network delivery in unit tests
- `askDocumentQuestion()` still ignores draft-like caller fields
- ask route maps provider-neutral runtime errors to the expected response

Existing retriever, prompt, vector-store, index-document, and route tests should
be updated only where imports move from `ollama.ts` to provider-neutral seams.

## Documentation and Operations

Update `.env.example`, `.env.docker.example`, Docker-related docs, and wiki pages
when implementation lands. This design commit records the planned architecture;
implementation commits should update operational examples with the exact final
environment variable names.

Operational guidance for provider changes:

- Treat embedding provider/model changes as an index compatibility event.
- Run or create an explicit reindex workflow before expecting full workspace
  retrieval under a new embedding identity.
- Keep production Langfuse capture metadata-focused unless a temporary,
  explicit debugging opt-in is approved.
- Keep Ollama host networking guidance from Issue #81 valid for local model
  deployments.

## Source Evidence

- GitHub issue #100
- `wiki/index.md`
- `wiki/Munjib.md`
- `wiki/Document Editing Workflow.md`
- `wiki/Production Observability Workflow.md`
- `docs/superpowers/specs/2026-05-30-document-ai-rag-assistant-design.md`
- `docs/superpowers/specs/2026-06-03-ollama-rag-model-server-setup-design.md`
- `lib/rag/ask.ts`
- `lib/rag/ollama.ts`
- `lib/rag/config.ts`
- `lib/rag/index-document.ts`
- `lib/rag/retriever.ts`
- `lib/rag/vector-store.ts`
- `lib/rag/prompt.ts`
- `app/api/workspaces/[workspaceSlug]/documents/[documentId]/ask/route.ts`
- `tests/rag/ask.test.ts`
- `tests/rag/ollama.test.ts`
- Langfuse LangChain integration documentation
- LangChain JavaScript ChatOllama documentation
- LangChain JavaScript OllamaEmbeddings documentation
- LangChain JavaScript ChatOpenAI documentation
- LangChain JavaScript OpenAIEmbeddings documentation
