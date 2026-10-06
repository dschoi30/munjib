import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/auth/signup/route";
const provision = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/provisioning", () => ({ createPasswordSignup: provision }));
afterEach(() => { vi.unstubAllEnvs(); provision.mockReset(); });
const request = (body = JSON.stringify({ email: "new@example.com", password: "test-password", language: "ko" }), origin = "https://munjib.example") => new Request("https://munjib.example/api/auth/signup", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body });
describe("password signup gate", () => {
  it("denies closed signup before provisioning", async () => {
    vi.stubEnv("MUNJIB_PUBLIC_SIGNUP_ENABLED", "false");
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ ok: false, code: "SIGNUP_NOT_ALLOWED" });
    expect(provision).not.toHaveBeenCalled();
  });
  it("provisions when explicitly enabled and closes on opt-out", async () => {
    vi.stubEnv("MUNJIB_PUBLIC_SIGNUP_ENABLED", "true");
    vi.stubEnv("NEXTAUTH_URL", "https://munjib.example");
    provision.mockResolvedValue({ ok: true, email: "new@example.com", redirectPath: "/workspaces/new" });
    const response = await POST(request());
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect((await response.json()).redirectPath).toBe("/workspaces/new");
    vi.stubEnv("MUNJIB_PUBLIC_SIGNUP_ENABLED", "false");
    expect((await POST(request())).status).toBe(403);
    expect(provision).toHaveBeenCalledTimes(1);
  });
  it("rejects reserved launch account emails before public provisioning", async () => {
    vi.stubEnv("MUNJIB_PUBLIC_SIGNUP_ENABLED", "true");
    vi.stubEnv("NEXTAUTH_URL", "https://munjib.example");
    for (const email of ["legacy-account-1@example.invalid", " legacy-account-2@example.invalid "]) {
      expect((await POST(request(JSON.stringify({ email, password: "test-password" })))).status).toBe(400);
    }
    expect(provision).not.toHaveBeenCalled();
  });
  it("rejects cross-origin and malformed requests without provisioning", async () => {
    vi.stubEnv("MUNJIB_PUBLIC_SIGNUP_ENABLED", "true");
    vi.stubEnv("NEXTAUTH_URL", "https://munjib.example");
    expect((await POST(request("{}", "https://other.example"))).status).toBe(403);
    expect((await POST(request("{"))).status).toBe(400);
    expect(provision).not.toHaveBeenCalled();
  });
});
