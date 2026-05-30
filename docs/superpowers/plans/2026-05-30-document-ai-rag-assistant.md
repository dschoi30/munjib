# Document AI RAG Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a saved-content-only `AI에게 묻기` assistant that answers questions about the current document using pgvector-backed RAG over current, linked, backlink, same-tag, and workspace fallback chunks.

**Architecture:** Keep the first implementation inside the existing Next.js/Prisma monolith. Store document chunks and `bge-m3` embeddings in PostgreSQL pgvector, call Ollama through small wrappers, retrieve with graph-aware reranking, and expose a document ask route consumed by a small editor panel beside the title row.

**Tech Stack:** Next.js App Router route handlers, React 19 client components, Prisma/PostgreSQL, pgvector `vector(1024)`, Ollama `/api/embed` and `/api/chat`, Vitest, Testing Library, existing wiki sync tooling.

---

## File Structure

- Create `prisma/migrations/20260530023000_add_document_chunks_pgvector/migration.sql`: enable pgvector and add `DocumentChunk`.
- Create an idempotent HNSW cosine index setup helper outside Prisma migration history so `prisma migrate dev` does not propose dropping an unsupported vector index.
- Modify `prisma/schema.prisma`: add `Document.chunks` relation and `DocumentChunk` model with `Unsupported("vector(1024)")`.
- Modify `docker-compose.yml`: use a pgvector-enabled PostgreSQL 16 image.
- Modify `tests/docker/compose.test.ts`: assert the compose file uses the pgvector image.
- Create `lib/rag/config.ts`: read Ollama base URL and model names from env with defaults.
- Create `lib/rag/ollama.ts`: small fetch-based embedding and chat clients.
- Create `tests/rag/ollama.test.ts`: mock fetch and cover payloads/errors.
- Create `lib/rag/chunk-markdown.ts`: heading-aware Markdown chunking.
- Create `tests/rag/chunk-markdown.test.ts`: cover frontmatter stripping, headings, overlap, table/code boundaries.
- Create `lib/rag/vector-store.ts`: vector literal validation plus parameterized raw SQL insert/search wrappers.
- Create `tests/rag/vector-store.test.ts`: cover vector literal validation, `CAST($n AS vector(1024))`, static SQL, and stale chunk filtering query options.
- Create `lib/rag/index-document.ts`: convert saved documents to chunks, embed them, and replace current document chunks.
- Create `tests/rag/index-document.test.ts`: cover indexing, stale exclusion metadata, and failure-safe wrapper.
- Create `lib/rag/retriever.ts`: build graph-aware candidate scopes and rerank chunks.
- Create `tests/rag/retriever.test.ts`: cover current/wiki/backlink/tag/fallback scoring and readable-only scope.
- Create `lib/rag/prompt.ts`: build context prompt and citation metadata.
- Create `tests/rag/prompt.test.ts`: cover citation labels and insufficient-context prompt rule.
- Create `lib/rag/ask.ts`: saved-content-only ask service with permission checks.
- Create `app/api/workspaces/[workspaceSlug]/documents/[documentId]/ask/route.ts`: route handler wrapper around ask service.
- Create `tests/rag/ask.test.ts`: cover saved DB content, ignored draft payload fields, permissions, and Ollama failure.
- Create `components/document-editor/ai-assistant-panel.tsx`: client panel for question, loading, answer, citations, errors.
- Modify `components/document-editor.tsx`: put `AI에게 묻기` button to the right of title input and mount the panel.
- Modify `components/document-editor/types.ts`: pass `workspaceSlug` into `DocumentEditor`.
- Modify `app/workspaces/[workspaceSlug]/page.tsx`: pass `workspaceSlug`.
- Modify `tests/components/document-editor-preview.test.tsx`: cover button/panel/request body behavior.
- Modify saved-content mutation paths in `lib/documents/service.ts` and `lib/attachments/service.ts`: call safe index refresh after saved content changes.
- Modify wiki pages and log after implementation: `wiki/Document Knowledge Model.md`, `wiki/Document Editing Workflow.md`, `wiki/Next.js Prisma Monolith.md`, `wiki/Project PRD.md`, `wiki/index.md`, `wiki/log.md`, `wiki/manifest.json`.

## Review Follow-Up Requirements

- Use static raw SQL plus positional parameters for pgvector writes/searches. Do not concatenate document text, question text, or vector literal strings into SQL.
- Cast vector parameters with `CAST($n AS vector(1024))`. Do not rely on `$n::vector` in implementation code.
- Keep `bge-m3` and `vector(1024)` coupled in documentation. Changing the embedding model to a different dimension requires a DB migration and index rebuild.
- Keep retriever scoring constants named and tested.
- Show a visible saved-content-only/unsaved-changes note when title or markdown state differs from the selected saved document.
- Preserve the AGENTS PR workflow after implementation: install hooks, sync plan/check, manifest/lint, commit, push, PR, 5-minute review wait, review/CI recheck.

## Task 1: pgvector Schema And Docker Foundation

**Files:**
- Modify: `docker-compose.yml`
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260530023000_add_document_chunks_pgvector/migration.sql`
- Modify: `tests/docker/compose.test.ts`

- [ ] **Step 1: Write the failing Docker image test**

Add this test to `tests/docker/compose.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("docker compose", () => {
  it("uses a pgvector-enabled postgres image", () => {
    const compose = readFileSync(join(process.cwd(), "docker-compose.yml"), "utf8");

    expect(compose).toContain("pgvector/pgvector:0.8.2-pg16");
  });
});
```

- [ ] **Step 2: Run the failing test**

Run: `pnpm exec vitest run tests/docker/compose.test.ts -t "pgvector-enabled postgres image"`

Expected: FAIL because `docker-compose.yml` still uses `postgres:16-alpine`.

- [ ] **Step 3: Switch the Postgres image**

In `docker-compose.yml`, replace:

```yaml
    image: postgres:16-alpine
```

with:

```yaml
    image: pgvector/pgvector:0.8.2-pg16
```

- [ ] **Step 4: Add the Prisma model**

In `prisma/schema.prisma`, add this relation inside `model Document`:

```prisma
  chunks          DocumentChunk[]
```

Add this model after `DocumentVersion`:

```prisma
model DocumentChunk {
  id              String   @id @default(cuid())
  workspaceId     String
  documentId      String
  chunkIndex      Int
  headingPath     String?
  content         String
  contentHash     String
  sourceUpdatedAt DateTime
  tokenCount      Int
  embeddingModel  String
  embedding       Unsupported("vector(1024)")
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  document        Document @relation(fields: [documentId], references: [id], onDelete: Cascade)

  @@unique([documentId, embeddingModel, chunkIndex])
  @@index([workspaceId, embeddingModel])
  @@index([documentId])
}
```

- [ ] **Step 5: Add the SQL migration**

Create `prisma/migrations/20260530023000_add_document_chunks_pgvector/migration.sql`:

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE "DocumentChunk" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "headingPath" TEXT,
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "sourceUpdatedAt" TIMESTAMP(3) NOT NULL,
    "tokenCount" INTEGER NOT NULL,
    "embeddingModel" TEXT NOT NULL,
    "embedding" vector(1024) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentChunk_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DocumentChunk_documentId_embeddingModel_chunkIndex_key"
ON "DocumentChunk"("documentId", "embeddingModel", "chunkIndex");

CREATE INDEX "DocumentChunk_workspaceId_embeddingModel_idx"
ON "DocumentChunk"("workspaceId", "embeddingModel");

CREATE INDEX "DocumentChunk_documentId_idx"
ON "DocumentChunk"("documentId");

ALTER TABLE "DocumentChunk"
ADD CONSTRAINT "DocumentChunk_documentId_fkey"
FOREIGN KEY ("documentId") REFERENCES "Document"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
```

