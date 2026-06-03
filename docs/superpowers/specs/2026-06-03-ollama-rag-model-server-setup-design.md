# Ollama RAG Model Server Setup Design

## Context

Issue #81 configures the existing saved-content-only Ask AI workflow so it can
answer on the currently running Munjib server. The RAG implementation already
uses Ollama through `lib/rag/config.ts` and `lib/rag/ollama.ts`. Its defaults
are:

- `MUNJIB_OLLAMA_BASE_URL=http://localhost:11434`
- `MUNJIB_RAG_CHAT_MODEL=gemma4:e4b`
- `MUNJIB_RAG_EMBED_MODEL=bge-m3`
- `MUNJIB_RAG_EMBED_DIMENSIONS=1024`

The current production-style server is running in Docker on port 3000. In that
case, `localhost:11434` from inside the web container points at the web
container itself, not at a host-level Ollama process. Ask AI therefore needs both
the required local models and a container-reachable Ollama base URL.

## Goals

- Install or confirm Ollama on the server.
- Pull the exact chat model `gemma4:e4b`.
- Pull the embedding model `bge-m3`.
- Configure the running Docker web service to reach Ollama.
- Keep the existing Ask AI UI, route, prompt, retriever, and pgvector schema
  unchanged unless verification exposes a concrete defect.
- Verify that clicking Ask AI can produce a normal response path through the
  API.

## Non-Goals

- Do not redesign the Ask AI UI.
- Do not replace the RAG implementation.
- Do not change the embedding model or vector dimension.
- Do not add a new external vector database.
- Do not modify existing user changes in ask route tests unless verification
  proves they block the requested setup.

## Approach

Use host-level Ollama and connect the Docker web container to it through
`host.docker.internal`.

This is the smallest server-focused change. It avoids adding a large model
runtime service to `docker-compose.yml`, preserves the current production-style
web and database containers, and keeps model storage under the host Ollama
installation.

The expected server environment for the web service is:

```text
MUNJIB_OLLAMA_BASE_URL=http://host.docker.internal:11434
MUNJIB_RAG_CHAT_MODEL=gemma4:e4b
MUNJIB_RAG_EMBED_MODEL=bge-m3
MUNJIB_RAG_EMBED_DIMENSIONS=1024
```

If Docker cannot resolve `host.docker.internal` on this Linux host, add the
standard `host-gateway` mapping to the web service and restart it.

## Verification Plan

1. Confirm Ollama is reachable from the host with `/api/tags`.
2. Confirm `gemma4:e4b` and `bge-m3` are installed.
3. Confirm a direct Ollama chat request returns text for `gemma4:e4b`.
4. Confirm a direct Ollama embed request returns a 1024-dimensional vector for
   `bge-m3`.
5. Ensure pgvector HNSW index setup has run with `pnpm run db:rag:index`.
6. Restart the Docker web service with the Ollama RAG environment variables.
7. Confirm the web container can reach Ollama.
8. Confirm the Ask AI route returns a successful JSON answer for an accessible
   saved document, or verify the same path through the browser if API auth
   cookies are required.

## Error Handling

If Ollama installation or model pulls fail because the model tag is unavailable,
stop and report that the exact requested model name cannot be installed. Do not
substitute another model without user approval.

If the web container cannot reach host Ollama, add a Docker host-gateway mapping
and retest before changing application code.

If Ask AI fails after Ollama and container networking are healthy, inspect the
route error, existing staged ask route changes, and RAG indexing state before
editing source files.

## Source Evidence

- `wiki/index.md` AI/RAG implementation status
- `docs/superpowers/specs/2026-05-30-document-ai-rag-assistant-design.md`
- `lib/rag/config.ts`
- `lib/rag/ollama.ts`
- `docker-compose.yml`
- `docker-compose.dev.yml`
- GitHub issue #81
