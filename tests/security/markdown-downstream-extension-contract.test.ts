// @vitest-environment jsdom
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  Leaf11ExternalImageImportSlot,
  leaf11ExternalImageImportSlotVersion,
  prepareLeaf11ExternalMediaRequest,
  type ExternalMediaRequest,
} from "@/components/markdown/downstream/leaf11-external-image-import";

const root = resolve(__dirname, "../..");
const ownersPath = resolve(root, "deploy/security/protected-artifact-owners.json");
const expectedCoreHashes = {
  "components/markdown/safe-media.tsx": "f377ddc8fe696ed3d70969f032c863022c879634fec93426c6904a6369b28fab",
  "components/markdown/external-media-interstitial.tsx": "c51b365c0b6ba09ae9c7e98c7ebc6d78fef041c21e68b162a19463e2ea48f663",
} as const;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Leaf 11 downstream extension contract", () => {
  it("keeps the reserved version-0 slot passive and click-prepared", () => {
    const request: ExternalMediaRequest = {
      kind: "image",
      href: "https://attacker.example/pixel.png",
      originLabel: "https://attacker.example",
      label: "External media",
    };
    const prepared = prepareLeaf11ExternalMediaRequest(request);

    expect(leaf11ExternalImageImportSlotVersion).toBe(0);
    expect(prepared).not.toBe(request);
    expect(prepared).toEqual(request);
    expect(Object.isFrozen(prepared)).toBe(true);

    const onClose = vi.fn();
    const pushState = vi.spyOn(window.history, "pushState");
    const replaceState = vi.spyOn(window.history, "replaceState");
    const { container } = render(
      React.createElement(Leaf11ExternalImageImportSlot, { request: prepared, onClose }),
    );
    expect(container.textContent).toBe("");
    expect(container.querySelectorAll("button, a, input, form")).toHaveLength(0);
    expect(onClose).not.toHaveBeenCalled();
    expect(vi.spyOn(window, "fetch")).not.toHaveBeenCalled();
    expect(vi.spyOn(window, "open")).not.toHaveBeenCalled();
    expect(pushState).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("leaf11-extension")).toBeNull();
  });

  it("pins reserved ownership and Leaf 4 renderer core hashes", () => {
    const owners = JSON.parse(readFileSync(ownersPath, "utf8")) as {
      slots: Record<string, { version: number; state: string; reservedOwner: string }>;
      artifacts: Record<string, { owner: string; sha256: string }>;
      transitions: Array<{ from: number; to: number; owner: string }>;
    };
    expect(owners.slots["leaf11-external-image-import"]).toEqual({
      version: 0,
      state: "RESERVED",
      reservedOwner: "attachment-integrity-lifecycle",
    });
    for (const file of ["components/markdown/safe-media.tsx", "components/markdown/external-media-interstitial.tsx"]) {
      const expected = owners.artifacts[file];
      expect(expected.owner).toBe("zero-ambient-media-egress");
      expect(expected.sha256).toBe(expectedCoreHashes[file as keyof typeof expectedCoreHashes]);
      expect(expected.sha256).toBe(
        createHash("sha256").update(readFileSync(resolve(root, file))).digest("hex"),
      );
    }
    expect(owners.transitions).toEqual([{ from: 0, to: 1, owner: "attachment-integrity-lifecycle" }]);
  });
});
