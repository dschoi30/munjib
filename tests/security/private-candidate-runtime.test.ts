import { describe, expect, test } from "vitest";
import {
  assertAttachmentWritesAllowed,
  assertCandidateSideEffectsDisabled,
  assertExternalProvidersAllowed,
  assertIndexingAllowed,
  isPrivateCandidateRuntime,
} from "../../lib/runtime/private-candidate";

describe("private candidate side-effect runtime gate", () => {
  test("requires every candidate side-effect flag to be fail-closed", () => {
    const env = {
      MUNJIB_CANDIDATE: "true",
      MUNJIB_DISABLE_EMAIL: "true",
      MUNJIB_DISABLE_OAUTH_CALLBACKS: "true",
      MUNJIB_DISABLE_BACKGROUND_JOBS: "true",
      MUNJIB_DISABLE_INDEXING: "true",
      MUNJIB_DISABLE_EXTERNAL_PROVIDERS: "true",
      MUNJIB_ATTACHMENTS_WRITABLE: "false",
    };
    expect(isPrivateCandidateRuntime(env)).toBe(true);
    expect(() => assertCandidateSideEffectsDisabled(env)).not.toThrow();
  });

  test("rejects a candidate that leaves any side-effect path enabled", () => {
    expect(() => assertCandidateSideEffectsDisabled({
      MUNJIB_CANDIDATE: "true",
      MUNJIB_DISABLE_EMAIL: "false",
    })).toThrow(/SIDE_EFFECTS/i);
  });

  test("blocks attachment writes, indexing, and provider construction", () => {
    const env = {
      MUNJIB_CANDIDATE: "true",
      MUNJIB_DISABLE_EMAIL: "true",
      MUNJIB_DISABLE_OAUTH_CALLBACKS: "true",
      MUNJIB_DISABLE_BACKGROUND_JOBS: "true",
      MUNJIB_DISABLE_INDEXING: "true",
      MUNJIB_DISABLE_EXTERNAL_PROVIDERS: "true",
      MUNJIB_ATTACHMENTS_WRITABLE: "false",
    };
    expect(() => assertAttachmentWritesAllowed(env)).toThrow(/ATTACHMENT_WRITES_DISABLED/);
    expect(() => assertIndexingAllowed(env)).toThrow(/INDEXING_DISABLED/);
    expect(() => assertExternalProvidersAllowed(env)).toThrow(/EXTERNAL_PROVIDERS_DISABLED/);
  });
});
