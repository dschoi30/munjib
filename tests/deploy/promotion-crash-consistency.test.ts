import { describe, expect, test } from "vitest";
import {
  advancePromotion,
  promoteBlueGreen,
  reconcilePromotion,
  type PromotionState,
} from "../../scripts/deploy/reconcile-promotion";

const base: PromotionState = {
  generation: "generation-41",
  candidateGeneration: "generation-42",
  phase: "IDLE",
  currentDigest: "sha256:" + "a".repeat(64),
  candidateDigest: "sha256:" + "b".repeat(64),
  rollbackDigest: "sha256:" + "c".repeat(64),
  floor: 41,
  candidateFloor: 42,
  rollbackFloor: 41,
  rollbackGeneration: "generation-40",
  candidateQualified: true,
  privateBindingsVerified: true,
  migrationVerified: true,
  publicSmokeVerified: false,
  expectedCurrentGeneration: "generation-41",
};

describe("crash-safe blue/green promotion", () => {
  test("uses PREPARED -> TRAFFIC_SWITCHED -> COMMITTED and never skips qualification", () => {
    const prepared = advancePromotion(base, "PREPARE");
    expect(prepared.phase).toBe("PREPARED");

    const switched = advancePromotion(prepared, "SWITCH_TRAFFIC");
    expect(switched.phase).toBe("TRAFFIC_SWITCHED");

    const committed = advancePromotion({ ...switched, publicSmokeVerified: true }, "COMMIT");
    expect(committed.phase).toBe("COMMITTED");
  });

  test("pre-switch interruption removes the candidate and returns to idle", () => {
    const prepared = advancePromotion(base, "PREPARE");
    expect(reconcilePromotion({ ...prepared, interruptedAt: "before-switch" })).toMatchObject({
      phase: "IDLE",
      candidateRemoved: true,
    });
  });

  test("post-switch interruption does not lower the floor or silently roll back", () => {
    const switched = advancePromotion(
      { ...advancePromotion(base, "PREPARE"), publicSmokeVerified: true },
      "SWITCH_TRAFFIC",
    );
    const recovered = reconcilePromotion({ ...switched, interruptedAt: "after-switch" });
    expect(recovered.phase).toBe("TRAFFIC_SWITCHED");
    expect(recovered.floor).toBe(41);
    expect(recovered.maintenanceRequired).toBe(true);
  });

  test("rejects rollback below the monotonic security floor", () => {
    expect(() => advancePromotion({ ...base, floor: 42 }, "ROLLBACK")).toThrow(
      /floor/i,
    );
  });

  test("runs the broker-owned migration, qualification, fsync, switch, and smoke order", async () => {
    const events: string[] = [];
    const actions = {
      lock: () => { events.push("lock"); },
      unlock: () => { events.push("unlock"); },
      verifyCurrent: () => { events.push("current"); },
      installHostBundle: () => { events.push("host-bundle"); },
      runMigrator: (args: { searchPath: string; discriminator: string }) => {
        events.push(`migrator:${args.searchPath}:${args.discriminator}`);
      },
      finalizeOwnership: () => { events.push("ownership"); },
      stageCandidate: () => { events.push("stage"); },
      runSmoke: (smoke: string) => { events.push(`smoke:${smoke}`); },
      fsync: (phase: string) => { events.push(`fsync:${phase}`); },
      switchBackend: () => { events.push("switch"); },
      installPointers: () => { events.push("pointers"); },
      forceRecreateChangedServices: () => { events.push("recreate"); },
      removeCandidate: () => { events.push("remove"); },
    };
    const result = await promoteBlueGreen(
      { ...base, hostBundleDigest: "sha256:" + "d".repeat(64) },
      actions,
    );
    expect(result.phase).toBe("COMMITTED");
    expect(events.indexOf("fsync:PREPARED")).toBeLessThan(events.indexOf("switch"));
    expect(events.indexOf("fsync:TRAFFIC_SWITCHED")).toBeLessThan(events.indexOf("pointers"));
    expect(events.indexOf("pointers")).toBeLessThan(events.indexOf("smoke:public"));
    expect(events.at(-1)).toBe("unlock");
  });

  test("removes a candidate on any pre-switch failure", async () => {
    const events: string[] = [];
    const actions = {
      lock: () => { events.push("lock"); },
      unlock: () => { events.push("unlock"); },
      verifyCurrent: () => { events.push("current"); },
      installHostBundle: () => { events.push("host-bundle"); },
      runMigrator: () => { throw new Error("migration failed"); },
      finalizeOwnership: () => { events.push("ownership"); },
      stageCandidate: () => { events.push("stage"); },
      runSmoke: () => { events.push("smoke"); },
      fsync: () => { events.push("fsync"); },
      switchBackend: () => { events.push("switch"); },
      installPointers: () => { events.push("pointers"); },
      forceRecreateChangedServices: () => { events.push("recreate"); },
      removeCandidate: () => { events.push("remove"); },
    };
    const result = await promoteBlueGreen(base, actions);
    expect(result).toMatchObject({ phase: "IDLE", candidateRemoved: true });
    expect(events).toContain("remove");
    expect(events).not.toContain("switch");
  });

  test("does not migrate or stage an unqualified candidate", async () => {
    const events: string[] = [];
    const actions = {
      lock: () => { events.push("lock"); },
      unlock: () => { events.push("unlock"); },
      verifyCurrent: () => { events.push("current"); },
      installHostBundle: () => { events.push("host-bundle"); },
      runMigrator: () => { events.push("migrator"); },
      finalizeOwnership: () => { events.push("ownership"); },
      stageCandidate: () => { events.push("stage"); },
      runSmoke: () => { events.push("smoke"); },
      fsync: () => { events.push("fsync"); },
      switchBackend: () => { events.push("switch"); },
      installPointers: () => { events.push("pointers"); },
      forceRecreateChangedServices: () => { events.push("recreate"); },
      removeCandidate: () => { events.push("remove"); },
    };
    const result = await promoteBlueGreen({ ...base, candidateQualified: false }, actions);
    expect(result).toMatchObject({ phase: "IDLE", candidateRemoved: true });
    expect(events).not.toContain("migrator");
    expect(events).not.toContain("ownership");
    expect(events).not.toContain("stage");
  });
});