Create the HNSW cosine index outside Prisma migration history with
`lib/rag/vector-index.ts` / `pnpm run db:rag:index`:

```sql
CREATE INDEX IF NOT EXISTS "DocumentChunk_embedding_hnsw_idx"
ON "DocumentChunk"
USING hnsw ("embedding" vector_cosine_ops);
```

- [ ] **Step 6: Run schema tests and generate Prisma**

Run: `pnpm exec vitest run tests/docker/compose.test.ts`

Expected: PASS.

Run: `pnpm exec prisma generate`

Expected: Prisma client generation succeeds with `Unsupported("vector(1024)")`.

- [ ] **Step 7: Commit**

```bash
git add docker-compose.yml prisma/schema.prisma prisma/migrations/20260530023000_add_document_chunks_pgvector/migration.sql tests/docker/compose.test.ts
git commit -m "feat: add pgvector document chunk schema"
```

## Task 2: Ollama Configuration And Client

**Files:**
- Create: `lib/rag/config.ts`
- Create: `lib/rag/ollama.ts`
- Create: `tests/rag/ollama.test.ts`

- [ ] **Step 1: Write failing Ollama client tests**

Create `tests/rag/ollama.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { embedText, chatWithContext } from "@/lib/rag/ollama";
import { getRagConfig } from "@/lib/rag/config";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("RAG Ollama client", () => {
  it("uses default model configuration", () => {
    expect(getRagConfig()).toEqual({
      ollamaBaseUrl: "http://localhost:11434",
      chatModel: "gemma4:e4b",
      embedModel: "bge-m3",
      embedDimensions: 1024,
    });
  });

  it("posts embedding requests to Ollama", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ embeddings: [[0.1, 0.2, 0.3]] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(embedText("hello")).resolves.toEqual([0.1, 0.2, 0.3]);
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:11434/api/embed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "bge-m3", input: "hello" }),
    });
  });

  it("posts chat requests to Ollama", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: { content: "answer" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(chatWithContext("system", "question")).resolves.toBe("answer");
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:11434/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gemma4:e4b",
        stream: false,
        messages: [
          { role: "system", content: "system" },
          { role: "user", content: "question" },
        ],
      }),
    });
  });

  it("throws a recoverable error when Ollama returns a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "model error",
    }));

    await expect(embedText("hello")).rejects.toThrow("OLLAMA_REQUEST_FAILED");
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run: `pnpm exec vitest run tests/rag/ollama.test.ts`

Expected: FAIL because `lib/rag/config.ts` and `lib/rag/ollama.ts` do not exist.

- [ ] **Step 3: Implement config**

Create `lib/rag/config.ts`:

```ts
export type RagConfig = {
  ollamaBaseUrl: string;
  chatModel: string;
  embedModel: string;
  embedDimensions: number;
};

export function getRagConfig(): RagConfig {
  return {
    ollamaBaseUrl: process.env.MUNJIB_OLLAMA_BASE_URL ?? "http://localhost:11434",
    chatModel: process.env.MUNJIB_RAG_CHAT_MODEL ?? "gemma4:e4b",
    embedModel: process.env.MUNJIB_RAG_EMBED_MODEL ?? "bge-m3",
    embedDimensions: Number(process.env.MUNJIB_RAG_EMBED_DIMENSIONS ?? 1024),
  };
}
```

- [ ] **Step 4: Implement Ollama client**

Create `lib/rag/ollama.ts`:

```ts
import { getRagConfig } from "@/lib/rag/config";

export const RAG_ERROR_CODES = {
  OLLAMA_REQUEST_FAILED: "OLLAMA_REQUEST_FAILED",
  OLLAMA_EMPTY_EMBEDDING: "OLLAMA_EMPTY_EMBEDDING",
  OLLAMA_EMPTY_CHAT_RESPONSE: "OLLAMA_EMPTY_CHAT_RESPONSE",
} as const;

async function postOllama<T>(path: string, body: unknown): Promise<T> {
  const config = getRagConfig();
  const response = await fetch(`${config.ollamaBaseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(RAG_ERROR_CODES.OLLAMA_REQUEST_FAILED);
  }

  return response.json() as Promise<T>;
}

export async function embedText(text: string): Promise<number[]> {
  const config = getRagConfig();
  const result = await postOllama<{ embeddings?: number[][] }>("/api/embed", {
    model: config.embedModel,
    input: text,
  });
  const embedding = result.embeddings?.[0];
  if (!embedding || embedding.length === 0) {
    throw new Error(RAG_ERROR_CODES.OLLAMA_EMPTY_EMBEDDING);
  }
  return embedding;
}

export async function chatWithContext(systemPrompt: string, userPrompt: string): Promise<string> {
  const config = getRagConfig();
  const result = await postOllama<{ message?: { content?: string } }>("/api/chat", {
    model: config.chatModel,
    stream: false,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });
  const content = result.message?.content?.trim();
  if (!content) {
    throw new Error(RAG_ERROR_CODES.OLLAMA_EMPTY_CHAT_RESPONSE);
  }
  return content;
}
```

- [ ] **Step 5: Run tests**

Run: `pnpm exec vitest run tests/rag/ollama.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/rag/config.ts lib/rag/ollama.ts tests/rag/ollama.test.ts
git commit -m "feat: add ollama rag client"
```

## Task 3: Markdown-Aware Chunking

**Files:**
- Create: `lib/rag/chunk-markdown.ts`
- Create: `tests/rag/chunk-markdown.test.ts`

- [ ] **Step 1: Write failing chunking tests**

Create `tests/rag/chunk-markdown.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { chunkMarkdownDocument } from "@/lib/rag/chunk-markdown";

describe("chunkMarkdownDocument", () => {
  it("strips frontmatter and keeps heading paths", () => {
    const chunks = chunkMarkdownDocument({
      documentTitle: "Runbook",
      contentMarkdown: "---\ntags:\n  - ops\n---\n\n# Intro\n\nHello\n\n## Steps\n\nDo work",
      maxTokens: 40,
      overlapTokens: 8,
    });

    expect(chunks).toEqual([
      expect.objectContaining({
        chunkIndex: 0,
        headingPath: "Intro",
        content: "# Intro\n\nHello",
      }),
      expect.objectContaining({
        chunkIndex: 1,
        headingPath: "Intro > Steps",
        content: "## Steps\n\nDo work",
      }),
    ]);
    expect(chunks[0]?.content).not.toContain("tags:");
  });

  it("does not split inside fenced code blocks or markdown tables", () => {
    const markdown = [
      "# Reference",
      "",
      "| Key | Value |",
      "| --- | --- |",
      "| A | B |",
      "",
      "```ts",
      "const value = true;",
      "```",
    ].join("\n");

    const chunks = chunkMarkdownDocument({
      documentTitle: "Reference",
      contentMarkdown: markdown,
      maxTokens: 18,
      overlapTokens: 4,
    });

    expect(chunks.map((chunk) => chunk.content).join("\n\n")).toContain("| A | B |");
    expect(chunks.map((chunk) => chunk.content).join("\n\n")).toContain("const value = true;");
  });

  it("splits long sections with overlap", () => {
    const chunks = chunkMarkdownDocument({
      documentTitle: "Long",
      contentMarkdown: `# Long\n\n${Array.from({ length: 80 }, (_, index) => `word${index}`).join(" ")}`,
      maxTokens: 30,
      overlapTokens: 5,
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[1]?.content).toContain("word25");
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run: `pnpm exec vitest run tests/rag/chunk-markdown.test.ts`

Expected: FAIL because `chunkMarkdownDocument` does not exist.

- [ ] **Step 3: Implement chunking**

Create `lib/rag/chunk-markdown.ts`:

```ts
import { createHash } from "node:crypto";
import { stripDocumentFrontmatter } from "@/lib/document-metadata/parser";

export type RagChunk = {
  chunkIndex: number;
  headingPath: string | null;
  content: string;
  contentHash: string;
  tokenCount: number;
};

type ChunkInput = {
  documentTitle: string;
  contentMarkdown: string;
  maxTokens?: number;
  overlapTokens?: number;
};

type Section = {
  headingPath: string | null;
  lines: string[];
};

export function chunkMarkdownDocument(input: ChunkInput): RagChunk[] {
  const maxTokens = input.maxTokens ?? 1000;
  const overlapTokens = input.overlapTokens ?? 120;
  const body = stripDocumentFrontmatter(input.contentMarkdown).trim();
  if (!body) return [];

  const chunks: RagChunk[] = [];
  for (const section of splitIntoSections(body)) {
    for (const content of splitSection(section.lines.join("\n").trim(), maxTokens, overlapTokens)) {
      if (!content) continue;
      chunks.push({
        chunkIndex: chunks.length,
        headingPath: section.headingPath,
        content,
        contentHash: hashContent(content),
        tokenCount: estimateTokens(content),
      });
    }
  }
  return chunks;
}

function splitIntoSections(markdown: string): Section[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const sections: Section[] = [];
  const headingStack: Array<{ level: number; text: string }> = [];
  let current: Section | null = null;
  let inFence = false;

  const pushCurrent = () => {
    if (current && current.lines.join("\n").trim()) {
      sections.push(current);
    }
  };

  for (const line of lines) {
    if (/^(```|~~~)/.test(line.trim())) {
      inFence = !inFence;
    }

    const heading = !inFence ? line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/) : null;
    if (heading) {
      pushCurrent();
      const level = heading[1].length;
      const text = heading[2].trim();
      while (headingStack.length > 0 && headingStack[headingStack.length - 1]!.level >= level) {
        headingStack.pop();
      }
      headingStack.push({ level, text });
      current = { headingPath: headingStack.map((item) => item.text).join(" > "), lines: [line] };
      continue;
    }

    if (!current) {
      current = { headingPath: null, lines: [] };
    }
    current.lines.push(line);
  }

  pushCurrent();
  return sections;
}

