import { describe, expect, it } from "vitest";
import { readBrowserOrigin } from "@/lib/auth/client-redirects";

describe("auth client redirect helpers", () => {
  it("does not require window when reading the browser origin", () => {
    expect(readBrowserOrigin()).toBeNull();
  });
});
