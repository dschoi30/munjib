import { describe, expect, it } from "vitest";
import { sanitizeGoogleJwtToken } from "@/lib/auth/session-image";

describe("Google provider media claims", () => {
  it("deletes provider picture claims", () => {
    expect(
      sanitizeGoogleJwtToken({ sub: "user-1", picture: "https://evil.example/a.png" }),
    ).toEqual({ sub: "user-1" });
  });
});