function splitSection(section: string, maxTokens: number, overlapTokens: number): string[] {
  const tokens = tokenize(section);
  if (tokens.length <= maxTokens) return [section];

  const chunks: string[] = [];
  let start = 0;
  while (start < tokens.length) {
    const end = Math.min(tokens.length, start + maxTokens);
    chunks.push(tokens.slice(start, end).join(" "));
    if (end === tokens.length) break;
    start = Math.max(0, end - overlapTokens);
  }
  return chunks;
}

function tokenize(value: string) {
  return value.split(/\s+/).filter(Boolean);
}

function estimateTokens(value: string) {
  return tokenize(value).length;
}

function hashContent(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
```

- [ ] **Step 4: Run chunking tests**

Run: `pnpm exec vitest run tests/rag/chunk-markdown.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/rag/chunk-markdown.ts tests/rag/chunk-markdown.test.ts
git commit -m "feat: chunk markdown for rag"
```

## Task 4: pgvector Store Helpers

**Files:**
- Create: `lib/rag/vector-store.ts`
- Create: `tests/rag/vector-store.test.ts`

- [ ] **Step 1: Write failing vector-store tests**

Create `tests/rag/vector-store.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  toPgVectorLiteral,
  buildVectorInsertSql,
  buildVectorSearchSql,
} from "@/lib/rag/vector-store";

