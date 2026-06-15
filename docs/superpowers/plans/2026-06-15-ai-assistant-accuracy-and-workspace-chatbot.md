# AI Assistant Accuracy And Workspace Chatbot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve Ask AI by answering from the current saved document first, and add a non-streaming workspace chatbot with persisted user/workspace conversation history.

**Architecture:** Split AI into two request profiles. Ask AI becomes a current-document direct-context path with current-document section citations and no default vector search. The workspace chatbot adds Prisma-backed threads/messages and reuses the existing `DocumentChunk` pgvector retrieval path for readable workspace documents.

**Tech Stack:** Next.js App Router route handlers, React client components, Prisma/PostgreSQL/pgvector, LangChain chat models, Vitest, Testing Library, existing wiki maintenance CLI.

---

## File Structure

- Create `lib/rag/document-context.ts`: builds full-document or heading-window context packages for Ask AI.
- Create `tests/rag/document-context.test.ts`: unit coverage for context packing and section citation metadata.
- Modify `lib/rag/prompt.ts`: add an Ask AI direct-context prompt builder while preserving existing RAG prompt behavior for chatbot retrieval.
- Modify `tests/rag/prompt.test.ts`: direct-context prompt expectations.
- Modify `lib/rag/ask.ts`: switch default Ask AI evidence gathering to current-document context package and remove default indexing/query embedding/vector search calls.
- Modify `tests/rag/ask.test.ts`: assert default Ask AI does not call vector search or embedding and only returns current-document citations.
- Create `components/ai/thinking-indicator.tsx`: shared elapsed-time loading message hook/component.
- Create `tests/components/thinking-indicator.test.tsx`: fake-timer coverage for the English message schedule.
- Modify `components/document-editor/ai-assistant-panel.tsx`: use shared thinking indicator and direct-context wording.
- Modify `tests/components/document-editor-preview.test.tsx`: Ask AI loading indicator and existing request behavior.
- Modify `prisma/schema.prisma`: add chatbot thread/message models and enums.
- Create `prisma/migrations/20260615120000_add_ai_chat_threads/migration.sql`: database migration for chat persistence.
- Create `lib/rag/workspace-chat.ts`: chatbot thread loading, message persistence, readable document retrieval, prompt construction, model invocation, and reset.
- Create `tests/rag/workspace-chat.test.ts`: service-level DB-backed chatbot behavior.
- Create `app/api/workspaces/[workspaceSlug]/assistant/thread/route.ts`: load/create current thread.
- Create `app/api/workspaces/[workspaceSlug]/assistant/messages/route.ts`: send non-streaming chatbot message.
- Create `app/api/workspaces/[workspaceSlug]/assistant/thread/reset/route.ts`: archive active thread.
- Create `tests/rag/workspace-chat-route.test.ts`: route validation, auth, and persistence forwarding.
- Create `components/workspace-chatbot.tsx`: floating launcher and compact non-streaming chatbot panel.
- Create `tests/components/workspace-chatbot.test.tsx`: launcher, loading indicator, send, render, reset, failure states.
- Modify `app/workspaces/[workspaceSlug]/page.tsx`: mount the chatbot surface in the workspace page.
- Modify wiki pages after source changes: `wiki/RAG Process Workflow.md`, `wiki/Munjib.md`, `wiki/Project PRD.md`, `wiki/index.md`, `wiki/log.md`, `wiki/manifest.json`.

---

### Task 1: Ask AI Current-Document Context Packer

**Files:**
- Create: `lib/rag/document-context.ts`
- Test: `tests/rag/document-context.test.ts`

- [ ] **Step 1: Write failing tests for full-document and oversized heading-window context**

Create `tests/rag/document-context.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildCurrentDocumentContext } from "@/lib/rag/document-context";

describe("current document context", () => {
  it("uses the full saved document when it fits the budget", () => {
    const context = buildCurrentDocumentContext({
      documentTitle: "Incident Runbook",
      documentPath: "/incident-runbook",
      contentMarkdown: "# Rollback\n\nUse the previous stable deployment.",
      question: "What is the rollback plan?",
      maxTokens: 200,
    });

    expect(context.partial).toBe(false);
    expect(context.context).toContain("# Rollback");
    expect(context.context).toContain("Use the previous stable deployment.");
    expect(context.sections).toEqual([
      {
        index: 1,
        documentTitle: "Incident Runbook",
        documentPath: "/incident-runbook",
        headingPath: "Rollback",
      },
    ]);
  });

  it("selects relevant heading sections when the document exceeds the budget", () => {
    const context = buildCurrentDocumentContext({
      documentTitle: "Operations Manual",
      documentPath: "/ops-manual",
      contentMarkdown: [
        "# Billing",
        "Invoices renewal discounts procurement.",
        "# Incident Response",
        "Rollback uses the previous stable deployment and verifies health checks.",
        "# Hiring",
        "Interview loops onboarding compensation.",
      ].join("\n\n"),
      question: "How do we rollback during an incident?",
      maxTokens: 18,
    });

    expect(context.partial).toBe(true);
    expect(context.context).toContain("Incident Response");
    expect(context.context).toContain("Rollback uses the previous stable deployment");
    expect(context.context).not.toContain("Interview loops");
    expect(context.sections).toEqual([
      {
        index: 1,
        documentTitle: "Operations Manual",
        documentPath: "/ops-manual",
        headingPath: "Incident Response",
      },
    ]);
  });

  it("returns no sections for an empty saved document", () => {
    const context = buildCurrentDocumentContext({
      documentTitle: "Empty",
      documentPath: "/empty",
      contentMarkdown: "   \n",
      question: "What is here?",
      maxTokens: 200,
    });

    expect(context.context).toBe("");
    expect(context.sections).toEqual([]);
    expect(context.partial).toBe(false);
  });
});
```

- [ ] **Step 2: Run the failing context tests**

Run: `pnpm exec vitest run tests/rag/document-context.test.ts`

Expected: FAIL with an import error for `@/lib/rag/document-context`.

- [ ] **Step 3: Implement the context packer**

Create `lib/rag/document-context.ts`:

```ts
import { stripDocumentFrontmatter } from "@/lib/document-metadata/parser";

export type CurrentDocumentContextSection = {
  index: number;
  documentTitle: string;
  documentPath: string;
  headingPath: string | null;
};

export type CurrentDocumentContext = {
  context: string;
  sections: CurrentDocumentContextSection[];
  partial: boolean;
};

type BuildCurrentDocumentContextInput = {
  documentTitle: string;
  documentPath: string;
  contentMarkdown: string;
  question: string;
  maxTokens?: number;
};

type SectionCandidate = {
  headingPath: string | null;
  content: string;
  tokenCount: number;
  score: number;
  order: number;
};

const DEFAULT_CONTEXT_TOKEN_BUDGET = 8_000;
const LATIN_KEYWORD_TERM_MIN_LENGTH = 3;
const CJK_KEYWORD_TERM_MIN_LENGTH = 2;
const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "if",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "then",
  "this",
  "to",
  "was",
  "we",
  "with",
  "you",
  "your",
]);

export function buildCurrentDocumentContext(
  input: BuildCurrentDocumentContextInput,
): CurrentDocumentContext {
  const body = stripDocumentFrontmatter(input.contentMarkdown).trim();
  if (!body) return { context: "", sections: [], partial: false };

  const budget = Math.max(1, input.maxTokens ?? DEFAULT_CONTEXT_TOKEN_BUDGET);
  const allSections = splitIntoHeadingSections(body).map((section, order) => ({
    ...section,
    tokenCount: estimateTokens(section.content),
    score: scoreSection(section, input.question),
    order,
  }));
  const fullTokenCount = estimateTokens(body);

  if (fullTokenCount <= budget) {
    return {
      context: body,
      partial: false,
      sections: allSections.map((section, index) =>
        toContextSection(section, input, index + 1),
      ),
    };
  }

  const selected = selectSectionsWithinBudget(allSections, budget);
  return {
    context: selected.map((section) => section.content).join("\n\n"),
    partial: true,
    sections: selected.map((section, index) => toContextSection(section, input, index + 1)),
  };
}

export function estimateTokens(text: string) {
  const normalized = text.trim();
  if (!normalized) return 0;

  return Math.ceil(normalized.length / 4);
}

function splitIntoHeadingSections(markdown: string) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const sections: Array<{ headingPath: string | null; content: string }> = [];
  const headingStack: Array<{ level: number; text: string }> = [];
  let currentHeadingPath: string | null = null;
  let currentLines: string[] = [];
  let activeFence: string | null = null;

  const flush = () => {
    const content = currentLines.join("\n").trim();
    if (content) {
      sections.push({ headingPath: currentHeadingPath, content });
    }
    currentLines = [];
  };

  for (const line of lines) {
    const fence = line.match(/^\s*(```+|~~~+)/)?.[1] ?? null;
    if (fence && !activeFence) {
      activeFence = fence;
    } else if (activeFence && line.trimStart().startsWith(activeFence)) {
      activeFence = null;
    }

    const heading = activeFence ? null : line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      flush();
      const level = heading[1].length;
      const text = heading[2].trim();
      while (headingStack.length > 0 && headingStack[headingStack.length - 1]!.level >= level) {
        headingStack.pop();
      }
      headingStack.push({ level, text });
      currentHeadingPath = headingStack.map((item) => item.text).join(" > ");
    }

    currentLines.push(line);
  }

  flush();
  return sections.length > 0 ? sections : [{ headingPath: null, content: markdown.trim() }];
}

