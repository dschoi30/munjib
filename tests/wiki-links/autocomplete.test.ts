import { describe, expect, it } from "vitest";
import {
  getActiveWikiLinkCompletion,
  getWikiLinkCompletionOptions,
} from "@/lib/wiki-links/autocomplete";

describe("getActiveWikiLinkCompletion", () => {
  it("detects an active wiki link query before the cursor", () => {
    expect(getActiveWikiLinkCompletion("Read [[Eng", 10)).toEqual({
      from: 5,
      to: 10,
      query: "Eng",
    });
  });

  it("returns null outside an active wiki link", () => {
    expect(getActiveWikiLinkCompletion("Read [[Engineering]] now", 24)).toBeNull();
  });

  it("ignores embeds and alias fragments", () => {
    expect(getActiveWikiLinkCompletion("![[Image", 8)).toBeNull();
    expect(getActiveWikiLinkCompletion("[[Runbook|alias", 15)).toBeNull();
  });
});

describe("getWikiLinkCompletionOptions", () => {
  it("uses path-qualified insert text for duplicate titles", () => {
    const options = getWikiLinkCompletionOptions("onb", [
      { id: "ops", title: "Onboarding", path: "/operations/onboarding" },
      { id: "eng", title: "Onboarding", path: "/engineering/onboarding" },
    ]);

    expect(options).toEqual([
      {
        id: "ops",
        label: "Operations/Onboarding",
        insertText: "[[Operations/Onboarding]]",
      },
      {
        id: "eng",
        label: "Engineering/Onboarding",
        insertText: "[[Engineering/Onboarding]]",
      },
    ]);
  });

  it("keeps title-only insert text for unique titles", () => {
    expect(
      getWikiLinkCompletionOptions("run", [
        { id: "runbook", title: "Runbook", path: "/operations/runbook" },
      ]),
    ).toEqual([{ id: "runbook", label: "Runbook", insertText: "[[Runbook]]" }]);
  });
});
