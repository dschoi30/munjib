import { describe, expect, test } from "vitest";
import { deriveTrialNetworkBucket, resolveKstUsageWindow } from "@/lib/security/trial-network-bucket";

const day = "2026-08-25";
const nextDay = "2026-08-26";
const key = "daily-network-hmac-key";

describe("anonymous trial network buckets", () => {
  test("groups IPv4 inputs by their /24 network without returning the address", () => {
    const firstDay = deriveTrialNetworkBucket("203.0.113.41", day, key);

    expect(firstDay).toEqual(deriveTrialNetworkBucket("203.0.113.99", day, key));
    expect(firstDay).not.toContain("203.0.113.41");
    expect(firstDay).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  test("groups IPv6 inputs by their /56 network", () => {
    const first = deriveTrialNetworkBucket("2001:db8:85a3:12ff::1", day, key);

    expect(first).toEqual(deriveTrialNetworkBucket("2001:0db8:85a3:1200:abcd::2", day, key));
    expect(first).not.toEqual(deriveTrialNetworkBucket("2001:db8:85a3:13ff::1", day, key));
  });

  test("rotates network buckets for each KST date", () => {
    const firstDay = deriveTrialNetworkBucket("203.0.113.41", day, key);

    expect(deriveTrialNetworkBucket("203.0.113.41", nextDay, key)).not.toEqual(firstDay);
  });

  test("uses the Asia/Seoul date and reset boundary at KST midnight", () => {
    expect(resolveKstUsageWindow(new Date("2026-08-25T14:59:59.999Z"))).toEqual({
      kstDate: "2026-08-25",
      resetsAt: "2026-08-25T15:00:00.000Z",
    });
    expect(resolveKstUsageWindow(new Date("2026-08-25T15:00:00.000Z"))).toEqual({
      kstDate: "2026-08-26",
      resetsAt: "2026-08-26T15:00:00.000Z",
    });
  });
});