function scoreSection(section: { headingPath: string | null; content: string }, question: string) {
  const questionTerms = normalizedKeywordTerms(question);
  const contentTerms = normalizedKeywordTerms(
    `${section.headingPath ?? ""}\n${section.content}`,
  );
  let score = 0;

  for (const term of questionTerms) {
    if (contentTerms.has(term)) score += 1;
  }

  return score;
}

function selectSectionsWithinBudget(sections: SectionCandidate[], budget: number) {
  const ranked = [...sections].sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return left.order - right.order;
  });
  const selected: SectionCandidate[] = [];
  let usedTokens = 0;

  for (const section of ranked) {
    if (selected.length > 0 && usedTokens + section.tokenCount > budget) continue;
    if (section.tokenCount > budget && selected.length === 0) {
      selected.push({
        ...section,
        content: truncateToBudget(section.content, budget),
        tokenCount: budget,
      });
      break;
    }
    selected.push(section);
    usedTokens += section.tokenCount;
  }

  return selected.sort((left, right) => left.order - right.order);
}

function truncateToBudget(content: string, budget: number) {
  const maxChars = Math.max(1, budget * 4);
  return content.length <= maxChars ? content : content.slice(0, maxChars).trimEnd();
}

function toContextSection(
  section: Pick<SectionCandidate, "headingPath">,
  input: Pick<BuildCurrentDocumentContextInput, "documentTitle" | "documentPath">,
  index: number,
): CurrentDocumentContextSection {
  return {
    index,
    documentTitle: input.documentTitle,
    documentPath: input.documentPath,
    headingPath: section.headingPath,
  };
}

function normalizedKeywordTerms(text: string) {
  const tokens = text.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return new Set(tokens.filter(isKeywordCandidate));
}

