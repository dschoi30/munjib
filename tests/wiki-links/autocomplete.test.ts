import { describe, expect, it } from "vitest";
import { getActiveWikiLinkCompletion } from "@/lib/wiki-links/autocomplete";

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
