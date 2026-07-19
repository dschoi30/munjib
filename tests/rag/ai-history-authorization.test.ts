import { describe, expect, it, vi } from "vitest";
import {
  AI_HISTORY_SOURCE_FREE_PROOF,
  decideAiHistoryVisibility,
  parseAiHistoryLineage,
  toAiHistoryMessageDto,
  type AiHistoryMessageRecord,
} from "@/lib/rag/ai-history-authorization";

const message: AiHistoryMessageRecord = {
  id: "message-secret-id",
  role: "ASSISTANT",
  content: "Confidential answer from the restricted runbook.",
  citations: [{ documentId: "secret-document", title: "Restricted runbook" }],
  contextMeta: {
    lineage: {
      version: 1,
      kind: "source-backed",
      sources: [{ documentId: "secret-document", chunkId: "secret-chunk" }],
    },
  },
  model: "provider/private-model",
  createdAt: new Date("2026-07-13T00:00:00.000Z"),
};

describe("AI history lineage and visibility contract", () => {
  it("accepts only explicit source-backed lineage with non-empty document/chunk pairs", () => {
    expect(
      parseAiHistoryLineage({
        lineage: {
          version: 1,
          kind: "source-backed",
          sources: [{ documentId: "doc-1", chunkId: "chunk-1" }],
        },
      }),
    ).toEqual({
      version: 1,
      kind: "source-backed",
      sources: [{ documentId: "doc-1", chunkId: "chunk-1" }],
    });

    expect(
      parseAiHistoryLineage({
        retrievedChunkCount: 1,
        citationChunkIds: ["chunk-1"],
      }),
    ).toEqual({ kind: "legacy-unproven" });
    expect(
      parseAiHistoryLineage({
        lineage: { version: 1, kind: "source-backed", sources: [] },
      }),
    ).toEqual({ kind: "legacy-unproven" });

    const sparseSources: Array<unknown> = [];
    sparseSources.length = 1;
    expect(
      parseAiHistoryLineage({
        lineage: { version: 1, kind: "source-backed", sources: sparseSources },
      }),
    ).toEqual({ kind: "legacy-unproven" });
  });

  it("requires an explicit source-free proof instead of inferring it from missing citations", () => {
    expect(
      parseAiHistoryLineage({
        lineage: { version: 1, kind: "source-free", proof: AI_HISTORY_SOURCE_FREE_PROOF },
      }),
    ).toEqual({ version: 1, kind: "source-free", proof: AI_HISTORY_SOURCE_FREE_PROOF });
    expect(parseAiHistoryLineage({ lineage: { version: 1, kind: "source-free" } })).toEqual({
      kind: "legacy-unproven",
    });
  });

  it("hides unproven legacy lineage without invoking source authorization", () => {
    const authorizeSource = vi.fn(() => true);
    const decision = decideAiHistoryVisibility({
      lineage: parseAiHistoryLineage({ retrievedChunkCount: 0 }),
      authorizeSource,
    });

    expect(decision).toEqual({ visibility: "tombstone" });
    expect(authorizeSource).not.toHaveBeenCalled();
  });

  it("requires every source in a derived turn to remain authorized", () => {
    const lineage = parseAiHistoryLineage(message.contextMeta);
    expect(
      decideAiHistoryVisibility({ lineage, authorizeSource: () => true }),
    ).toMatchObject({ visibility: "visible" });
    expect(
      decideAiHistoryVisibility({ lineage, authorizeSource: () => false }),
    ).toEqual({ visibility: "tombstone" });
  });

  it("fails closed when the canonical source authority is unavailable", () => {
    const lineage = parseAiHistoryLineage(message.contextMeta);
    expect(
      decideAiHistoryVisibility({
        lineage,
        authorizeSource: () => {
          throw new Error("authority unavailable");
        },
      }),
    ).toEqual({ visibility: "tombstone" });
  });

  it("allows source-free turns only with the explicit proof and does not need source lookup", () => {
    const authorizeSource = vi.fn(() => {
      throw new Error("source lookup must not run for source-free proof");
    });
    const decision = decideAiHistoryVisibility({
      lineage: parseAiHistoryLineage({
        lineage: { version: 1, kind: "source-free", proof: AI_HISTORY_SOURCE_FREE_PROOF },
      }),
      authorizeSource,
    });

    expect(decision).toMatchObject({ visibility: "visible" });
    expect(authorizeSource).not.toHaveBeenCalled();
  });

  it("fails closed when a source-free assistant row still carries source data", () => {
    const contextMeta = {
      lineage: { version: 1, kind: "source-free", proof: AI_HISTORY_SOURCE_FREE_PROOF },
    };
    const decision = decideAiHistoryVisibility({
      lineage: parseAiHistoryLineage(contextMeta),
      authorizeSource: () => true,
    });
    const sourceFreeMessage = {
      ...message,
      citations: null,
      contextMeta,
    };

    expect(
      toAiHistoryMessageDto(
        { ...sourceFreeMessage, citations: [{ documentId: "stale-document" }] },
        decision,
      ),
    ).toMatchObject({ visibility: "tombstone" });
    expect(
      toAiHistoryMessageDto(
        {
          ...sourceFreeMessage,
          contextMeta: { ...contextMeta, citationChunkIds: ["stale-chunk"] },
        },
        decision,
      ),
    ).toMatchObject({ visibility: "tombstone" });
  });

  it("returns a non-enumerating, shape-stable tombstone", () => {
    const dto = toAiHistoryMessageDto(message, { visibility: "tombstone" });

    expect(dto).toEqual({
      visibility: "tombstone",
      role: "ASSISTANT",
      content: "",
      citations: [],
      contextMeta: null,
      model: null,
      createdAt: null,
    });
    expect(dto).not.toHaveProperty("id");
    expect(JSON.stringify(dto)).not.toContain("secret-document");
    expect(JSON.stringify(dto)).not.toContain("secret-chunk");
    expect(JSON.stringify(dto)).not.toContain("Confidential");
    expect(JSON.stringify(dto)).not.toContain("denied");
  });

  it("preserves visible fields only after a positive decision", () => {
    const lineage = parseAiHistoryLineage(message.contextMeta);
    const dto = toAiHistoryMessageDto(
      message,
      decideAiHistoryVisibility({ lineage, authorizeSource: () => true }),
    );

    expect(dto).toEqual({
      visibility: "visible",
      id: "message-secret-id",
      role: "ASSISTANT",
      content: message.content,
      citations: message.citations,
      contextMeta: message.contextMeta,
      model: message.model,
      createdAt: "2026-07-13T00:00:00.000Z",
    });
  });

  it("fails closed when source-backed metadata names an undeclared source", () => {
    const lineage = parseAiHistoryLineage(message.contextMeta);
    const decision = decideAiHistoryVisibility({ lineage, authorizeSource: () => true });

    expect(toAiHistoryMessageDto({ ...message, citations: [{ documentId: "other-document" }] }, decision))
      .toMatchObject({ visibility: "tombstone" });
    expect(toAiHistoryMessageDto({
      ...message,
      contextMeta: { ...(message.contextMeta as object), citationChunkIds: ["other-chunk"] },
    }, decision)).toMatchObject({ visibility: "tombstone" });
    expect(toAiHistoryMessageDto({
      ...message,
      contextMeta: {
        lineage: {
          version: 1,
          kind: "source-backed",
          sources: [{ documentId: "secret-document", chunkId: "secret-chunk", title: "stale" }],
          deniedDocumentId: "other-document",
        },
      },
    }, decision)).toMatchObject({ visibility: "tombstone" });
  });

  it("does not serialize a different message with a detached visible decision", () => {
    const lineage = parseAiHistoryLineage(message.contextMeta);
    const decision = decideAiHistoryVisibility({ lineage, authorizeSource: () => true });
    const detachedMessage = {
      ...message,
      id: "different-message-id",
      contextMeta: {
        lineage: {
          version: 1,
          kind: "source-backed",
          sources: [{ documentId: "other-document", chunkId: "other-chunk" }],
        },
      },
      content: "Other confidential answer.",
    };

    expect(toAiHistoryMessageDto(detachedMessage, decision)).toEqual({
      visibility: "tombstone",
      role: "ASSISTANT",
      content: "",
      citations: [],
      contextMeta: null,
      model: null,
      createdAt: null,
    });
  });

  it("keeps ordinary USER rows visible when an assistant decision is tombstoned", () => {
    const lineage = parseAiHistoryLineage(message.contextMeta);
    const userMessage = {
      ...message,
      role: "USER" as const,
      content: "User question",
      contextMeta: null,
      citations: null,
      model: null,
    };

    expect(toAiHistoryMessageDto(userMessage, { visibility: "tombstone" })).toEqual({
      visibility: "visible",
      id: "message-secret-id",
      role: "USER",
      content: "User question",
      citations: null,
      contextMeta: null,
      model: null,
      createdAt: "2026-07-13T00:00:00.000Z",
    });

    expect(
      toAiHistoryMessageDto(
        { ...userMessage, contextMeta: message.contextMeta },
        decideAiHistoryVisibility({ lineage, authorizeSource: () => true }),
      ),
    ).toMatchObject({
      visibility: "visible",
      role: "USER",
      content: "User question",
    });
  });
});