function isKeywordCandidate(term: string) {
  if (STOP_WORDS.has(term)) return false;
  if (/[\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(term)) {
    return term.length >= CJK_KEYWORD_TERM_MIN_LENGTH;
  }
  return term.length >= LATIN_KEYWORD_TERM_MIN_LENGTH;
}
```

- [ ] **Step 4: Run the context tests**

Run: `pnpm exec vitest run tests/rag/document-context.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add lib/rag/document-context.ts tests/rag/document-context.test.ts
git commit -m "feat: add ask ai document context packer"
```

---

### Task 2: Ask AI Direct-Context Prompt And Service

**Files:**
- Modify: `lib/rag/prompt.ts`
- Modify: `tests/rag/prompt.test.ts`
- Modify: `lib/rag/ask.ts`
- Modify: `tests/rag/ask.test.ts`

- [ ] **Step 1: Add failing prompt tests for direct current-document context**

Append to `tests/rag/prompt.test.ts`:

```ts
import { buildDirectDocumentPrompt } from "@/lib/rag/prompt";

describe("direct document prompt builder", () => {
  it("uses only the current saved document context", () => {
    const prompt = buildDirectDocumentPrompt({
      question: "What is the rollback plan?",
      documentTitle: "Incident Runbook",
      documentPath: "/incident-runbook",
      context: "# Rollback\n\nUse the previous stable deployment.",
      partial: false,
      sections: [
        {
          index: 1,
          documentTitle: "Incident Runbook",
          documentPath: "/incident-runbook",
          headingPath: "Rollback",
        },
      ],
    });

    expect(prompt.system).toContain("current saved document");
    expect(prompt.system).toContain("Do not use other workspace documents");
    expect(prompt.user).toContain("# Rollback");
    expect(prompt.citations).toEqual([
      {
        index: 1,
        documentId: "current",
        documentTitle: "Incident Runbook",
        documentPath: "/incident-runbook",
        headingPath: "Rollback",
      },
    ]);
  });

  it("tells the model when only part of a long document was packed", () => {
    const prompt = buildDirectDocumentPrompt({
      question: "What is the rollback plan?",
      documentTitle: "Incident Runbook",
      documentPath: "/incident-runbook",
      context: "# Rollback\n\nUse the previous stable deployment.",
      partial: true,
      sections: [],
    });

    expect(prompt.user).toContain("Only selected sections of this long document were included.");
  });
});
```

- [ ] **Step 2: Run prompt tests to verify failure**

Run: `pnpm exec vitest run tests/rag/prompt.test.ts`

Expected: FAIL with `buildDirectDocumentPrompt` not exported.

- [ ] **Step 3: Implement direct prompt builder**

Modify `lib/rag/prompt.ts`:

```ts
import type { CurrentDocumentContextSection } from "@/lib/rag/document-context";
import type { RetrievedChunk } from "@/lib/rag/vector-store";

export type RagCitation = {
  index: number;
  documentId: string;
  documentTitle: string;
  documentPath: string;
  headingPath: string | null;
};

export type RagPrompt = {
  system: string;
  user: string;
  citations: RagCitation[];
};

type PromptChunk = RetrievedChunk & { score?: number };

type BuildRagPromptInput = {
  question: string;
  chunks: PromptChunk[];
};

type BuildDirectDocumentPromptInput = {
  question: string;
  documentTitle: string;
  documentPath: string;
  context: string;
  sections: CurrentDocumentContextSection[];
  partial: boolean;
};

export function buildRagPrompt(input: BuildRagPromptInput): RagPrompt {
  const citations = input.chunks.map((chunk, index) => ({
    index: index + 1,
    documentId: chunk.documentId,
    documentTitle: chunk.documentTitle,
    documentPath: chunk.documentPath,
    headingPath: chunk.headingPath,
  }));

  const context =
    input.chunks.length > 0
      ? input.chunks
          .map((chunk, index) => `${citationLabel(index + 1, chunk)}\n${chunk.content.trim()}`)
          .join("\n\n")
      : "No saved document context was retrieved.";

  return {
    system: [
      "You are Munjib's document AI assistant.",
      "Use only the saved document context provided in this request.",
      "Do not use unsaved editor drafts, draft titles, or draft markdown.",
      "Do not use outside knowledge.",
      "If the saved documents do not contain enough evidence, say that the saved documents do not contain enough evidence to answer.",
      "Answer in the same language as the question where possible.",
      "Cite supporting context with bracketed citation numbers like [1].",
    ].join(" "),
    user: [`Question:\n${input.question.trim()}`, `Saved document context:\n${context}`].join("\n\n"),
    citations,
  };
}

export function buildDirectDocumentPrompt(input: BuildDirectDocumentPromptInput): RagPrompt {
  const citations = input.sections.map((section, index) => ({
    index: index + 1,
    documentId: "current",
    documentTitle: section.documentTitle,
    documentPath: section.documentPath,
    headingPath: section.headingPath,
  }));
  const partialNote = input.partial
    ? "\n\nOnly selected sections of this long document were included."
    : "";
  const context = input.context.trim() || "The current saved document is empty.";

  return {
    system: [
      "You are Munjib's current document AI assistant.",
      "Use only the current saved document context provided in this request.",
      "Do not use other workspace documents.",
      "Do not use unsaved editor drafts, draft titles, or draft markdown.",
      "Do not use outside knowledge.",
      "If the current saved document does not contain enough evidence, say that the current saved document does not contain enough evidence to answer.",
      "Answer in the same language as the question where possible.",
      "Cite supporting context with bracketed citation numbers like [1] when citations are available.",
    ].join(" "),
    user: [
      `Question:\n${input.question.trim()}`,
      `Current saved document: ${input.documentTitle} (${input.documentPath})${partialNote}`,
      `Current saved document context:\n${context}`,
    ].join("\n\n"),
    citations,
  };
}

function citationLabel(index: number, chunk: PromptChunk) {
  const headingSuffix = chunk.headingPath ? ` > ${chunk.headingPath}` : "";
  return `[${index}] ${chunk.documentTitle}${headingSuffix}`;
}
```

- [ ] **Step 4: Add failing Ask AI service tests for direct context**

In `tests/rag/ask.test.ts`, update mocks so `safeIndexSavedDocument`, `embedText`, and `searchSimilarChunks` remain mocked, then add:

```ts
it("answers from current saved document context without vector retrieval by default", async () => {
  const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
  const selected = await createSavedDocument({
    workspaceId: fixture.workspace.id,
    userId: fixture.user.id,
    title: "Incident Runbook",
    contentMarkdown: "# Rollback\n\nUse the previous stable deployment.",
  });

  const result = await askDocumentQuestion({
    workspaceSlug: fixture.workspace.slug,
    documentId: selected.id,
    actorId: fixture.user.id,
    question: "What is the rollback plan?",
  });

  expect(result.answer).toBe("Saved answer");
  expect(safeIndexSavedDocument).not.toHaveBeenCalled();
  expect(embedText).not.toHaveBeenCalled();
  expect(searchSimilarChunks).not.toHaveBeenCalled();
  expect(result.citations).toEqual([
    {
      index: 1,
      documentId: selected.id,
      documentTitle: "Incident Runbook",
      documentPath: "/incident-runbook",
      headingPath: "Rollback",
    },
  ]);
  expect(invokeAnswerChain).toHaveBeenCalledWith(
    expect.objectContaining({
      userPrompt: expect.stringContaining("Use the previous stable deployment."),
    }),
  );
});
```

- [ ] **Step 5: Run Ask AI tests to verify failure**

Run: `pnpm exec vitest run tests/rag/prompt.test.ts tests/rag/ask.test.ts`

Expected: FAIL because `askDocumentQuestion()` still calls indexing and vector search.

- [ ] **Step 6: Implement Ask AI direct-context service path**

Modify `lib/rag/ask.ts`:

```ts
import { prisma } from "@/lib/db/client";
import { highestPermissionLevel } from "@/lib/permissions/document";
import { invokeAnswerChain, type ChatModelLike } from "@/lib/rag/answer-chain";
import { getRagModelConfig } from "@/lib/rag/config";
import { assertCurrentEmbeddingIndex } from "@/lib/rag/embedding-client";
import { createLangfuseCallbackConfig } from "@/lib/rag/langfuse";
import { createChatModel } from "@/lib/rag/model-factory";
import { buildCurrentDocumentContext } from "@/lib/rag/document-context";
import { buildDirectDocumentPrompt, type RagCitation } from "@/lib/rag/prompt";
import { SERVICE_ERROR_CODES } from "@/lib/service-errors";
import { filterReadableDocuments } from "@/lib/workspace-tree";

export const ASK_ERROR_CODES = {
  QUESTION_REQUIRED: "QUESTION_REQUIRED",
} as const;

export type AskDocumentQuestionInput = {
  workspaceSlug: string;
  documentId: string;
  actorId: string;
  question: string;
  chatModelOverride?: string;
};

export type AskDocumentQuestionResult = {
  answer: string;
  citations: RagCitation[];
};

export async function askDocumentQuestion(
  input: AskDocumentQuestionInput,
): Promise<AskDocumentQuestionResult> {
  const question = input.question.trim();
  if (!question) throw new Error(ASK_ERROR_CODES.QUESTION_REQUIRED);

  const workspace = await prisma.workspace.findFirst({
    where: { slug: input.workspaceSlug },
    include: {
      members: { where: { userId: input.actorId }, take: 1 },
      documents: {
        where: { status: "ACTIVE" },
        orderBy: { updatedAt: "desc" },
      },
    },
  });

  if (!workspace || !workspace.members[0]) {
    throw new Error(SERVICE_ERROR_CODES.WORKSPACE_NOT_FOUND);
  }

  const role = workspace.members[0].role;
  const documentIds = workspace.documents.map((document) => document.id);
  const [documentsWithExplicitPermissions, userDocumentPermissions] =
    documentIds.length > 0
      ? await Promise.all([
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
        ])
      : [[], []];

  const explicitDocumentIds = new Set(
    documentsWithExplicitPermissions.map((permission) => permission.resourceId),
  );
  const permissionsByDocumentId = new Map<string, typeof userDocumentPermissions>();
  for (const permission of userDocumentPermissions) {
    const permissions = permissionsByDocumentId.get(permission.resourceId) ?? [];
    permissions.push(permission);
    permissionsByDocumentId.set(permission.resourceId, permissions);
  }
  const userPermissionByDocumentId = new Map(
    documentIds.map((documentId) => [
      documentId,
      highestPermissionLevel(
        (permissionsByDocumentId.get(documentId) ?? []).map((permission) => permission.permission),
      ),
    ]),
  );
  const readableDocuments = filterReadableDocuments({
    documents: workspace.documents,
    role,
    explicitDocumentIds,
    userPermissionsByDocumentId: userPermissionByDocumentId,
  });
  const selectedDocument = readableDocuments.find((document) => document.id === input.documentId);

  if (!selectedDocument) {
    throw new Error(SERVICE_ERROR_CODES.DOCUMENT_NOT_FOUND);
  }

  const modelConfig = getRagModelConfig();
  const effectiveModelConfig = input.chatModelOverride
    ? {
        ...modelConfig,
        chat: {
          ...modelConfig.chat,
          model: input.chatModelOverride,
        },
      }
    : modelConfig;
  assertCurrentEmbeddingIndex(effectiveModelConfig);

  const context = buildCurrentDocumentContext({
    documentTitle: selectedDocument.title,
    documentPath: selectedDocument.path,
    contentMarkdown: selectedDocument.contentMarkdown,
    question,
  });
  const prompt = buildDirectDocumentPrompt({
    question,
    documentTitle: selectedDocument.title,
    documentPath: selectedDocument.path,
    context: context.context,
    sections: context.sections,
    partial: context.partial,
  });
  const citations = prompt.citations.map((citation) => ({
    ...citation,
    documentId: selectedDocument.id,
  }));
  const trace = createLangfuseCallbackConfig({
    enabled: effectiveModelConfig.langfuse.enabled,
    captureMode: effectiveModelConfig.langfuse.captureMode,
    operation: "rag.ask_document",
    chatProvider: effectiveModelConfig.chat.provider,
    chatModel: effectiveModelConfig.chat.model,
    embeddingProvider: effectiveModelConfig.embedding.provider,
    embeddingModel: effectiveModelConfig.embedding.indexId,
    embeddingDimensions: effectiveModelConfig.embedding.dimensions,
    citationDocumentIds: [selectedDocument.id],
    metadata: {
      workspaceSlug: input.workspaceSlug,
      workspaceId: workspace.id,
      selectedDocumentId: selectedDocument.id,
      actorId: input.actorId,
      contextPartial: context.partial,
    },
  });
  const answer = await invokeAnswerChain({
    systemPrompt: prompt.system,
    userPrompt: prompt.user,
    chatModel: createChatModel(effectiveModelConfig.chat) as ChatModelLike,
    callbacks: trace.callbacks,
    metadata: trace.metadata,
  });

  return { answer, citations };
}
```

- [ ] **Step 7: Run Ask AI focused tests**

Run: `pnpm exec vitest run tests/rag/document-context.test.ts tests/rag/prompt.test.ts tests/rag/ask.test.ts tests/rag/ask-route.test.ts tests/rag/langfuse.test.ts`

Expected: PASS. If `tests/rag/ask.test.ts` requires a local DB and fails with a connection error, start Postgres using the repo's Docker workflow before continuing.

- [ ] **Step 8: Commit Task 2**

```bash
git add lib/rag/prompt.ts lib/rag/ask.ts tests/rag/prompt.test.ts tests/rag/ask.test.ts
git commit -m "feat: answer ask ai from current document context"
```

---

### Task 3: Shared Thinking Indicator

**Files:**
- Create: `components/ai/thinking-indicator.tsx`
- Test: `tests/components/thinking-indicator.test.tsx`
- Modify: `components/document-editor/ai-assistant-panel.tsx`
- Modify: `tests/components/document-editor-preview.test.tsx`

- [ ] **Step 1: Write failing timer tests**

Create `tests/components/thinking-indicator.test.tsx`:

```tsx
// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThinkingIndicator } from "@/components/ai/thinking-indicator";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ThinkingIndicator", () => {
  it("advances through the English elapsed-time messages", () => {
    render(<ThinkingIndicator active />);

    expect(screen.getByText("Thinking...")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByText("Reviewing the relevant document context...")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(screen.getByText("Organizing the evidence and drafting an answer...")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(screen.getByText("This is taking longer than usual. Thanks for your patience...")).toBeTruthy();
  });

  it("renders nothing when inactive", () => {
    const { container } = render(<ThinkingIndicator active={false} />);

    expect(container.textContent).toBe("");
  });
});
```

- [ ] **Step 2: Run failing indicator tests**

Run: `pnpm exec vitest run tests/components/thinking-indicator.test.tsx`

Expected: FAIL with an import error for `components/ai/thinking-indicator`.

- [ ] **Step 3: Implement the shared indicator**

Create `components/ai/thinking-indicator.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";

const DEFAULT_MESSAGES = [
  { afterMs: 0, message: "Thinking..." },
  { afterMs: 10_000, message: "Reviewing the relevant document context..." },
  { afterMs: 30_000, message: "Organizing the evidence and drafting an answer..." },
  { afterMs: 60_000, message: "This is taking longer than usual. Thanks for your patience..." },
] as const;

type ThinkingIndicatorProps = {
  active: boolean;
  className?: string;
};

export function ThinkingIndicator({ active, className }: ThinkingIndicatorProps) {
  const message = useThinkingIndicator(active);

  if (!active || !message) return null;

  return (
    <p aria-live="polite" className={className ?? "text-sm text-slate-500"}>
      {message}
    </p>
  );
}

export function useThinkingIndicator(active: boolean) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const startedAt = useMemo(() => (active ? Date.now() : null), [active]);

  useEffect(() => {
    if (!active || startedAt === null) {
      setElapsedMs(0);
      return;
    }

    setElapsedMs(0);
    const interval = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
    }, 1_000);

    return () => window.clearInterval(interval);
  }, [active, startedAt]);

  if (!active) return "";

  return [...DEFAULT_MESSAGES]
    .reverse()
    .find((entry) => elapsedMs >= entry.afterMs)!.message;
}
```

- [ ] **Step 4: Integrate indicator into Ask AI panel**

Modify `components/document-editor/ai-assistant-panel.tsx`:

```tsx
import { ThinkingIndicator } from "@/components/ai/thinking-indicator";
```

Replace the submit button label:

```tsx
<Button type="submit" disabled={!trimmedQuestion || isLoading} className="h-8 px-2 text-xs">
  Ask AI
