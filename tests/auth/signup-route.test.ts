import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/auth/signup/route";

describe("closed password signup route", () => {
  it("returns one stable no-store 403 response", async () => {
    const response = await POST();
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ ok: false, code: "SIGNUP_NOT_ALLOWED" });
  });
});
