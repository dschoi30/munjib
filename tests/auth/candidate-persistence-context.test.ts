import { describe, expect, it } from "vitest";
import {
  closeCandidatePersistenceRequestScope,
  getCandidatePersistenceCell,
  readCandidatePersistenceContext,
  runCandidatePersistenceRequestScope,
} from "@/lib/auth/candidate-persistence-context";

describe("candidate persistence request scope", () => {
  it("starts empty and closes after the callback", async () => {
    await runCandidatePersistenceRequestScope(async () => {
      expect(getCandidatePersistenceCell()?.state).toBe("EMPTY");
      expect(readCandidatePersistenceContext()).toBeNull();
    });
    expect(getCandidatePersistenceCell()).toBeUndefined();
  });

  it("marks an explicit scope closed", async () => {
    await runCandidatePersistenceRequestScope(async () => {
      closeCandidatePersistenceRequestScope();
      expect(getCandidatePersistenceCell()?.state).toBe("CLOSED");
    });
  });
});