</Button>
```

Render the indicator after the form:

```tsx
<ThinkingIndicator active={isLoading} className="mt-3 text-sm text-slate-500" />
```

- [ ] **Step 5: Update Ask AI UI tests**

Append to `tests/components/document-editor-preview.test.tsx`:

```tsx
it("shows the Ask AI thinking indicator while the request is pending", async () => {
  vi.useFakeTimers();
  const deferred = createDeferred<Response>();
  vi.stubGlobal("fetch", vi.fn(() => deferred.promise));

  renderEditor("# Saved\n\nContent");
  fireEvent.click(screen.getByRole("button", { name: "AI에게 묻기" }));
  fireEvent.change(screen.getByLabelText("AI question"), {
    target: { value: "What is saved?" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Ask AI" }));

  expect(screen.getByText("Thinking...")).toBeTruthy();

  act(() => {
    vi.advanceTimersByTime(10_000);
  });
  expect(screen.getByText("Reviewing the relevant document context...")).toBeTruthy();

  deferred.resolve(new Response(JSON.stringify({ answer: "Saved answer", citations: [] })));
  await screen.findByText("Saved answer");
  expect(screen.queryByText("Reviewing the relevant document context...")).toBeNull();
  vi.useRealTimers();
});
```

- [ ] **Step 6: Run UI tests**

Run: `pnpm exec vitest run tests/components/thinking-indicator.test.tsx tests/components/document-editor-preview.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add components/ai/thinking-indicator.tsx components/document-editor/ai-assistant-panel.tsx tests/components/thinking-indicator.test.tsx tests/components/document-editor-preview.test.tsx
git commit -m "feat: add ai thinking indicator"
```

---

### Task 4: Chatbot Prisma Models

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260615120000_add_ai_chat_threads/migration.sql`

- [ ] **Step 1: Add Prisma enums and relations**

Modify `prisma/schema.prisma`:

```prisma
enum AiChatThreadStatus {
  ACTIVE
  ARCHIVED
}

enum AiChatMessageRole {
  USER
  ASSISTANT
}
```

Add relations to `User`:

```prisma
  aiChatThreads      AiChatThread[]
```

Add relations to `Workspace`:

```prisma
  aiChatThreads AiChatThread[]
```

Add models near `Comment`:

```prisma
model AiChatThread {
  id            String             @id @default(cuid())
  workspaceId   String
  userId        String
  title         String             @default("Workspace chat")
  status        AiChatThreadStatus @default(ACTIVE)
  lastMessageAt DateTime?
  createdAt     DateTime           @default(now())
  updatedAt     DateTime           @updatedAt
  workspace     Workspace          @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  user          User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  messages      AiChatMessage[]

  @@index([workspaceId, userId, status, lastMessageAt])
}

model AiChatMessage {
  id            String            @id @default(cuid())
  threadId      String
  role          AiChatMessageRole
  content       String
  citationsJson Json              @default("[]")
  model         String?
  createdAt     DateTime          @default(now())
  thread        AiChatThread      @relation(fields: [threadId], references: [id], onDelete: Cascade)

  @@index([threadId, createdAt])
}
```

- [ ] **Step 2: Add migration SQL**

Create `prisma/migrations/20260615120000_add_ai_chat_threads/migration.sql`:

```sql
CREATE TYPE "AiChatThreadStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "AiChatMessageRole" AS ENUM ('USER', 'ASSISTANT');

CREATE TABLE "AiChatThread" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL DEFAULT 'Workspace chat',
  "status" "AiChatThreadStatus" NOT NULL DEFAULT 'ACTIVE',
  "lastMessageAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AiChatThread_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiChatMessage" (
  "id" TEXT NOT NULL,
  "threadId" TEXT NOT NULL,
  "role" "AiChatMessageRole" NOT NULL,
  "content" TEXT NOT NULL,
  "citationsJson" JSONB NOT NULL DEFAULT '[]',
  "model" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AiChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiChatThread_workspaceId_userId_status_lastMessageAt_idx"
ON "AiChatThread"("workspaceId", "userId", "status", "lastMessageAt");

CREATE INDEX "AiChatMessage_threadId_createdAt_idx"
ON "AiChatMessage"("threadId", "createdAt");

ALTER TABLE "AiChatThread"
ADD CONSTRAINT "AiChatThread_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiChatThread"
ADD CONSTRAINT "AiChatThread_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiChatMessage"
ADD CONSTRAINT "AiChatMessage_threadId_fkey"
FOREIGN KEY ("threadId") REFERENCES "AiChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 3: Generate Prisma client**

Run: `pnpm exec prisma generate`

Expected: PASS.

- [ ] **Step 4: Commit Task 4**

```bash
git add prisma/schema.prisma prisma/migrations/20260615120000_add_ai_chat_threads/migration.sql
git commit -m "feat: add ai chat persistence models"
```

---

### Task 5: Workspace Chat Service

**Files:**
- Create: `lib/rag/workspace-chat.ts`
- Test: `tests/rag/workspace-chat.test.ts`

- [ ] **Step 1: Write failing service tests**

Create `tests/rag/workspace-chat.test.ts`:

```ts
import { WorkspaceRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/client";
import {
  getOrCreateWorkspaceChatThread,
  sendWorkspaceChatMessage,
  resetWorkspaceChatThread,
} from "@/lib/rag/workspace-chat";
import { invokeAnswerChain } from "@/lib/rag/answer-chain";
import { embedText } from "@/lib/rag/embedding-client";
import { searchSimilarChunks } from "@/lib/rag/vector-store";
import { resetTestData, seedWorkspaceFixture } from "../setup/prisma";

vi.mock("@/lib/rag/embedding-client", () => ({
  assertCurrentEmbeddingIndex: vi.fn(),
  embedText: vi.fn().mockResolvedValue(Array.from({ length: 1024 }, () => 0.01)),
}));

vi.mock("@/lib/rag/vector-store", () => ({
  searchSimilarChunks: vi.fn().mockResolvedValue([
    {
      id: "chunk-1",
      documentId: "doc-1",
      documentTitle: "Handbook",
      documentPath: "/handbook",
      headingPath: "Policy",
      content: "Workspace policy evidence.",
      distance: 0.1,
    },
  ]),
}));

vi.mock("@/lib/rag/model-factory", () => ({
  createChatModel: vi.fn(() => ({ invoke: vi.fn() })),
}));

vi.mock("@/lib/rag/answer-chain", () => ({
  invokeAnswerChain: vi.fn().mockResolvedValue("Workspace answer [1]."),
}));

describe("workspace chat service", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await resetTestData();
  });

  it("creates and reuses one active thread per user and workspace", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);

    const first = await getOrCreateWorkspaceChatThread({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
    });
    const second = await getOrCreateWorkspaceChatThread({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
    });

    expect(second.thread.id).toBe(first.thread.id);
    expect(second.messages).toEqual([]);
  });

  it("saves user and assistant messages and searches readable workspace chunks", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const document = await prisma.document.create({
      data: {
        workspaceId: fixture.workspace.id,
        title: "Handbook",
        slug: "handbook",
        path: "/handbook",
        contentMarkdown: "# Policy\n\nWorkspace policy evidence.",
        contentText: "Workspace policy evidence.",
        createdById: fixture.user.id,
        updatedById: fixture.user.id,
      },
    });
    vi.mocked(searchSimilarChunks).mockResolvedValueOnce([
      {
        id: "chunk-1",
        documentId: document.id,
        documentTitle: "Handbook",
        documentPath: "/handbook",
        headingPath: "Policy",
        content: "Workspace policy evidence.",
        distance: 0.1,
      },
    ]);

    const result = await sendWorkspaceChatMessage({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
      message: "What is the policy?",
    });

    expect(result.assistantMessage.content).toBe("Workspace answer [1].");
    expect(embedText).toHaveBeenCalledWith("What is the policy?", expect.anything());
    expect(searchSimilarChunks).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: fixture.workspace.id,
        readableDocumentIds: [document.id],
        limit: 60,
      }),
    );
    const messages = await prisma.aiChatMessage.findMany({
      where: { threadId: result.thread.id },
      orderBy: { createdAt: "asc" },
    });
    expect(messages.map((message) => message.role)).toEqual(["USER", "ASSISTANT"]);
  });

  it("archives the active thread on reset", async () => {
    const fixture = await seedWorkspaceFixture(WorkspaceRole.EDITOR);
    const created = await getOrCreateWorkspaceChatThread({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
    });

    await resetWorkspaceChatThread({
      workspaceSlug: fixture.workspace.slug,
      actorId: fixture.user.id,
    });

    const archived = await prisma.aiChatThread.findUniqueOrThrow({
      where: { id: created.thread.id },
    });
    expect(archived.status).toBe("ARCHIVED");
  });
});
```

- [ ] **Step 2: Run failing workspace chat tests**

Run: `pnpm exec vitest run tests/rag/workspace-chat.test.ts`

Expected: FAIL with missing module `@/lib/rag/workspace-chat`.

- [ ] **Step 3: Implement workspace chat service**

Create `lib/rag/workspace-chat.ts`:

```ts
import { prisma } from "@/lib/db/client";
import { highestPermissionLevel } from "@/lib/permissions/document";
import { invokeAnswerChain, type ChatModelLike } from "@/lib/rag/answer-chain";
import { getRagModelConfig } from "@/lib/rag/config";
import { assertCurrentEmbeddingIndex, embedText } from "@/lib/rag/embedding-client";
import { createLangfuseCallbackConfig } from "@/lib/rag/langfuse";
import { createChatModel } from "@/lib/rag/model-factory";
import { buildRagPrompt } from "@/lib/rag/prompt";
import { searchSimilarChunks } from "@/lib/rag/vector-store";
import { SERVICE_ERROR_CODES } from "@/lib/service-errors";
import { filterReadableDocuments } from "@/lib/workspace-tree";

