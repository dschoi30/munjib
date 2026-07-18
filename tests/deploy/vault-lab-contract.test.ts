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

  it("documents up as the foreground self-bootstrapping lifecycle", () => {
    const workflow = readFileSync("wiki/Local Development Workflow.md", "utf8");
    const up = readFileSync("scripts/vault-lab/up.sh", "utf8");
    expect(workflow).toContain("foreground에서 Vault를 시작하고 bootstrap까지 수행");
    expect(workflow).not.toContain("pnpm vault:lab:bootstrap");
    expect(up.indexOf('bootstrap.sh"')).toBeLessThan(up.indexOf("while :"));
  });

  it("exits foreground up after signal cleanup", () => {
    const up = readFileSync("scripts/vault-lab/up.sh", "utf8");
    expect(up).toContain("trap vault_lab_cleanup EXIT");
    expect(up).toContain("trap 'exit 130' INT");
    expect(up).toContain("trap 'exit 143' TERM");
    expect(up).not.toContain("trap vault_lab_cleanup EXIT INT TERM");
  });

  it("allows teardown from a fresh shell without weakening startup image validation", () => {
    const common = readFileSync("scripts/vault-lab/common.sh", "utf8");
    const down = readFileSync("scripts/vault-lab/down.sh", "utf8");
    expect(down).not.toContain("vault_lab_require_image");
    expect(common).toContain("VAULT_LAB_TEARDOWN_IMAGE");
    expect(common).toContain('VAULT_LAB_IMAGE="${VAULT_LAB_IMAGE:-$VAULT_LAB_TEARDOWN_IMAGE}"');
  });

  it("keeps the Darwin linker workaround from requiring a Linux C toolchain", () => {
    const integration = readFileSync("scripts/vault-lab/integration.sh", "utf8");
    expect(integration).toContain('if [[ "$(uname -s)" == Darwin ]]');
    expect(integration).toContain("CGO_ENABLED=0 go build");
    expect(integration).toContain("CGO_ENABLED=1 go build -ldflags=-linkmode=external");
  });

  it("keeps the root token scoped away from unrelated child processes", () => {
    const integration = readFileSync("scripts/vault-lab/integration.sh", "utf8");
    const up = readFileSync("scripts/vault-lab/up.sh", "utf8");
    const verifier = readFileSync("cmd/munjib-vault-lab-verify/main.go", "utf8");
    expect(integration).not.toContain("export VAULT_TOKEN");
    expect(up).not.toContain("export VAULT_TOKEN");
    expect(integration).toContain('VAULT_TOKEN="$VAULT_TOKEN" bash');
    expect(verifier).toContain('os.LookupEnv("VAULT_TOKEN")');
    expect(integration).toContain("process.env.VAULT_TOKEN");
  });

  it("keeps all integration artifacts in the private temporary directory", () => {
    const integration = readFileSync("scripts/vault-lab/integration.sh", "utf8");
    expect(integration).toContain('work="$VAULT_LAB_PRIVATE_DIR/artifacts"');
    expect(integration).not.toContain('$VAULT_LAB_ROOT/.vault-lab.');
    expect(integration).not.toContain('cat >"$work/verify.go"');
  });

  it("compares negative verifier outcomes as exact stable error codes", () => {
    const integration = readFileSync("scripts/vault-lab/integration.sh", "utf8");
    const verifier = readFileSync("cmd/munjib-vault-lab-verify/main.go", "utf8");
    expect(verifier).not.toContain('"strings"');
    expect(verifier).not.toContain("strings.Contains");
    expect(verifier).toContain('err.Error() == *wantError');
    expect(integration.match(/--want-error /g)).toHaveLength(4);
  });
});
