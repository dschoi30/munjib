import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("private OCI self-hosted deployment boundary", () => {
  const wrapper = read("scripts/deploy/munjib-deploy.sh");
  const sudoers = read("deploy/sudoers/munjib-actions-runner");

  test("accepts one exact commit SHA and token only through stdin", () => {
    expect(wrapper).toContain('[[ "$#" -eq 1 ]]');
    expect(wrapper).toContain('[[ "$deploy_sha" =~ ^[a-f0-9]{40}$ ]]');
    expect(wrapper).toContain('IFS= read -r deploy_token');
    expect(wrapper).toContain('[[ -n "$deploy_token" ]]');
    expect(wrapper).not.toContain("set -x");
    expect(wrapper).not.toContain("GITHUB_TOKEN=");
  });

  test("uses fixed resources and serializes deployments", () => {
    expect(wrapper).toContain('repo_dir=/home/ubuntu/munjib');
    expect(wrapper).toContain('env_file=/etc/munjib/env');
    expect(wrapper).toContain('secret_dir=/etc/munjib/secrets');
    expect(wrapper).toContain('state_file=/var/lib/munjib/deploy/current-sha');
    expect(wrapper).toContain('lock_file=/run/lock/munjib-deploy.lock');
    expect(wrapper).toContain('flock -n 9');
    expect(wrapper).not.toContain("eval ");
  });

  test("proves the SHA belongs to main before mutation", () => {
    expect(wrapper).toContain('fetch --force "https://github.com/dschoi30/munjib.git" main');
    expect(wrapper).toContain('sudo -u ubuntu git -C "$repo_dir" merge-base --is-ancestor "$deploy_sha" origin/main');
    expect(wrapper).toContain('sudo -u ubuntu git -C "$repo_dir" checkout --detach "$deploy_sha"');
    expect(wrapper).toContain('[[ "$(sudo -u ubuntu git -C "$repo_dir" rev-parse HEAD)" == "$deploy_sha" ]]');
  });

  test("runs preflight migration index deployment and health in order", () => {
    const preflight = wrapper.indexOf("pnpm security:auth-preflight");
    const migrate = wrapper.indexOf("pnpm exec prisma migrate deploy");
    const index = wrapper.indexOf("pnpm run db:rag:index");
    const up = wrapper.indexOf("up -d web");
    const localHealth = wrapper.indexOf("http://127.0.0.1:3000");
    const publicHealth = wrapper.indexOf("https://munjib.andrewchoi.link");
    const stateWrite = wrapper.indexOf('mv -f "$state_tmp" "$state_file"');

    expect(preflight).toBeGreaterThan(-1);
    expect(migrate).toBeGreaterThan(preflight);
    expect(index).toBeGreaterThan(migrate);
    expect(up).toBeGreaterThan(index);
    expect(localHealth).toBeGreaterThan(up);
    expect(publicHealth).toBeGreaterThan(localHealth);
    expect(stateWrite).toBeGreaterThan(publicHealth);
  });

  test("authorizes only the fixed wrapper through sudo", () => {
    expect(sudoers).toContain(
      "munjib-runner ALL=(root) NOPASSWD: /usr/local/sbin/munjib-deploy *",
    );
    expect(sudoers).not.toMatch(/\b(docker|git|systemctl|bash|sh|cp|mv|tee|vi|nano)\b/);
  });
});