export const WORKSPACE_CHAT_ERROR_CODES = {
  MESSAGE_REQUIRED: "MESSAGE_REQUIRED",
} as const;

type WorkspaceChatInput = {
  workspaceSlug: string;
  actorId: string;
};

type SendWorkspaceChatMessageInput = WorkspaceChatInput & {
  message: string;
  selectedDocumentId?: string | null;
};

const RECENT_MESSAGE_LIMIT = 12;
const RETRIEVAL_LIMIT = 60;
const PROMPT_CHUNK_LIMIT = 12;
const MAX_CHUNKS_PER_DOCUMENT = 3;

export async function getOrCreateWorkspaceChatThread(input: WorkspaceChatInput) {
  const workspace = await loadWorkspaceForChat(input);
  const existing = await prisma.aiChatThread.findFirst({
    where: {
      workspaceId: workspace.id,
      userId: input.actorId,
      status: "ACTIVE",
    },
    orderBy: { updatedAt: "desc" },
    include: {
      messages: { orderBy: { createdAt: "asc" }, take: 50 },
    },
  });

  if (existing) return { thread: existing, messages: existing.messages };

  const thread = await prisma.aiChatThread.create({
    data: {
      workspaceId: workspace.id,
      userId: input.actorId,
      lastMessageAt: null,
    },
    include: { messages: true },
  });
  return { thread, messages: thread.messages };
}

