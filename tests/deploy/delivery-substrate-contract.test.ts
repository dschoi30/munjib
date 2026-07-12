import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Leaf 13A least-authority delivery substrate", () => {
  it("ships a root-owned policy, fixed operations, and the Leaf 3 owner registry", () => {
    const policy = JSON.parse(read("deploy/delivery/principal-policy-v1.json"));
    const operations = JSON.parse(read("deploy/delivery/broker-operations-v1.json"));
    const owners = JSON.parse(read("deploy/security/protected-artifact-owners.json"));

    expect(policy).toMatchObject({
      format: "munjib-delivery-principal-v1",
      version: 1,
      generation: 1,
      submitter: { user: "munjib-deploy", uidSource: "root-bootstrap", exactPeer: true },
      socket: { path: "/run/munjib/release-broker.sock", mode: "0620", group: "munjib-release-submit" },
      interactive: false,
      allowDocker: false,
      allowSudo: false,
      allowRootSsh: false,
    });
    expect(operations).toEqual({
      format: "munjib-delivery-broker-operations-v1",
      version: 1,
      operations: ["VERIFY_ONLY", "INSTALL_SUBSTRATE", "RECONCILE_SUBSTRATE"],
    });
    expect(owners).toMatchObject({
      format: "munjib-protected-artifact-owners-v1",
      version: 1,
    });
    expect(owners.owners).toEqual(expect.arrayContaining([
      expect.objectContaining({
        selector: "projection:next-runtime-dependencies-v1",
        kind: "NORMALIZED_PROJECTION",
        owner: "secure-next-runtime",
        version: 1,
      }),
    ]));
  });

  it("keeps the submitter as a bounded Unix-socket relay", () => {
    const source = read("cmd/munjib-release-submit/main.go");
    expect(source).toContain("net.DialUnix");
    expect(source).toContain("MaxFrameSize");
    expect(source).toContain("/run/munjib/release-broker.sock");
    expect(source).toContain("len(os.Args) != 1");
    expect(source).toContain("binary.BigEndian.Uint32");
    expect(source).not.toContain("io.CopyN");
    expect(source).not.toMatch(/exec\.Command|sudo|docker/);
  });

  it("requires SO_PEERCRED and a full envelope revalidation in the broker", () => {
    const source = read("cmd/munjib-release-broker/main.go");
    const verifier = read("internal/delivery/envelope.go");
    const verifyOnly = read("cmd/munjib-release-verify/main.go");
    expect(source).toContain("SO_PEERCRED");
    expect(source).toContain("GetsockoptUcred");
    expect(source).toContain("/etc/munjib/security/principal-policy-v1.json");
    expect(source).toContain("user.Lookup");
    expect(source).toContain("SetDeadline");
    expect(source).toContain("connectionSlots");
    expect(source).toContain("file.Close()");
    expect(source).toContain("VERIFY_ONLY");
    expect(source).toContain("INSTALL_SUBSTRATE");
    expect(source).not.toMatch(/exec\.Command|docker|sudo/);
    expect(verifier).toContain("ed25519.Verify");
    expect(verifier).toContain("ExpectedGeneration");
    expect(verifier).toContain("ExpiresAt");
    expect(verifier).toContain("Nonce");
    expect(verifier).toContain("bytes.NewReader");
    expect(verifier).not.toContain("string(raw)");
    expect(verifyOnly).toContain("VerifyEnvelope");
    expect(verifyOnly).toContain("VERIFY_ONLY");
    expect(verifyOnly).not.toMatch(/exec\.Command|docker|sudo|os\.Getenv/);
  });

  it("installs only fixed root-owned units and disables interactive SSH", () => {
    const service = read("deploy/systemd/munjib-release-broker.service");
    const socket = read("deploy/systemd/munjib-release-broker.socket");
    const ssh = read("deploy/sshd/munjib-release-submit.conf");
    const manifest = JSON.parse(read("deploy/delivery/manifest-v1.json"));

    expect(service).toContain("User=root");
    expect(service).toContain("NoNewPrivileges=true");
    expect(service).toContain("RestrictAddressFamilies=AF_UNIX");
    expect(service).toContain("ProtectSystem=strict");
    expect(service).toContain("ReadWritePaths=/run/munjib");
    expect(service).not.toContain("ReadWritePaths=/var/lib/munjib/security");
    expect(service).not.toMatch(/docker|sudo|checkout|Compose/i);
    expect(socket).toContain("SocketMode=0620");
    expect(socket).toContain("SocketGroup=munjib-release-submit");
    expect(ssh).toContain("ForceCommand /usr/local/libexec/munjib-release-submit");
    expect(ssh).toMatch(/^PermitUserEnvironment no\n\nMatch User munjib-deploy/m);
    expect(ssh).not.toMatch(/Match User munjib-deploy[\s\S]*PermitUserEnvironment no/);
    expect(ssh).toContain("PermitTTY no");
    expect(ssh).toContain("AllowTcpForwarding no");
    expect(ssh).toContain("AllowStreamLocalForwarding no");
    expect(ssh).toContain("PermitTunnel no");
    expect(ssh).toContain("PasswordAuthentication no");
    expect(manifest).toMatchObject({ format: "munjib-delivery-bundle-manifest-v1", version: 1 });
    expect(manifest.files).toEqual(expect.arrayContaining([
      "usr/local/libexec/munjib-release-submit",
      "usr/local/libexec/munjib-release-broker",
      "etc/munjib/security/principal-policy-v1.json",
      "var/lib/munjib/security/bootstrap/release-verify.pub",
    ]));
  });

  it("does not rely on an application capability during 13A", () => {
    const source = read("deploy/delivery/manifest-v1.json");
    expect(source).not.toContain("immutable-private-runtime");
    expect(source).not.toContain("secure-next-runtime");
  });
});