describe("vector store helpers", () => {
  it("serializes numeric embeddings as pgvector literals", () => {
    expect(toPgVectorLiteral([0.1, -0.2, 0])).toBe("[0.1,-0.2,0]");
  });

  it("rejects non-finite embeddings", () => {
    expect(() => toPgVectorLiteral([Number.NaN])).toThrow("INVALID_EMBEDDING_VECTOR");
  });

  it("rejects infinite embeddings before raw SQL execution", () => {
    expect(() => toPgVectorLiteral([Number.POSITIVE_INFINITY])).toThrow("INVALID_EMBEDDING_VECTOR");
  });

  it("casts vector parameters with CAST syntax in static SQL", () => {
    expect(buildVectorInsertSql()).toContain("CAST($11 AS vector(1024))");
    expect(buildVectorInsertSql()).not.toContain("$11::vector");
    expect(buildVectorSearchSql()).toContain("CAST($1 AS vector(1024))");
    expect(buildVectorSearchSql()).not.toContain("$1::vector");
  });

  it("builds a stale-safe vector search query", () => {
    expect(buildVectorSearchSql()).toContain('"DocumentChunk"."sourceUpdatedAt" = "Document"."updatedAt"');
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run: `pnpm exec vitest run tests/rag/vector-store.test.ts`

Expected: FAIL because `vector-store.ts` does not exist.

- [ ] **Step 3: Implement vector helpers**

Create `lib/rag/vector-store.ts`:

```ts
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";

export type VectorChunkInput = {
  id: string;
  workspaceId: string;
  documentId: string;
  chunkIndex: number;
  headingPath: string | null;
  content: string;
  contentHash: string;
  sourceUpdatedAt: Date;
  tokenCount: number;
  embeddingModel: string;
  embedding: number[];
};

export type RetrievedChunk = {
  id: string;
  documentId: string;
  documentTitle: string;
  documentPath: string;
  headingPath: string | null;
  content: string;
  distance: number;
};

export function toPgVectorLiteral(embedding: number[]) {
  if (embedding.length === 0 || embedding.some((value) => !Number.isFinite(value))) {
    throw new Error("INVALID_EMBEDDING_VECTOR");
  }
  return `[${embedding.join(",")}]`;
}

export function buildVectorSearchSql() {
  return `
SELECT
  "DocumentChunk"."id",
  "DocumentChunk"."documentId",
  "Document"."title" AS "documentTitle",
  "Document"."path" AS "documentPath",
  "DocumentChunk"."headingPath",
  "DocumentChunk"."content",
  "DocumentChunk"."embedding" <=> CAST($1 AS vector(1024)) AS "distance"
FROM "DocumentChunk"
JOIN "Document" ON "Document"."id" = "DocumentChunk"."documentId"
WHERE "DocumentChunk"."workspaceId" = $2
  AND "DocumentChunk"."embeddingModel" = $3
  AND "DocumentChunk"."sourceUpdatedAt" = "Document"."updatedAt"
  AND "DocumentChunk"."documentId" = ANY($4)
ORDER BY "DocumentChunk"."embedding" <=> CAST($1 AS vector(1024))
LIMIT $5
`;
}

export function buildVectorInsertSql() {
  return `INSERT INTO "DocumentChunk"
      ("id", "workspaceId", "documentId", "chunkIndex", "headingPath", "content", "contentHash", "sourceUpdatedAt", "tokenCount", "embeddingModel", "embedding", "updatedAt")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CAST($11 AS vector(1024)), CURRENT_TIMESTAMP)`;
}

export async function replaceDocumentChunks(
  tx: Prisma.TransactionClient,
  input: { documentId: string; embeddingModel: string; chunks: VectorChunkInput[] },
) {
  await tx.documentChunk.deleteMany({
    where: { documentId: input.documentId, embeddingModel: input.embeddingModel },
  });

  for (const chunk of input.chunks) {
    await tx.$executeRawUnsafe(
      buildVectorInsertSql(),
      chunk.id,
      chunk.workspaceId,
      chunk.documentId,
      chunk.chunkIndex,
      chunk.headingPath,
      chunk.content,
      chunk.contentHash,
      chunk.sourceUpdatedAt,
      chunk.tokenCount,
      chunk.embeddingModel,
      toPgVectorLiteral(chunk.embedding),
    );
  }
}

export async function searchSimilarChunks(input: {
  workspaceId: string;
  embeddingModel: string;
  embedding: number[];
  readableDocumentIds: string[];
  limit: number;
}) {
  if (input.readableDocumentIds.length === 0) return [];
  return prisma.$queryRawUnsafe<RetrievedChunk[]>(
    buildVectorSearchSql(),
    toPgVectorLiteral(input.embedding),
    input.workspaceId,
    input.embeddingModel,
    input.readableDocumentIds,
    input.limit,
  );
}
```

- [ ] **Step 4: Run vector-store tests**

Run: `pnpm exec vitest run tests/rag/vector-store.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/rag/vector-store.ts tests/rag/vector-store.test.ts
git commit -m "feat: add rag vector store helpers"
```

## Task 5: Saved Document Indexing Lifecycle

**Files:**
- Create: `lib/rag/index-document.ts`
- Create: `tests/rag/index-document.test.ts`
- Modify: `lib/documents/service.ts`
- Modify: `lib/attachments/service.ts`
- Test: `tests/documents/service.test.ts`
- Test: `tests/attachments/service.test.ts`

- [ ] **Step 1: Write failing index-document tests**

Create `tests/rag/index-document.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { indexSavedDocument, safeIndexSavedDocument } from "@/lib/rag/index-document";

describe("document RAG indexing", () => {
  it("embeds saved chunks and writes them to the vector store", async () => {
    const replaceDocumentChunks = vi.fn().mockResolvedValue(undefined);
    const embedText = vi.fn().mockResolvedValue(Array.from({ length: 1024 }, () => 0.01));
    const document = {
      id: "doc-1",
      workspaceId: "workspace-1",
      title: "Runbook",
      contentMarkdown: "# Runbook\n\nSaved content",
      updatedAt: new Date("2026-05-30T00:00:00.000Z"),
    };

    await indexSavedDocument({
      document,
      embeddingModel: "bge-m3",
      embedText,
      replaceDocumentChunks,
    });

    expect(embedText).toHaveBeenCalledWith("# Runbook\n\nSaved content");
    expect(replaceDocumentChunks).toHaveBeenCalledWith(expect.objectContaining({
      documentId: "doc-1",
      embeddingModel: "bge-m3",
      chunks: [
        expect.objectContaining({
          workspaceId: "workspace-1",
          documentId: "doc-1",
          sourceUpdatedAt: document.updatedAt,
          embeddingModel: "bge-m3",
        }),
      ],
    }));
  });

  it("does not throw from the safe wrapper", async () => {
    const logger = vi.fn();
    await expect(
      safeIndexSavedDocument({
        documentId: "doc-1",
        loadDocument: async () => {
          throw new Error("OLLAMA_REQUEST_FAILED");
        },
        logger,
      }),
    ).resolves.toBe(false);
    expect(logger).toHaveBeenCalledWith("doc-1", expect.any(Error));
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run: `pnpm exec vitest run tests/rag/index-document.test.ts`

Expected: FAIL because `index-document.ts` does not exist.

- [ ] **Step 3: Implement indexing**

Create `lib/rag/index-document.ts`:

```ts
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/client";
import { getRagConfig } from "@/lib/rag/config";
import { embedText as defaultEmbedText } from "@/lib/rag/ollama";
import { chunkMarkdownDocument } from "@/lib/rag/chunk-markdown";
import { replaceDocumentChunks as defaultReplaceDocumentChunks } from "@/lib/rag/vector-store";

type SavedDocumentForIndex = {
  id: string;
  workspaceId: string;
  title: string;
  contentMarkdown: string;
  updatedAt: Date;
};

type IndexInput = {
  document: SavedDocumentForIndex;
  embeddingModel?: string;
  embedText?: (text: string) => Promise<number[]>;
  replaceDocumentChunks?: (input: {
    documentId: string;
    embeddingModel: string;
    chunks: Array<{
      id: string;
      workspaceId: string;
      documentId: string;
      chunkIndex: number;
      headingPath: string | null;
      content: string;
      contentHash: string;
      sourceUpdatedAt: Date;
      tokenCount: number;
      embeddingModel: string;
      embedding: number[];
    }>;
  }) => Promise<void>;
};

export async function indexSavedDocument(input: IndexInput) {
  const embeddingModel = input.embeddingModel ?? getRagConfig().embedModel;
  const embedText = input.embedText ?? defaultEmbedText;
  const replaceDocumentChunks = input.replaceDocumentChunks ?? (async (payload) => {
    await prisma.$transaction((tx) => defaultReplaceDocumentChunks(tx, payload));
  });
  const chunks = chunkMarkdownDocument({
    documentTitle: input.document.title,
    contentMarkdown: input.document.contentMarkdown,
  });

  const embeddedChunks = [];
  for (const chunk of chunks) {
    embeddedChunks.push({
      id: randomUUID(),
      workspaceId: input.document.workspaceId,
      documentId: input.document.id,
      chunkIndex: chunk.chunkIndex,
      headingPath: chunk.headingPath,
      content: chunk.content,
      contentHash: chunk.contentHash,
      sourceUpdatedAt: input.document.updatedAt,
      tokenCount: chunk.tokenCount,
      embeddingModel,
      embedding: await embedText(chunk.content),
    });
  }

  await replaceDocumentChunks({
    documentId: input.document.id,
    embeddingModel,
    chunks: embeddedChunks,
  });
}

export async function safeIndexSavedDocument(input: {
  documentId: string;
  loadDocument?: (documentId: string) => Promise<SavedDocumentForIndex | null>;
  logger?: (documentId: string, error: unknown) => void;
}) {
  try {
    const document = input.loadDocument
      ? await input.loadDocument(input.documentId)
      : await prisma.document.findUnique({
          where: { id: input.documentId },
          select: {
            id: true,
            workspaceId: true,
            title: true,
            contentMarkdown: true,
            updatedAt: true,
          },
        });

    if (!document) return false;
    await indexSavedDocument({ document });
    return true;
  } catch (error) {
    input.logger?.(input.documentId, error);
    return false;
  }
}
```

- [ ] **Step 4: Run index tests**

Run: `pnpm exec vitest run tests/rag/index-document.test.ts`

Expected: PASS.

- [ ] **Step 5: Add service integration tests**

In `tests/documents/service.test.ts`, mock the indexer at the top:

```ts
import { vi } from "vitest";

vi.mock("@/lib/rag/index-document", () => ({
  safeIndexSavedDocument: vi.fn().mockResolvedValue(true),
}));
```

Import the mock:

```ts
import { safeIndexSavedDocument } from "@/lib/rag/index-document";
```

Add this assertion to the create/update/restore tests after the service call:

```ts
expect(safeIndexSavedDocument).toHaveBeenCalledWith(
  expect.objectContaining({ documentId: document.id }),
);
```

- [ ] **Step 6: Wire indexing after saved document mutations**

In `lib/documents/service.ts`, import:

```ts
import { safeIndexSavedDocument } from "@/lib/rag/index-document";
```

For `createDocument`, `updateDocument`, `restoreDocumentVersion`, and `createDocumentFromBrokenLink`, store the transaction result in a variable, then call the safe indexer after the transaction:

```ts
const created = await runWithDocumentSlugRetry(() => prisma.$transaction(async (tx) => {
  // existing transaction body
}));
await safeIndexSavedDocument({ documentId: created.id, logger: logRagIndexFailure });
return created;
```

Add this helper in the same file:

```ts
function logRagIndexFailure(documentId: string, error: unknown) {
  console.error("Failed to refresh RAG index", { documentId, error });
}
```

- [ ] **Step 7: Wire attachment upload indexing**

In `lib/attachments/service.ts`, import `safeIndexSavedDocument` and call it after the upload service successfully appends markdown and commits. Use the returned updated document id:

```ts
await safeIndexSavedDocument({ documentId: updated.id, logger: logAttachmentRagIndexFailure });
```

Add:

```ts
function logAttachmentRagIndexFailure(documentId: string, error: unknown) {
  console.error("Failed to refresh attachment RAG index", { documentId, error });
}
```

- [ ] **Step 8: Run focused service tests**

Run: `pnpm exec vitest run tests/rag/index-document.test.ts tests/documents/service.test.ts tests/attachments/service.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add lib/rag/index-document.ts tests/rag/index-document.test.ts lib/documents/service.ts lib/attachments/service.ts tests/documents/service.test.ts tests/attachments/service.test.ts
git commit -m "feat: refresh rag chunks after document saves"
```

## Task 6: Graph-Aware Retriever

**Files:**
- Create: `lib/rag/retriever.ts`
- Create: `tests/rag/retriever.test.ts`

- [ ] **Step 1: Write failing retriever tests**

Create `tests/rag/retriever.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  RETRIEVAL_SCORE_WEIGHTS,
  buildRetrievalScopes,
  rerankRetrievedChunks,
} from "@/lib/rag/retriever";

const documents = [
  { id: "current", title: "Current", path: "/current", contentMarkdown: "See [[Linked]] #ops" },
  { id: "linked", title: "Linked", path: "/linked", contentMarkdown: "" },
  { id: "backlink", title: "Backlink", path: "/backlink", contentMarkdown: "[[Current]]" },
  { id: "tagged", title: "Tagged", path: "/tagged", contentMarkdown: "#ops" },
  { id: "fallback", title: "Fallback", path: "/fallback", contentMarkdown: "" },
];

describe("RAG retriever", () => {
  it("builds current, wiki, backlink, tag, and fallback scopes", () => {
    const scopes = buildRetrievalScopes({
      selectedDocumentId: "current",
      readableDocuments: documents,
      persistedLinks: [
        {
          sourceDocumentId: "backlink",
          targetDocumentId: "current",
          targetTitleRaw: "Current",
          isBroken: false,
          isAmbiguous: false,
        },
      ],
    });

    expect(scopes.currentDocumentIds).toEqual(["current"]);
    expect(scopes.linkedDocumentIds).toContain("linked");
    expect(scopes.backlinkDocumentIds).toContain("backlink");
    expect(scopes.sameTagDocumentIds).toContain("tagged");
    expect(scopes.fallbackDocumentIds).toContain("fallback");
  });

  it("reranks with current document and graph boosts", () => {
    const ranked = rerankRetrievedChunks({
      chunks: [
        { id: "fallback", documentId: "fallback", distance: 0.1, content: "alpha" },
        { id: "current", documentId: "current", distance: 0.3, content: "alpha" },
        { id: "linked", documentId: "linked", distance: 0.25, content: "alpha" },
      ],
      scopes: {
        currentDocumentIds: ["current"],
        linkedDocumentIds: ["linked"],
        backlinkDocumentIds: [],
        sameTagDocumentIds: [],
        fallbackDocumentIds: ["fallback"],
      },
      query: "alpha",
      limit: 2,
    });

    expect(ranked.map((chunk) => chunk.id)).toEqual(["current", "linked"]);
  });

  it("exposes explicit scoring weights for tuning", () => {
    expect(RETRIEVAL_SCORE_WEIGHTS).toEqual({
      currentDocument: 0.5,
      linkedDocument: 0.3,
      backlinkDocument: 0.25,
      sameTagDocument: 0.15,
      keywordPerTerm: 0.05,
      keywordMaximum: 0.2,
    });
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run: `pnpm exec vitest run tests/rag/retriever.test.ts`

Expected: FAIL because `retriever.ts` does not exist.

- [ ] **Step 3: Implement scope and rerank helpers**

Create `lib/rag/retriever.ts`:

```ts
import { normalizeTag, parseDocumentMetadata } from "@/lib/document-metadata/parser";
import { parseWikiLinks } from "@/lib/wiki-links/parser";
import { resolveWikiLinkTarget } from "@/lib/wiki-links/resolve";

type ReadableDocument = {
  id: string;
  title: string;
  path: string;
  contentMarkdown: string;
};

type PersistedLink = {
  sourceDocumentId: string;
  targetDocumentId: string | null;
  targetTitleRaw: string;
  isBroken: boolean;
  isAmbiguous: boolean;
};

export type RetrievalScopes = {
  currentDocumentIds: string[];
  linkedDocumentIds: string[];
  backlinkDocumentIds: string[];
  sameTagDocumentIds: string[];
  fallbackDocumentIds: string[];
};

export type RerankChunk = {
  id: string;
  documentId: string;
  distance: number;
  content: string;
};

export const RETRIEVAL_SCORE_WEIGHTS = {
  currentDocument: 0.5,
  linkedDocument: 0.3,
  backlinkDocument: 0.25,
  sameTagDocument: 0.15,
  keywordPerTerm: 0.05,
  keywordMaximum: 0.2,
} as const;

// Weighted score:
// (1 - cosine distance) + scope boost + bounded keyword overlap boost.
// Keep the constants exported so retrieval tuning is visible in tests.

export function buildRetrievalScopes(input: {
  selectedDocumentId: string;
  readableDocuments: ReadableDocument[];
  persistedLinks: PersistedLink[];
}): RetrievalScopes {
  const selected = input.readableDocuments.find((document) => document.id === input.selectedDocumentId);
  if (!selected) {
    return {
      currentDocumentIds: [],
      linkedDocumentIds: [],
      backlinkDocumentIds: [],
      sameTagDocumentIds: [],
      fallbackDocumentIds: input.readableDocuments.map((document) => document.id),
    };
  }

  const candidates = input.readableDocuments.map((document) => ({
    id: document.id,
    title: document.title,
    path: document.path,
  }));
  const linked = new Set<string>();
  for (const link of parseWikiLinks(selected.contentMarkdown)) {
    const resolved = resolveWikiLinkTarget(candidates, link.targetTitleRaw);
    if (resolved.targetDocumentId) linked.add(resolved.targetDocumentId);
  }
  for (const link of input.persistedLinks) {
    if (link.sourceDocumentId === selected.id && link.targetDocumentId) {
      linked.add(link.targetDocumentId);
    }
  }

  const backlinks = new Set(
    input.persistedLinks
      .filter((link) => link.targetDocumentId === selected.id)
      .map((link) => link.sourceDocumentId),
  );
  const selectedTags = new Set(parseDocumentMetadata(selected.contentMarkdown).tags.map(normalizeTag));
  const sameTags = new Set<string>();
  for (const document of input.readableDocuments) {
    if (document.id === selected.id) continue;
    const tags = parseDocumentMetadata(document.contentMarkdown).tags.map(normalizeTag);
    if (tags.some((tag) => selectedTags.has(tag))) sameTags.add(document.id);
  }

  const prioritized = new Set([selected.id, ...linked, ...backlinks, ...sameTags]);
  return {
    currentDocumentIds: [selected.id],
    linkedDocumentIds: Array.from(linked),
    backlinkDocumentIds: Array.from(backlinks),
    sameTagDocumentIds: Array.from(sameTags),
    fallbackDocumentIds: input.readableDocuments
      .filter((document) => !prioritized.has(document.id))
      .map((document) => document.id),
  };
}

export function rerankRetrievedChunks(input: {
  chunks: RerankChunk[];
  scopes: RetrievalScopes;
  query: string;
  limit: number;
}) {
  const queryTerms = new Set(input.query.toLowerCase().split(/\s+/).filter(Boolean));
  return [...input.chunks]
    .map((chunk) => ({
      ...chunk,
      score: similarityScore(chunk.distance)
        + scopeBoost(chunk.documentId, input.scopes)
        + keywordBoost(chunk.content, queryTerms),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, input.limit);
}

function similarityScore(distance: number) {
  return 1 - distance;
}

function scopeBoost(documentId: string, scopes: RetrievalScopes) {
  if (scopes.currentDocumentIds.includes(documentId)) return RETRIEVAL_SCORE_WEIGHTS.currentDocument;
  if (scopes.linkedDocumentIds.includes(documentId)) return RETRIEVAL_SCORE_WEIGHTS.linkedDocument;
  if (scopes.backlinkDocumentIds.includes(documentId)) return RETRIEVAL_SCORE_WEIGHTS.backlinkDocument;
  if (scopes.sameTagDocumentIds.includes(documentId)) return RETRIEVAL_SCORE_WEIGHTS.sameTagDocument;
  return 0;
}

function keywordBoost(content: string, queryTerms: Set<string>) {
  if (queryTerms.size === 0) return 0;
  const contentLower = content.toLowerCase();
  let matches = 0;
  for (const term of queryTerms) {
    if (contentLower.includes(term)) matches += 1;
  }
  return Math.min(
    RETRIEVAL_SCORE_WEIGHTS.keywordMaximum,
    matches * RETRIEVAL_SCORE_WEIGHTS.keywordPerTerm,
  );
}
```

- [ ] **Step 4: Run retriever tests**

Run: `pnpm exec vitest run tests/rag/retriever.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/rag/retriever.ts tests/rag/retriever.test.ts
git commit -m "feat: add graph aware rag retriever"
```

## Task 7: Prompt Builder And Ask Service

**Files:**
- Create: `lib/rag/prompt.ts`
- Create: `lib/rag/ask.ts`
- Create: `app/api/workspaces/[workspaceSlug]/documents/[documentId]/ask/route.ts`
- Create: `tests/rag/prompt.test.ts`
- Create: `tests/rag/ask.test.ts`

- [ ] **Step 1: Write failing prompt tests**

Create `tests/rag/prompt.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildRagPrompt } from "@/lib/rag/prompt";

describe("buildRagPrompt", () => {
  it("includes citation metadata and saved-content-only instruction", () => {
    const prompt = buildRagPrompt({
      question: "What is the policy?",
      chunks: [{
        id: "chunk-1",
        documentId: "doc-1",
        documentTitle: "Policy",
        documentPath: "/policy",
        headingPath: "Security",
        content: "Rotate keys every quarter.",
      }],
    });

    expect(prompt.system).toContain("Use only the saved document context");
    expect(prompt.user).toContain("[1] Policy > Security");
    expect(prompt.citations).toEqual([
      {
        index: 1,
        documentId: "doc-1",
        documentTitle: "Policy",
        documentPath: "/policy",
        headingPath: "Security",
      },
    ]);
  });
});
```

- [ ] **Step 2: Implement prompt builder**

Create `lib/rag/prompt.ts`:

```ts
export type PromptChunk = {
  id: string;
  documentId: string;
  documentTitle: string;
  documentPath: string;
  headingPath: string | null;
  content: string;
};

export type RagCitation = {
  index: number;
  documentId: string;
  documentTitle: string;
  documentPath: string;
  headingPath: string | null;
};

export function buildRagPrompt(input: { question: string; chunks: PromptChunk[] }) {
  const citations: RagCitation[] = input.chunks.map((chunk, index) => ({
    index: index + 1,
    documentId: chunk.documentId,
    documentTitle: chunk.documentTitle,
    documentPath: chunk.documentPath,
    headingPath: chunk.headingPath,
  }));
  const context = input.chunks.map((chunk, index) => {
    const label = [chunk.documentTitle, chunk.headingPath].filter(Boolean).join(" > ");
    return `[${index + 1}] ${label}\n${chunk.content}`;
  }).join("\n\n");

  return {
    system: [
      "Use only the saved document context provided by Munjib.",
      "Do not use unsaved editor drafts or outside knowledge.",
      "If the context is insufficient, say that the saved documents do not contain enough evidence.",
      "Answer in the same language as the user's question when possible.",
    ].join("\n"),
    user: `Question:\n${input.question}\n\nSaved document context:\n${context || "No relevant saved document context was retrieved."}`,
    citations,
  };
}
```

- [ ] **Step 3: Run prompt tests**

Run: `pnpm exec vitest run tests/rag/prompt.test.ts`

Expected: PASS.

- [ ] **Step 4: Write failing ask service tests**

Create `tests/rag/ask.test.ts`:

```ts
import { WorkspaceRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/client";
import { askDocumentQuestion } from "@/lib/rag/ask";
import { createDocument } from "@/lib/documents/service";
import { seedWorkspaceFixture } from "../setup/prisma";

vi.mock("@/lib/rag/ollama", () => ({
  embedText: vi.fn().mockResolvedValue(Array.from({ length: 1024 }, () => 0.01)),
  chatWithContext: vi.fn().mockResolvedValue("Saved answer"),
}));

vi.mock("@/lib/rag/vector-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rag/vector-store")>("@/lib/rag/vector-store");
  return {
    ...actual,
    searchSimilarChunks: vi.fn().mockResolvedValue([
      {
        id: "chunk-1",
        documentId: "doc-1",
        documentTitle: "Runbook",
        documentPath: "/runbook",
        headingPath: "Intro",
        content: "Saved content only",
        distance: 0.1,
      },
    ]),
  };
});

describe("askDocumentQuestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("answers from saved DB content and ignores draft fields", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const document = await createDocument({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      title: "Runbook",
      contentMarkdown: "# Runbook\n\nSaved content only",
    });

    const result = await askDocumentQuestion({
      workspaceSlug: fixture.workspace.slug,
      documentId: document.id,
      actorId: fixture.user.id,
      question: "What is saved?",
      draftTitle: "Unsaved title",
      draftContentMarkdown: "Unsaved body",
    } as never);

    expect(result.answer).toBe("Saved answer");
    expect(result.citations[0]?.documentTitle).toBe("Runbook");
  });

  it("rejects unreadable selected documents", async () => {
    const ownerFixture = await seedWorkspaceFixture(WorkspaceRole.OWNER);
    const viewerFixture = await seedWorkspaceFixture(WorkspaceRole.VIEWER);
    await prisma.workspaceMember.create({
      data: {
        workspaceId: ownerFixture.workspace.id,
        userId: viewerFixture.user.id,
        role: WorkspaceRole.VIEWER,
      },
    });
    const document = await createDocument({
      workspaceSlug: ownerFixture.workspace.slug,
      actorId: ownerFixture.user.id,
      title: "Restricted",
      contentMarkdown: "# Restricted",
    });
    await prisma.permission.create({
      data: {
        resourceType: "DOCUMENT",
        resourceId: document.id,
        subjectType: "USER",
        subjectId: ownerFixture.user.id,
        permission: "MANAGE",
      },
    });

    await expect(askDocumentQuestion({
      workspaceSlug: ownerFixture.workspace.slug,
      documentId: document.id,
      actorId: viewerFixture.user.id,
      question: "Can I read this?",
    })).rejects.toThrow("DOCUMENT_NOT_FOUND");
  });
});
```

- [ ] **Step 5: Implement ask service**

Create `lib/rag/ask.ts`:

```ts
import { prisma } from "@/lib/db/client";
import { parseDocumentMetadata } from "@/lib/document-metadata/parser";
import { canWriteDocument, highestPermissionLevel } from "@/lib/permissions/document";
import { assertCanReadWorkspace } from "@/lib/permissions/workspace";
import { SERVICE_ERROR_CODES } from "@/lib/service-errors";
import { filterReadableDocuments } from "@/lib/workspace-tree";
import { getRagConfig } from "@/lib/rag/config";
import { embedText, chatWithContext } from "@/lib/rag/ollama";
import { buildRagPrompt, type RagCitation } from "@/lib/rag/prompt";
import { buildRetrievalScopes, rerankRetrievedChunks } from "@/lib/rag/retriever";
import { searchSimilarChunks } from "@/lib/rag/vector-store";
import { safeIndexSavedDocument } from "@/lib/rag/index-document";

export type AskDocumentQuestionResult = {
  answer: string;
  citations: RagCitation[];
};

export async function askDocumentQuestion(input: {
  workspaceSlug: string;
  documentId: string;
  actorId: string;
  question: string;
}): Promise<AskDocumentQuestionResult> {
  const question = input.question.trim();
  if (!question) throw new Error("QUESTION_REQUIRED");

  const workspace = await prisma.workspace.findFirst({
    where: { slug: input.workspaceSlug },
    include: {
      members: { where: { userId: input.actorId }, take: 1 },
      documents: { where: { status: "ACTIVE" }, orderBy: { updatedAt: "desc" } },
    },
  });
  if (!workspace || !workspace.members[0]) throw new Error(SERVICE_ERROR_CODES.WORKSPACE_NOT_FOUND);
  const role = workspace.members[0].role;
  assertCanReadWorkspace(role);

  const documentIds = workspace.documents.map((document) => document.id);
  const [documentsWithExplicitPermissions, userDocumentPermissions, persistedLinks] = await Promise.all([
    prisma.permission.findMany({
      where: { resourceType: "DOCUMENT", resourceId: { in: documentIds } },
      distinct: ["resourceId"],
      select: { resourceId: true },
    }),
    prisma.permission.findMany({
      where: {
        resourceType: "DOCUMENT",
        resourceId: { in: documentIds },
        subjectType: "USER",
        subjectId: input.actorId,
      },
      select: { resourceId: true, permission: true },
    }),
    prisma.documentLink.findMany({
      where: { workspaceId: workspace.id },
      select: {
        sourceDocumentId: true,
        targetDocumentId: true,
        targetTitleRaw: true,
        isBroken: true,
        isAmbiguous: true,
      },
    }),
  ]);
  const explicitDocumentIds = new Set(documentsWithExplicitPermissions.map((permission) => permission.resourceId));
  const permissionsByDocumentId = new Map<string, typeof userDocumentPermissions>();
  for (const permission of userDocumentPermissions) {
    const permissions = permissionsByDocumentId.get(permission.resourceId) ?? [];
    permissions.push(permission);
    permissionsByDocumentId.set(permission.resourceId, permissions);
  }
  const userPermissionByDocumentId = new Map(documentIds.map((documentId) => [
    documentId,
    highestPermissionLevel((permissionsByDocumentId.get(documentId) ?? []).map((permission) => permission.permission)),
  ]));
  const readableDocuments = filterReadableDocuments({
    documents: workspace.documents,
    role,
    explicitDocumentIds,
    userPermissionsByDocumentId: userPermissionByDocumentId,
  });
  const selected = readableDocuments.find((document) => document.id === input.documentId);
  if (!selected) throw new Error(SERVICE_ERROR_CODES.DOCUMENT_NOT_FOUND);

  await safeIndexSavedDocument({ documentId: selected.id });
  const scopes = buildRetrievalScopes({
    selectedDocumentId: selected.id,
    readableDocuments,
    persistedLinks,
  });
  const readableDocumentIds = [
    ...scopes.currentDocumentIds,
    ...scopes.linkedDocumentIds,
    ...scopes.backlinkDocumentIds,
    ...scopes.sameTagDocumentIds,
    ...scopes.fallbackDocumentIds,
  ];
  const questionEmbedding = await embedText(question);
  const retrieved = await searchSimilarChunks({
    workspaceId: workspace.id,
    embeddingModel: getRagConfig().embedModel,
    embedding: questionEmbedding,
    readableDocumentIds,
    limit: 60,
  });
  const ranked = rerankRetrievedChunks({ chunks: retrieved, scopes, query: question, limit: 20 });
  const prompt = buildRagPrompt({ question, chunks: ranked });
  return {
    answer: await chatWithContext(prompt.system, prompt.user),
    citations: prompt.citations,
  };
}
```

Remove the unused imports after implementation. `canWriteDocument` and `parseDocumentMetadata` should not remain if the compiler reports they are unused.

- [ ] **Step 6: Add route handler**

Create `app/api/workspaces/[workspaceSlug]/documents/[documentId]/ask/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/session";
import { askDocumentQuestion } from "@/lib/rag/ask";

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceSlug: string; documentId: string }> },
) {
  const user = await requireCurrentUser();
  const { workspaceSlug, documentId } = await context.params;
  const body = await request.json().catch(() => ({}));
  const question = typeof body.question === "string" ? body.question : "";

  try {
    const result = await askDocumentQuestion({
      workspaceSlug,
      documentId,
      actorId: user.id,
      question,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "RAG_ASK_FAILED";
    const status = message === "QUESTION_REQUIRED" ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
```

- [ ] **Step 7: Run ask tests**

Run: `pnpm exec vitest run tests/rag/prompt.test.ts tests/rag/ask.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/rag/prompt.ts lib/rag/ask.ts app/api/workspaces/[workspaceSlug]/documents/[documentId]/ask/route.ts tests/rag/prompt.test.ts tests/rag/ask.test.ts
git commit -m "feat: add saved document ask service"
```

## Task 8: Document Editor Assistant UI

**Files:**
- Create: `components/document-editor/ai-assistant-panel.tsx`
- Modify: `components/document-editor.tsx`
- Modify: `components/document-editor/types.ts`
- Modify: `app/workspaces/[workspaceSlug]/page.tsx`
- Test: `tests/components/document-editor-preview.test.tsx`

- [ ] **Step 1: Write failing UI tests**

Add to `tests/components/document-editor-preview.test.tsx`:

```tsx
it("opens the AI assistant from the title row and posts only the question", async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      answer: "Use the saved runbook.",
      citations: [{
        index: 1,
        documentId: "doc-1",
        documentTitle: "Foldable",
        documentPath: "/foldable",
        headingPath: "Intro",
      }],
    }),
  });
  vi.stubGlobal("fetch", fetchMock);

  renderEditor("# Saved", { workspaceSlug: "company-handbook" });

  fireEvent.change(screen.getByRole("textbox", { name: /title/i }), {
    target: { value: "Unsaved Title" },
  });
  fireEvent.click(screen.getByRole("button", { name: "AI에게 묻기" }));
  expect(screen.getByText("저장되지 않은 변경사항은 AI 답변에 반영되지 않습니다.")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("AI question"), {
    target: { value: "What should I do?" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Ask AI" }));

  await screen.findByText("Use the saved runbook.");
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/workspaces/company-handbook/documents/doc-1/ask",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "What should I do?" }),
    },
  );
  expect(fetchMock.mock.calls[0]?.[1]?.body).not.toContain("Unsaved Title");
});
```

- [ ] **Step 2: Run the failing UI test**

Run: `pnpm exec vitest run tests/components/document-editor-preview.test.tsx -t "opens the AI assistant"`

Expected: FAIL because the UI does not exist.

- [ ] **Step 3: Add prop types**

In `components/document-editor/types.ts`, add `workspaceSlug`:

```ts
export type DocumentEditorProps = {
  workspaceSlug: string;
  document: EditableDocument | null;
  canWrite: boolean;
  action: (formData: FormData) => Promise<void>;
  uploadAttachmentAction: (formData: FormData) => Promise<void>;
  pasteImageAttachmentAction: (formData: FormData) => Promise<{ markdown: string }>;
  linkCandidates: LinkCandidate[];
  tags: Pick<Tag, "id" | "name">[];
  properties: Pick<DocumentProperty, "id" | "key" | "valueJson">[];
  comments: CommentItem[];
  linkPanels: DocumentLinkPanels;
  createFromBrokenLinkAction: (formData: FormData) => Promise<void>;
  createCommentAction: (formData: FormData) => Promise<void>;
};
```

Update `baseProps` in `tests/components/document-editor-preview.test.tsx`:

```tsx
workspaceSlug: "company-handbook",
```

In `app/workspaces/[workspaceSlug]/page.tsx`, pass:

```tsx
workspaceSlug={workspaceSlug}
```

- [ ] **Step 4: Create assistant panel**

Create `components/document-editor/ai-assistant-panel.tsx`:

```tsx
"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";

type Citation = {
  index: number;
  documentId: string;
  documentTitle: string;
  documentPath: string;
  headingPath: string | null;
};

export function AiAssistantPanel({
  workspaceSlug,
  documentId,
  hasUnsavedChanges,
}: {
  workspaceSlug: string;
  documentId: string;
  hasUnsavedChanges: boolean;
}) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [citations, setCitations] = useState<Citation[]>([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function ask() {
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) {
      setError("Question is required");
      return;
    }

    setIsLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/workspaces/${workspaceSlug}/documents/${documentId}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmedQuestion }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "RAG_ASK_FAILED");
      }
      setAnswer(result.answer ?? "");
      setCitations(result.citations ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "RAG_ASK_FAILED");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="rounded-md border border-border bg-white p-3">
      <label className="sr-only" htmlFor={`ai-question-${documentId}`}>
        AI question
      </label>
      <textarea
        id={`ai-question-${documentId}`}
        aria-label="AI question"
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        className="min-h-20 w-full resize-y rounded-md border border-border px-3 py-2 text-sm"
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500">Saved document content only</p>
        <Button type="button" onClick={ask} disabled={isLoading} className="h-8 px-3 text-xs">
          Ask AI
        </Button>
      </div>
      {hasUnsavedChanges ? (
        <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-700">
          저장되지 않은 변경사항은 AI 답변에 반영되지 않습니다.
        </p>
      ) : null}
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      {answer ? <p className="mt-3 whitespace-pre-wrap text-sm text-ink">{answer}</p> : null}
      {citations.length > 0 ? (
        <ol className="mt-3 space-y-1 text-xs text-slate-600">
          {citations.map((citation) => (
            <li key={`${citation.index}-${citation.documentId}`}>
              [{citation.index}] {citation.documentTitle}
              {citation.headingPath ? ` > ${citation.headingPath}` : ""}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 5: Mount from DocumentEditor title row**

In `components/document-editor.tsx`, import `Sparkles` and the panel:

```tsx
import { Paperclip, Save, Sparkles, Upload } from "lucide-react";
import { AiAssistantPanel } from "@/components/document-editor/ai-assistant-panel";
```

Add state inside `DocumentEditor`:

```tsx
const [isAiAssistantOpen, setIsAiAssistantOpen] = useState(false);
const hasUnsavedChanges = document
  ? title !== document.title || contentMarkdown !== document.contentMarkdown
  : false;
```

Render the title row as:

```tsx
<div className="flex items-center gap-3">
  <input
    form={`document-save-${document.id}`}
    name="title"
    aria-label="Document title"
    value={title}
    onChange={(event) => setTitle(event.target.value)}
    disabled={!canWrite}
    className="min-w-0 flex-1 border-0 bg-transparent px-0 py-1 text-[1.75rem] font-bold leading-tight text-ink outline-none placeholder:text-slate-400 focus:ring-0 disabled:cursor-not-allowed disabled:opacity-70"
  />
  <Button
    type="button"
    variant="outline"
    className="h-8 shrink-0 px-2 text-xs"
    onClick={() => setIsAiAssistantOpen((open) => !open)}
  >
    <Sparkles className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
    AI에게 묻기
  </Button>
</div>
{isAiAssistantOpen ? (
  <AiAssistantPanel
    workspaceSlug={workspaceSlug}
    documentId={document.id}
    hasUnsavedChanges={hasUnsavedChanges}
  />
) : null}
```

- [ ] **Step 6: Run UI tests**

Run: `pnpm exec vitest run tests/components/document-editor-preview.test.tsx -t "opens the AI assistant"`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add components/document-editor/ai-assistant-panel.tsx components/document-editor.tsx components/document-editor/types.ts app/workspaces/[workspaceSlug]/page.tsx tests/components/document-editor-preview.test.tsx
git commit -m "feat: add document ai assistant panel"
```

## Task 9: Wiki Updates And Final Verification

**Files:**
- Modify: `wiki/Document Knowledge Model.md`
- Modify: `wiki/Document Editing Workflow.md`
- Modify: `wiki/Next.js Prisma Monolith.md`
- Modify: `wiki/Project PRD.md`
- Modify: `wiki/index.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`

- [ ] **Step 1: Update durable wiki pages**

Record these implementation facts:

```md
Issue #73 implements `AI에게 묻기` as a saved-content-only document assistant.
The assistant stores Markdown chunks in `DocumentChunk`, embeds with `bge-m3`,
uses pgvector `vector(1024)` with HNSW cosine search, and answers with Ollama
`gemma4:e4b` by default. Because Prisma does not round-trip the HNSW index on
`Unsupported("vector(1024)")`, the migration creates the extension/table and
`pnpm run db:rag:index` creates the HNSW index idempotently.
```

Add the DB model summary to `wiki/Document Knowledge Model.md`, the UI/request
flow to `wiki/Document Editing Workflow.md`, and the monolith/pgvector decision
to `wiki/Next.js Prisma Monolith.md`.

Also add this dimension warning to `wiki/Document Knowledge Model.md`:

```md
The first embedding schema is tied to `bge-m3` 1024-dimensional dense vectors.
Switching to an embedding model with a different dimension requires a Prisma/SQL
migration for `DocumentChunk.embedding`, rebuilding the pgvector index, and
reindexing document chunks before enabling the new model.
```

- [ ] **Step 2: Update index and log**

In `wiki/index.md`, move Issue #73 from planned language to implemented language.

Add a `wiki/log.md` implementation entry with:

```md
## 2026-05-30T12:00:00+09:00 - implementation

- Result: Implemented Issue #73 saved-content-only document AI RAG assistant.
- Coverage: ...
- Pages: [[Document Knowledge Model]], [[Document Editing Workflow]], [[Next.js Prisma Monolith]], [[Project PRD]], [[index|Wiki Index]], [[log|Wiki Log]].
- Source evidence: ...
- Verification: ...
```

- [ ] **Step 3: Run focused tests**

Run:

```bash
pnpm exec vitest run tests/rag tests/components/document-editor-preview.test.tsx tests/documents/service.test.ts tests/attachments/service.test.ts tests/wiki-links/reconcile.test.ts tests/knowledge-graph/model.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run typecheck**

Run: `pnpm exec tsc --noEmit`

Expected: PASS.

- [ ] **Step 5: Run wiki maintenance checks**

Run:

```bash
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
pnpm wiki:lint
pnpm wiki:sync-check --staged
```

Expected: PASS.

- [ ] **Step 6: Commit wiki and final verification changes**

```bash
git add wiki/Document\ Knowledge\ Model.md wiki/Document\ Editing\ Workflow.md wiki/Next.js\ Prisma\ Monolith.md wiki/Project\ PRD.md wiki/index.md wiki/log.md wiki/manifest.json
git commit -m "docs: document ai rag assistant implementation"
```

- [ ] **Step 7: Final branch status**

Run: `git status --short --branch`

Expected: clean working tree on `issue-73-document-ai-rag-assistant`.

- [ ] **Step 8: Push, open PR, and run review loop**

Run:

```bash
git push -u origin issue-73-document-ai-rag-assistant
gh pr create --draft --title "Add document AI RAG assistant" --body "Implements Issue #73 saved-content-only document AI RAG assistant."
gh pr ready
```

Expected: branch is pushed and a PR exists.

Wait at least 5 minutes, then run:

```bash
gh pr view --json reviewDecision,latestReviews,comments,url
gh pr checks
```

Expected: report review and check status. If there is actionable review feedback
or a failing check, fix it on the same branch, rerun focused verification and
wiki sync, commit, push, and recheck.
