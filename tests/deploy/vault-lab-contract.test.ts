import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("local Vault release signer lab", () => {
  it("keeps the Vault lab digest-pinned, loopback-only, and credential-free", () => {
    const compose = readFileSync("deploy/vault-lab/compose.yml", "utf8");
    expect(compose).toContain("${VAULT_LAB_IMAGE:?");
    expect(compose).toContain("127.0.0.1:18200:8200");
    expect(compose).not.toMatch(/VAULT_TOKEN|VAULT_DEV_ROOT_TOKEN_ID:|(?<![0-9])8200:8200/);
    expect(readFileSync("deploy/vault-lab/.env.example", "utf8")).not.toMatch(
      /token|secret|unseal/i,
    );
  });

  it("exposes explicit non-production lifecycle scripts", () => {
    const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;
    expect(scripts).toMatchObject({
      "vault:lab:up": "bash scripts/vault-lab/up.sh",
      "vault:lab:bootstrap": "bash scripts/vault-lab/bootstrap.sh",
      "vault:lab:test": "bash scripts/vault-lab/integration.sh",
      "vault:lab:down": "bash scripts/vault-lab/down.sh",
    });
  });

  it("allows teardown from a fresh shell without weakening startup image validation", () => {
    const common = readFileSync("scripts/vault-lab/common.sh", "utf8");
    const down = readFileSync("scripts/vault-lab/down.sh", "utf8");
    expect(down).not.toContain("vault_lab_require_image");
    expect(common).toContain("VAULT_LAB_TEARDOWN_IMAGE");
    expect(common).toContain('VAULT_LAB_IMAGE="${VAULT_LAB_IMAGE:-$VAULT_LAB_TEARDOWN_IMAGE}"');
  });
});
