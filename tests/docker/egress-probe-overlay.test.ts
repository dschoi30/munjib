import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const root = process.cwd();
const read = (file: string) => readFileSync(join(root, file), "utf8");

describe("egress probe Compose overlay", () => {
  it("keeps the probe isolated to the test-only overlay", () => {
    const productionSource = read("docker-compose.yml");
    const overlaySource = read("docker-compose.egress-test.yml");
    const overlay = parse(overlaySource) as {
      services: Record<string, {
        profiles?: string[];
        ports?: string[];
        networks?: unknown;
        environment?: Record<string, string>;
      }>;
    };

    expect(productionSource).not.toMatch(/egress-probe|egress-test|39158|munjib-web-egress/);
    expect(overlay.services["egress-probe"]).toMatchObject({ profiles: ["egress-test"] });
    expect(overlay.services["egress-probe"].ports).toEqual(["127.0.0.1:39158:39158"]);
    expect(overlaySource).toContain("aliases: [egress-probe]");
    expect(overlay.services.web.environment).not.toHaveProperty("MUNJIB_EGRESS_PROBE_ORIGIN");
    expect(overlay.services.web.environment).not.toHaveProperty("MUNJIB_EGRESS_PROBE_SERVER_ORIGIN");
    expect(overlay.services.web.environment).not.toHaveProperty("MUNJIB_E2E_ATTACKER_ORIGIN");
    expect(overlay.services.web).not.toHaveProperty("depends_on");
    expect(overlaySource).toContain("in-process");
  });
});
