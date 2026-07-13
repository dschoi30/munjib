import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import {
  ATTACHMENT_LIFECYCLE_ACTIONS,
  ATTACHMENT_LIFECYCLE_CONTRACT_FORMAT,
  ATTACHMENT_LIFECYCLE_CONTRACT_VERSION,
  ATTACHMENT_LIFECYCLE_DEFERRED,
  ATTACHMENT_LIFECYCLE_DEPENDENCIES,
  ATTACHMENT_LIFECYCLE_INVARIANTS,
  AttachmentLifecycleContractError,
  parseAttachmentLifecycleReadinessContract,
  type AttachmentLifecycleReadinessContract,
} from "@/lib/attachments/lifecycle-contract";

const completeContract = (): AttachmentLifecycleReadinessContract => ({
  format: ATTACHMENT_LIFECYCLE_CONTRACT_FORMAT,
  version: ATTACHMENT_LIFECYCLE_CONTRACT_VERSION,
  phases: {
    phaseA: {
      mode: "PREPARATION_ONLY",
      required: true,
      dependencies: [...ATTACHMENT_LIFECYCLE_DEPENDENCIES.phaseA],
      allowedActions: [...ATTACHMENT_LIFECYCLE_ACTIONS.phaseA],
    },
    phaseB: {
      mode: "CANDIDATE_ISOLATED",
      required: true,
      dependencies: [...ATTACHMENT_LIFECYCLE_DEPENDENCIES.phaseB],
      allowedActions: [...ATTACHMENT_LIFECYCLE_ACTIONS.phaseB],
    },
  },
  invariants: [...ATTACHMENT_LIFECYCLE_INVARIANTS],
  deferred: [...ATTACHMENT_LIFECYCLE_DEFERRED],
});

describe("attachment lifecycle readiness contract", () => {
  test("matches the checked-in public contract artifact", () => {
    const artifact = JSON.parse(
      readFileSync(join(process.cwd(), "deploy/attachments/attachment-lifecycle-readiness-v1.json"), "utf8"),
    ) as unknown;

    expect(parseAttachmentLifecycleReadinessContract(artifact)).toEqual(
      parseAttachmentLifecycleReadinessContract(completeContract()),
    );
  });

  test("keeps the destructive lifecycle outside the preparation contract", () => {
    const parsed = parseAttachmentLifecycleReadinessContract(completeContract());

    expect(parsed.phases.phaseA.mode).toBe("PREPARATION_ONLY");
    expect(parsed.phases.phaseA.allowedActions).toEqual([
      "inventory-db-rows",
      "verify-storage-key-shape",
      "dry-run-reconcile",
    ]);
    expect(parsed.invariants).toContain("v1-never-deletes-attachment-bytes");
    expect(parsed.deferred).toContain("production-orphan-gc");
    expect(JSON.stringify(parsed)).not.toMatch(/PASS|ACCEPTED|production-ready/i);
  });

  test("requires the document, ACL, database, and provider dependency gates", () => {
    const parsed = parseAttachmentLifecycleReadinessContract(completeContract());

    expect(parsed.phases.phaseA.dependencies).toEqual([
      "issue-2-document-crud",
      "issue-4-editor-paste",
      "issue-5-link-reconciliation",
      "issue-6-document-authorization",
      "leaf-13b-database-authority",
    ]);
    expect(parsed.phases.phaseB.dependencies.at(-1)).toBe("issue-164-ai-provider-policy-v2");
  });

  test("rejects unknown and sensitive-looking fields at any depth", () => {
    expect(() =>
      parseAttachmentLifecycleReadinessContract({ ...completeContract(), unexpected: true }),
    ).toThrow(AttachmentLifecycleContractError);

    const nestedSecret = {
      ...completeContract(),
      phases: {
        ...completeContract().phases,
        phaseA: { ...completeContract().phases.phaseA, secret: "never" },
      },
    };
    expect(() => parseAttachmentLifecycleReadinessContract(nestedSecret)).toThrow(
      /sensitive|unknown/i,
    );
  });

  test("rejects dependency, invariant, action, and deferred ordering drift", () => {
    const contract = completeContract();
    expect(() =>
      parseAttachmentLifecycleReadinessContract({
        ...contract,
        phases: {
          ...contract.phases,
          phaseA: {
            ...contract.phases.phaseA,
            dependencies: [...contract.phases.phaseA.dependencies].reverse(),
          },
        },
      }),
    ).toThrow(/order|canonical/i);

    expect(() =>
      parseAttachmentLifecycleReadinessContract({
        ...contract,
        deferred: [...contract.deferred].reverse(),
      }),
    ).toThrow(/order|canonical/i);
  });
});