export async function sendWorkspaceChatMessage(input: SendWorkspaceChatMessageInput) {
  const message = input.message.trim();
  if (!message) throw new Error(WORKSPACE_CHAT_ERROR_CODES.MESSAGE_REQUIRED);

  const workspace = await loadWorkspaceForChat(input);
  const threadState = await getOrCreateWorkspaceChatThread(input);
  const userMessage = await prisma.aiChatMessage.create({
    data: {
      threadId: threadState.thread.id,
      role: "USER",
      content: message,
      citationsJson: [],
    },
  });

  const modelConfig = getRagModelConfig();
  assertCurrentEmbeddingIndex(modelConfig);
  const embedding = await embedText(message, { config: modelConfig });
  const readableDocumentIds = workspace.readableDocuments.map((document) => document.id);
  const chunks = await searchSimilarChunks({
    workspaceId: workspace.id,
    embeddingModel: modelConfig.embedding.indexId,
    embedding,
    readableDocumentIds,
    limit: RETRIEVAL_LIMIT,
  });
  const promptChunks = capChunksPerDocument(chunks, MAX_CHUNKS_PER_DOCUMENT).slice(0, PROMPT_CHUNK_LIMIT);
  const prompt = buildRagPrompt({ question: buildConversationQuestion(threadState.messages, message), chunks: promptChunks });
  const trace = createLangfuseCallbackConfig({
    enabled: modelConfig.langfuse.enabled,
    captureMode: modelConfig.langfuse.captureMode,
    operation: "rag.workspace_chat",
    chatProvider: modelConfig.chat.provider,
    chatModel: modelConfig.chat.model,
    embeddingProvider: modelConfig.embedding.provider,
    embeddingModel: modelConfig.embedding.indexId,
    embeddingDimensions: modelConfig.embedding.dimensions,
    retrievedChunkCount: promptChunks.length,
    citationDocumentIds: prompt.citations.map((citation) => citation.documentId),
    citationChunkIds: promptChunks.map((chunk) => chunk.id),
    metadata: {
      workspaceSlug: input.workspaceSlug,
      workspaceId: workspace.id,
      threadId: threadState.thread.id,
      actorId: input.actorId,
      selectedDocumentId: input.selectedDocumentId ?? null,
    },
  });
  const answer = await invokeAnswerChain({
    systemPrompt: prompt.system,
    userPrompt: prompt.user,
    chatModel: createChatModel(modelConfig.chat) as ChatModelLike,
    callbacks: trace.callbacks,
    metadata: trace.metadata,
  });
  const assistantMessage = await prisma.aiChatMessage.create({
    data: {
      threadId: threadState.thread.id,
      role: "ASSISTANT",
      content: answer,
      citationsJson: prompt.citations,
      model: modelConfig.chat.model,
    },
  });
  const thread = await prisma.aiChatThread.update({
    where: { id: threadState.thread.id },
    data: { lastMessageAt: new Date() },
  });

  return { thread, userMessage, assistantMessage, citations: prompt.citations };
}

export async function resetWorkspaceChatThread(input: WorkspaceChatInput) {
  const workspace = await loadWorkspaceForChat(input);
  await prisma.aiChatThread.updateMany({
    where: {
      workspaceId: workspace.id,
      userId: input.actorId,
      status: "ACTIVE",
    },
    data: {
      status: "ARCHIVED",
      lastMessageAt: new Date(),
    },
  });
}

async function loadWorkspaceForChat(input: WorkspaceChatInput) {
  const workspace = await prisma.workspace.findFirst({
    where: { slug: input.workspaceSlug },
    include: {
      members: { where: { userId: input.actorId }, take: 1 },
      documents: {
        where: { status: "ACTIVE" },
        orderBy: { updatedAt: "desc" },
      },
    },
  });
  if (!workspace || !workspace.members[0]) {
    throw new Error(SERVICE_ERROR_CODES.WORKSPACE_NOT_FOUND);
  }

  const documentIds = workspace.documents.map((document) => document.id);
  const [documentsWithExplicitPermissions, userDocumentPermissions] =
    documentIds.length > 0
      ? await Promise.all([
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
        ])
      : [[], []];
  const explicitDocumentIds = new Set(
    documentsWithExplicitPermissions.map((permission) => permission.resourceId),
  );
  const permissionsByDocumentId = new Map<string, typeof userDocumentPermissions>();
  for (const permission of userDocumentPermissions) {
    const permissions = permissionsByDocumentId.get(permission.resourceId) ?? [];
    permissions.push(permission);
    permissionsByDocumentId.set(permission.resourceId, permissions);
  }
  const userPermissionsByDocumentId = new Map(
    documentIds.map((documentId) => [
      documentId,
      highestPermissionLevel(
        (permissionsByDocumentId.get(documentId) ?? []).map((permission) => permission.permission),
      ),
    ]),
  );
  const readableDocuments = filterReadableDocuments({
    documents: workspace.documents,
    role: workspace.members[0].role,
    explicitDocumentIds,
    userPermissionsByDocumentId,
  });

  return { ...workspace, readableDocuments };
}

function capChunksPerDocument<TChunk extends { documentId: string }>(
  chunks: TChunk[],
  perDocumentLimit: number,
) {
  const counts = new Map<string, number>();
  return chunks.filter((chunk) => {
    const count = counts.get(chunk.documentId) ?? 0;
    if (count >= perDocumentLimit) return false;
    counts.set(chunk.documentId, count + 1);
    return true;
  });
}

function buildConversationQuestion(
  messages: Array<{ role: string; content: string }>,
  currentMessage: string,
) {
  const recent = messages.slice(-RECENT_MESSAGE_LIMIT);
  if (recent.length === 0) return currentMessage;

  return [
    "Recent conversation:",
    ...recent.map((message) => `${message.role}: ${message.content}`),
    "",
    `Current user message: ${currentMessage}`,
  ].join("\n");
}
```

- [ ] **Step 4: Run workspace chat service tests**

Run: `pnpm exec vitest run tests/rag/workspace-chat.test.ts`

Expected: PASS when the test database is reachable.

- [ ] **Step 5: Commit Task 5**

```bash
git add lib/rag/workspace-chat.ts tests/rag/workspace-chat.test.ts
git commit -m "feat: add workspace chat service"
```

---

### Task 6: Workspace Chat API Routes

**Files:**
- Create: `app/api/workspaces/[workspaceSlug]/assistant/thread/route.ts`
- Create: `app/api/workspaces/[workspaceSlug]/assistant/messages/route.ts`
- Create: `app/api/workspaces/[workspaceSlug]/assistant/thread/reset/route.ts`
- Test: `tests/rag/workspace-chat-route.test.ts`

- [ ] **Step 1: Write failing route tests**

Create `tests/rag/workspace-chat-route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireCurrentUser } from "@/lib/auth/session";
import {
  getOrCreateWorkspaceChatThread,
  resetWorkspaceChatThread,
  sendWorkspaceChatMessage,
  WORKSPACE_CHAT_ERROR_CODES,
} from "@/lib/rag/workspace-chat";
import { GET } from "@/app/api/workspaces/[workspaceSlug]/assistant/thread/route";
import { POST as POST_MESSAGE } from "@/app/api/workspaces/[workspaceSlug]/assistant/messages/route";
import { POST as POST_RESET } from "@/app/api/workspaces/[workspaceSlug]/assistant/thread/reset/route";

vi.mock("@/lib/auth/session", () => ({
  requireCurrentUser: vi.fn(),
}));

vi.mock("@/lib/rag/workspace-chat", () => ({
  WORKSPACE_CHAT_ERROR_CODES: { MESSAGE_REQUIRED: "MESSAGE_REQUIRED" },
  getOrCreateWorkspaceChatThread: vi.fn(),
  sendWorkspaceChatMessage: vi.fn(),
  resetWorkspaceChatThread: vi.fn(),
}));

