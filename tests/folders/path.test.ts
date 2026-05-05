import { describe, expect, it } from "vitest";
import { buildChildPath, normalizeFolderPath, pathToWikiTarget } from "@/lib/folders/path";

describe("folder path helpers", () => {
  it("normalizes root and nested paths", () => {
    expect(normalizeFolderPath("")).toBe("/");
    expect(normalizeFolderPath("/Operations//Runbooks/")).toBe("/operations/runbooks");
  });

  it("builds child paths below root and folder paths", () => {
    expect(buildChildPath("/", "onboarding")).toBe("/onboarding");
    expect(buildChildPath("/operations", "onboarding")).toBe("/operations/onboarding");
  });

  it("converts document paths into wiki targets", () => {
    expect(pathToWikiTarget("/operations/onboarding")).toBe("Operations/Onboarding");
    expect(pathToWikiTarget("/")).toBe("");
  });
});