describe("workspace chat routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireCurrentUser).mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      name: "User",
    });
    vi.mocked(getOrCreateWorkspaceChatThread).mockResolvedValue({
      thread: { id: "thread-1" },
      messages: [],
    } as never);
    vi.mocked(sendWorkspaceChatMessage).mockResolvedValue({
      thread: { id: "thread-1" },
      userMessage: { id: "message-1", role: "USER", content: "Question" },
      assistantMessage: { id: "message-2", role: "ASSISTANT", content: "Answer" },
      citations: [],
    } as never);
    vi.mocked(resetWorkspaceChatThread).mockResolvedValue(undefined);
  });

  it("loads the current user workspace thread", async () => {
    const response = await GET(new Request("http://test.local"), {
      params: Promise.resolve({ workspaceSlug: "company-handbook" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      thread: { id: "thread-1" },
      messages: [],
    });
    expect(getOrCreateWorkspaceChatThread).toHaveBeenCalledWith({
      workspaceSlug: "company-handbook",
      actorId: "user-1",
    });
  });

  it("sends a non-streaming workspace chat message", async () => {
    const response = await POST_MESSAGE(jsonRequest({ message: "Question" }), {
      params: Promise.resolve({ workspaceSlug: "company-handbook" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      assistantMessage: { content: "Answer" },
    });
    expect(sendWorkspaceChatMessage).toHaveBeenCalledWith({
      workspaceSlug: "company-handbook",
      actorId: "user-1",
      message: "Question",
    });
  });

  it("maps blank messages to 400", async () => {
    vi.mocked(sendWorkspaceChatMessage).mockRejectedValueOnce(
      new Error(WORKSPACE_CHAT_ERROR_CODES.MESSAGE_REQUIRED),
    );

    const response = await POST_MESSAGE(jsonRequest({ message: "   " }), {
      params: Promise.resolve({ workspaceSlug: "company-handbook" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "MESSAGE_REQUIRED" });
  });

  it("archives the active thread on reset", async () => {
    const response = await POST_RESET(new Request("http://test.local", { method: "POST" }), {
      params: Promise.resolve({ workspaceSlug: "company-handbook" }),
    });

    expect(response.status).toBe(200);
    expect(resetWorkspaceChatThread).toHaveBeenCalledWith({
      workspaceSlug: "company-handbook",
      actorId: "user-1",
    });
  });
});

function jsonRequest(body: unknown) {
  return new Request("http://test.local", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
```

- [ ] **Step 2: Run failing route tests**

Run: `pnpm exec vitest run tests/rag/workspace-chat-route.test.ts`

Expected: FAIL with route module import errors.

- [ ] **Step 3: Implement thread route**

Create `app/api/workspaces/[workspaceSlug]/assistant/thread/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/session";
import { getOrCreateWorkspaceChatThread } from "@/lib/rag/workspace-chat";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ workspaceSlug: string }> },
) {
  const user = await requireCurrentUser();
  const { workspaceSlug } = await params;
  const result = await getOrCreateWorkspaceChatThread({
    workspaceSlug,
    actorId: user.id,
  });

  return NextResponse.json(result);
}
```

- [ ] **Step 4: Implement messages route**

Create `app/api/workspaces/[workspaceSlug]/assistant/messages/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/session";
import {
  sendWorkspaceChatMessage,
  WORKSPACE_CHAT_ERROR_CODES,
} from "@/lib/rag/workspace-chat";
import { isRagRuntimeError } from "@/lib/rag/errors";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceSlug: string }> },
) {
  const user = await requireCurrentUser();
  const { workspaceSlug } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    message?: unknown;
    selectedDocumentId?: unknown;
  };

  try {
    const result = await sendWorkspaceChatMessage({
      workspaceSlug,
      actorId: user.id,
      message: typeof body.message === "string" ? body.message : "",
      ...(typeof body.selectedDocumentId === "string"
        ? { selectedDocumentId: body.selectedDocumentId }
        : {}),
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === WORKSPACE_CHAT_ERROR_CODES.MESSAGE_REQUIRED) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (isRagRuntimeError(message)) {
      return NextResponse.json({ error: "AI_UNAVAILABLE" }, { status: 503 });
    }
    return NextResponse.json({ error: "WORKSPACE_CHAT_FAILED" }, { status: 500 });
  }
}
```

- [ ] **Step 5: Implement reset route**

Create `app/api/workspaces/[workspaceSlug]/assistant/thread/reset/route.ts`:

```ts
import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/session";
import { resetWorkspaceChatThread } from "@/lib/rag/workspace-chat";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ workspaceSlug: string }> },
) {
  const user = await requireCurrentUser();
  const { workspaceSlug } = await params;
  await resetWorkspaceChatThread({
    workspaceSlug,
    actorId: user.id,
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: Run route tests**

Run: `pnpm exec vitest run tests/rag/workspace-chat-route.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit Task 6**

```bash
git add app/api/workspaces/'[workspaceSlug]'/assistant tests/rag/workspace-chat-route.test.ts
git commit -m "feat: add workspace chat api routes"
```

---

### Task 7: Floating Workspace Chatbot UI

**Files:**
- Create: `components/workspace-chatbot.tsx`
- Test: `tests/components/workspace-chatbot.test.tsx`
- Modify: `app/workspaces/[workspaceSlug]/page.tsx`

- [ ] **Step 1: Write failing chatbot UI tests**

Create `tests/components/workspace-chatbot.test.tsx`:

```tsx
// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceChatbot } from "@/components/workspace-chatbot";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/assistant/thread")) {
      return new Response(JSON.stringify({ thread: { id: "thread-1" }, messages: [] }));
    }
    if (url.endsWith("/assistant/messages")) {
      return new Response(JSON.stringify({
        assistantMessage: { id: "message-2", role: "ASSISTANT", content: "Workspace answer." },
        citations: [{ index: 1, documentTitle: "Handbook", headingPath: "Policy" }],
      }));
    }
    if (url.endsWith("/assistant/thread/reset")) {
      return new Response(JSON.stringify({ ok: true }));
    }
    throw new Error(`Unexpected fetch ${url} ${init?.method ?? "GET"}`);
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("WorkspaceChatbot", () => {
  it("opens, sends a message, and renders the assistant answer", async () => {
    render(<WorkspaceChatbot workspaceSlug="company-handbook" selectedDocumentId="doc-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Open workspace AI chat" }));
    expect(await screen.findByText("Workspace AI")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Workspace chat message"), {
      target: { value: "What is the policy?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(screen.getByText("Thinking...")).toBeTruthy();
    expect(await screen.findByText("Workspace answer.")).toBeTruthy();
    expect(screen.getByText("[1] Handbook > Policy")).toBeTruthy();
  });

  it("resets the visible conversation", async () => {
    render(<WorkspaceChatbot workspaceSlug="company-handbook" selectedDocumentId={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Open workspace AI chat" }));
    fireEvent.click(await screen.findByRole("button", { name: "Reset conversation" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/workspaces/company-handbook/assistant/thread/reset",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });
});
```

- [ ] **Step 2: Run failing UI tests**

Run: `pnpm exec vitest run tests/components/workspace-chatbot.test.tsx`

Expected: FAIL with missing `WorkspaceChatbot`.

- [ ] **Step 3: Implement floating chatbot component**

Create `components/workspace-chatbot.tsx`:

```tsx
"use client";

import { FormEvent, useEffect, useState } from "react";
import { Bot, Send, X, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThinkingIndicator } from "@/components/ai/thinking-indicator";

type ChatMessage = {
  id?: string;
  role: "USER" | "ASSISTANT";
  content: string;
  citationsJson?: ChatCitation[];
};

type ChatCitation = {
  index?: number;
  documentTitle?: string;
  title?: string;
  headingPath?: string | string[] | null;
};

type WorkspaceChatbotProps = {
  workspaceSlug: string;
  selectedDocumentId: string | null;
};

export function WorkspaceChatbot({ workspaceSlug, selectedDocumentId }: WorkspaceChatbotProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const trimmedInput = input.trim();

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    fetch(`/api/workspaces/${workspaceSlug}/assistant/thread`)
      .then((response) => response.json())
      .then((body: { messages?: ChatMessage[] }) => {
        if (!cancelled) setMessages(body.messages ?? []);
      })
      .catch(() => {
        if (!cancelled) setError("Workspace AI is unavailable.");
      });

    return () => {
      cancelled = true;
    };
  }, [open, workspaceSlug]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trimmedInput || isLoading) return;

    const userMessage: ChatMessage = { role: "USER", content: trimmedInput };
    setMessages((current) => [...current, userMessage]);
    setInput("");
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/workspaces/${workspaceSlug}/assistant/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmedInput,
          ...(selectedDocumentId ? { selectedDocumentId } : {}),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "WORKSPACE_CHAT_FAILED");

      setMessages((current) => [
        ...current,
        {
          ...(body.assistantMessage ?? {}),
          role: "ASSISTANT",
          content: body.assistantMessage?.content ?? "",
          citationsJson: body.citations ?? body.assistantMessage?.citationsJson ?? [],
        },
      ]);
    } catch {
      setError("Workspace AI is unavailable.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleReset() {
    await fetch(`/api/workspaces/${workspaceSlug}/assistant/thread/reset`, { method: "POST" });
    setMessages([]);
    setError("");
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {open ? (
        <section className="flex h-[520px] w-[360px] max-w-[calc(100vw-2rem)] flex-col rounded-md border border-border bg-white shadow-xl">
          <header className="flex h-12 items-center justify-between border-b border-border px-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Bot className="h-4 w-4" aria-hidden="true" />
              Workspace AI
            </div>
            <div className="flex items-center gap-1">
              <button type="button" aria-label="Reset conversation" className="rounded p-1 text-slate-500 hover:bg-slate-100" onClick={handleReset}>
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
              </button>
              <button type="button" aria-label="Close workspace AI chat" className="rounded p-1 text-slate-500 hover:bg-slate-100" onClick={() => setOpen(false)}>
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </header>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3 text-sm">
            {messages.map((message, index) => (
              <div key={message.id ?? `${message.role}-${index}`} className={message.role === "USER" ? "text-right" : "text-left"}>
                <div className={message.role === "USER" ? "inline-block rounded-md bg-ink px-3 py-2 text-white" : "inline-block rounded-md bg-slate-100 px-3 py-2 text-slate-800"}>
                  <p className="whitespace-pre-wrap">{message.content}</p>
                </div>
                {message.role === "ASSISTANT" && message.citationsJson?.length ? (
                  <ol className="mt-1 space-y-1 text-xs text-slate-500">
                    {message.citationsJson.map((citation, citationIndex) => (
                      <li key={`${citation.documentTitle ?? citation.title ?? "citation"}-${citationIndex}`}>
                        [{citation.index ?? citationIndex + 1}] {citation.documentTitle ?? citation.title ?? "Saved document"}
                        {formatHeadingPath(citation.headingPath)}
                      </li>
                    ))}
                  </ol>
                ) : null}
              </div>
            ))}
            <ThinkingIndicator active={isLoading} />
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
          </div>
          <form className="flex gap-2 border-t border-border p-3" onSubmit={handleSubmit}>
            <input
              aria-label="Workspace chat message"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              className="min-w-0 flex-1 rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-ink"
              placeholder="Ask across this workspace"
            />
            <Button type="submit" aria-label="Send message" disabled={!trimmedInput || isLoading} className="h-9 w-9 px-0">
              <Send className="h-4 w-4" aria-hidden="true" />
            </Button>
          </form>
        </section>
      ) : (
        <button
          type="button"
          aria-label="Open workspace AI chat"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-ink text-white shadow-lg"
          onClick={() => setOpen(true)}
        >
          <Bot className="h-5 w-5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function formatHeadingPath(headingPath: ChatCitation["headingPath"]) {
  if (Array.isArray(headingPath)) {
    return headingPath.length > 0 ? ` > ${headingPath.join(" > ")}` : "";
  }
  return headingPath ? ` > ${headingPath}` : "";
}
```

- [ ] **Step 4: Mount chatbot in workspace page**

Modify `app/workspaces/[workspaceSlug]/page.tsx`:

```tsx
import { WorkspaceChatbot } from "@/components/workspace-chatbot";
```

Wrap the existing `AppShell` return in a fragment and render the chatbot as a
workspace-level sibling after `AppShell`. Keep the `AppShell` props and children
unchanged.

```tsx
<WorkspaceChatbot
  workspaceSlug={workspaceSlug}
  selectedDocumentId={selectedDocument?.id ?? null}
/>
```

- [ ] **Step 5: Run chatbot UI tests**

Run: `pnpm exec vitest run tests/components/workspace-chatbot.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit Task 7**

```bash
git add components/workspace-chatbot.tsx app/workspaces/'[workspaceSlug]'/page.tsx tests/components/workspace-chatbot.test.tsx
git commit -m "feat: add floating workspace chatbot"
```

---

### Task 8: Verification, Wiki, And PR-Ready Cleanup

**Files:**
- Modify: `wiki/RAG Process Workflow.md`
- Modify: `wiki/Munjib.md`
- Modify: `wiki/Project PRD.md`
- Modify: `wiki/index.md`
- Modify: `wiki/log.md`
- Modify: `wiki/manifest.json`

- [ ] **Step 1: Run focused verification**

Run:

```bash
pnpm exec vitest run tests/rag/document-context.test.ts tests/rag/prompt.test.ts tests/rag/ask-route.test.ts tests/rag/langfuse.test.ts tests/rag/workspace-chat-route.test.ts tests/components/thinking-indicator.test.tsx tests/components/document-editor-preview.test.tsx tests/components/workspace-chatbot.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run DB-backed verification when Postgres is available**

Run:

```bash
pnpm exec vitest run tests/rag/ask.test.ts tests/rag/workspace-chat.test.ts
```

Expected: PASS. If the command fails because Postgres is not reachable, start the repo Postgres service and rerun before claiming DB-backed coverage.

- [ ] **Step 3: Run TypeScript**

Run: `pnpm exec tsc --noEmit --pretty false`

Expected: PASS.

- [ ] **Step 4: Update wiki pages**

Update wiki pages so current implementation matches source:

```md
Issue #104 implementation changes Ask AI's default path from retrieval-first RAG to current-document direct context. The existing `DocumentChunk` pgvector store remains in place and is reused by the workspace chatbot. The chatbot stores user/workspace conversation history in `AiChatThread` and `AiChatMessage`, returns non-streaming assistant responses, and uses the shared English elapsed-time Thinking indicator while waiting.
```

Add source evidence to the relevant wiki pages:

```md
- GitHub issue #104
- `docs/superpowers/specs/2026-06-15-ai-assistant-accuracy-and-workspace-chatbot-design.md`
- `docs/superpowers/plans/2026-06-15-ai-assistant-accuracy-and-workspace-chatbot.md`
- `lib/rag/document-context.ts`
- `lib/rag/ask.ts`
- `lib/rag/workspace-chat.ts`
- `components/ai/thinking-indicator.tsx`
- `components/workspace-chatbot.tsx`
- `prisma/schema.prisma`
- `app/api/workspaces/[workspaceSlug]/assistant/*`
```

- [ ] **Step 5: Run wiki maintenance commands**

Run:

```bash
pnpm wiki:install-hooks
pnpm wiki:sync-plan --staged
pnpm wiki:manifest
pnpm wiki:lint
pnpm wiki:sync-check --staged
```

Expected: all commands exit 0. `wiki:lint` may continue to warn about the existing unresolved image link in `wiki/designs/sidebar.md`; do not treat that as a new failure unless the warning changes.

- [ ] **Step 6: Commit wiki and final cleanup**

```bash
git add wiki/Munjib.md "wiki/Project PRD.md" "wiki/RAG Process Workflow.md" wiki/index.md wiki/log.md wiki/manifest.json
git commit -m "docs: update ai assistant workflow wiki"
```

- [ ] **Step 7: Final local status**

Run: `git status --short --branch`

Expected: clean working tree on `issue-104-ai-assistant-accuracy-and-workspace-chatbot`.

---

## PR Workflow Reminder

After implementation tasks are complete, follow the repository completion workflow:

1. Run all relevant verification commands and fix failures.
2. Stage source changes and wiki maintenance.
3. Run `pnpm wiki:install-hooks`, `pnpm wiki:sync-plan --staged`, `pnpm wiki:manifest`, `pnpm wiki:lint`, and `pnpm wiki:sync-check --staged`.
4. Commit, push, create the PR, mark it ready or request review.
5. Wait at least 5 minutes.
6. Re-check PR review submissions, unresolved review threads, inline comments, and CI/check status.
7. Fix actionable feedback or failing checks on the same branch.
