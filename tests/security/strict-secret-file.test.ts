import { describe, expect, it, vi } from "vitest";

const { fsMock, fsState } = vi.hoisted(() => {
  const state = {
    fd: 71,
    lstats: new Map<string, unknown>(),
    descriptorStat: null as unknown,
    descriptorError: null as Error | null,
    openError: null as Error | null,
    readQueue: [] as Array<{ count: number; bytes?: Buffer } | Error>,
    readFds: [] as number[],
    fstatFds: [] as number[],
    closedFds: [] as number[],
  };
  const missing = () => Object.assign(new Error("missing"), { code: "ENOENT" });
  const mock = {
    constants: {
      O_CLOEXEC: 0x80000,
      O_NOFOLLOW: 0x20000,
      O_RDONLY: 0,
      S_IFLNK: 0o120000,
      S_IFMT: 0o170000,
    },
    lstatSync: vi.fn((path: string) => {
      const value = state.lstats.get(path);
      if (!value) throw missing();
      if (value instanceof Error) throw value;
      return value;
    }),
    openSync: vi.fn((_path: string, _flags: number) => {
      if (state.openError) throw state.openError;
      return state.fd;
    }),
    fstatSync: vi.fn((fd: number) => {
      state.fstatFds.push(fd);
      if (state.descriptorError) throw state.descriptorError;
      return state.descriptorStat;
    }),
    readSync: vi.fn(
      (_fd: number, buffer: Buffer, offset: number, _length: number, _position: null) => {
        state.readFds.push(_fd);
        const next = state.readQueue.shift();
        if (!next) return 0;
        if (next instanceof Error) throw next;
        next.bytes?.copy(buffer, offset, 0, next.count);
        return next.count;
      },
    ),
    closeSync: vi.fn((fd: number) => {
      state.closedFds.push(fd);
    }),
  };
  return { fsMock: mock, fsState: state };
});

vi.mock("node:fs", () => fsMock);

import {
  readStrictSecretFile,
  StrictSecretFileError,
} from "@/lib/security/strict-secret-file";

const secretPath = "/run/secrets/munjib_test_secret";
const secretValue = "same-fd-secret";
const expectedUid =
  typeof process.geteuid === "function"
    ? process.geteuid()
    : typeof process.getuid === "function"
      ? process.getuid()
      : 0;
// Keep the non-disclosure assertion specific without using a one-digit uid
// (which would match incidental line numbers when the suite runs as root).
const nonDisclosingUid = expectedUid + 100_000_003;

type StatKind = "directory" | "file" | "symlink" | "other";

function stat(kind: StatKind, overrides: Record<string, unknown> = {}) {
  return {
    isDirectory: () => kind === "directory",
    isFile: () => kind === "file",
    isSymbolicLink: () => kind === "symlink",
    dev: 1,
    ino: 11,
    nlink: 1,
    uid: expectedUid,
    mode: kind === "directory" ? 0o755 : 0o400,
    size: Buffer.byteLength(secretValue),
    ...overrides,
  };
}

function input(path = secretPath, maximumBytes = 128) {
  return {
    logicalName: "TEST_SECRET",
    path,
    expectedUid,
    maximumBytes,
  };
}

function resetFs() {
  vi.clearAllMocks();
  fsState.lstats.clear();
  fsState.lstats.set("/run", stat("directory"));
  fsState.lstats.set("/run/secrets", stat("directory"));
  fsState.lstats.set(secretPath, stat("file"));
  fsState.descriptorStat = stat("file");
  fsState.descriptorError = null;
  fsState.openError = null;
  fsState.readQueue = [
    { count: Buffer.byteLength(secretValue), bytes: Buffer.from(secretValue) },
    { count: 0 },
  ];
  fsState.readFds = [];
  fsState.fstatFds = [];
  fsState.closedFds = [];
}

function expectCode(run: () => unknown, code: string) {
  let thrown: unknown;
  try {
    run();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(StrictSecretFileError);
  expect((thrown as StrictSecretFileError).code).toBe(code);
  return thrown as StrictSecretFileError;
}

describe("readStrictSecretFile", () => {
  it("rejects paths outside the fixed single-component /run/secrets allowlist", () => {
    resetFs();
    expectCode(() => readStrictSecretFile(input("/tmp/secret")), "SECRET_FILE_PATH_INVALID");
    expectCode(
      () => readStrictSecretFile(input("/run/secrets/nested/secret")),
      "SECRET_FILE_PATH_INVALID",
    );
    expectCode(() => readStrictSecretFile(input("/run/secrets/..")), "SECRET_FILE_PATH_INVALID");
  });

  it.each([
    ["final component", secretPath, stat("symlink"), "SECRET_FILE_SYMLINK"],
    ["/run symlink", "/run", stat("symlink"), "SECRET_FILE_SYMLINK"],
    ["/run/secrets symlink", "/run/secrets", stat("symlink"), "SECRET_FILE_SYMLINK"],
  ])("rejects a %s symlink before opening it", (_label, path, value, code) => {
    resetFs();
    fsState.lstats.set(path, value);
    expectCode(() => readStrictSecretFile(input()), code);
    expect(fsMock.openSync).not.toHaveBeenCalled();
  });

  it.each([
    ["/run", "/run", stat("directory", { mode: 0o775 })],
    ["/run/secrets", "/run/secrets", stat("directory", { mode: 0o777 })],
  ])("rejects a group/world-writable %s parent", (_label, path, value) => {
    resetFs();
    fsState.lstats.set(path, value);
    expectCode(() => readStrictSecretFile(input()), "SECRET_FILE_PARENT_INVALID");
  });

  it("rejects a non-directory fixed parent", () => {
    resetFs();
    fsState.lstats.set("/run/secrets", stat("other"));
    expectCode(() => readStrictSecretFile(input()), "SECRET_FILE_PARENT_INVALID");
  });

  it("rejects a final component that is not regular", () => {
    resetFs();
    fsState.lstats.set(secretPath, stat("directory"));
    expectCode(() => readStrictSecretFile(input()), "SECRET_FILE_NON_REGULAR");
    expect(fsMock.openSync).not.toHaveBeenCalled();
  });

  it("rejects a path swap between pre-open lstat and same-FD fstat", () => {
    resetFs();
    fsState.descriptorStat = stat("file", { ino: 99 });
    expectCode(() => readStrictSecretFile(input()), "SECRET_FILE_RACE");
    expect(fsMock.openSync).toHaveBeenCalledTimes(1);
    expect(fsState.fstatFds).toEqual([fsState.fd]);
    expect(fsState.closedFds).toEqual([fsState.fd]);
  });

  it.each([
    ["multiple hard links", { nlink: 2 }, "SECRET_FILE_LINK_COUNT_INVALID"],
    ["wrong effective owner", { uid: expectedUid + 1 }, "SECRET_FILE_OWNER_INVALID"],
    ["group-readable mode", { mode: 0o440 }, "SECRET_FILE_MODE_INVALID"],
    ["setuid bit on 0400", { mode: 0o2400 }, "SECRET_FILE_MODE_INVALID"],
  ])("rejects metadata with %s", (_label, overrides, code) => {
    resetFs();
    fsState.descriptorStat = stat("file", overrides);
    expectCode(() => readStrictSecretFile(input()), code);
  });

  it.each([
    ["zero length", 0],
    ["over maximum", 129],
  ])("rejects a %s file", (_label, size) => {
    resetFs();
    fsState.descriptorStat = stat("file", { size });
    expectCode(() => readStrictSecretFile(input()), "SECRET_FILE_SIZE_INVALID");
  });

  it("rejects a short read and still closes the descriptor", () => {
    resetFs();
    fsState.readQueue = [{ count: 2, bytes: Buffer.from("sh") }, { count: 0 }];
    expectCode(() => readStrictSecretFile(input()), "SECRET_FILE_SHORT_READ");
    expect(fsState.readFds).toEqual([fsState.fd, fsState.fd]);
    expect(fsState.closedFds).toEqual([fsState.fd]);
  });

  it("rejects bytes appended after the initial fstat size", () => {
    resetFs();
    fsState.readQueue = [
      { count: Buffer.byteLength(secretValue), bytes: Buffer.from(secretValue) },
      { count: 1, bytes: Buffer.from("!") },
    ];
    expectCode(() => readStrictSecretFile(input()), "SECRET_FILE_GROWTH_DETECTED");
    expect(fsState.readFds).toEqual([fsState.fd, fsState.fd]);
  });

  it("reads valid content from the same descriptor and uses no-follow/close-on-exec flags", () => {
    resetFs();
    expect(readStrictSecretFile(input())).toBe(secretValue);
    expect(fsMock.openSync).toHaveBeenCalledWith(
      secretPath,
      expect.any(Number),
    );
    const flags = fsMock.openSync.mock.calls[0]?.[1] as number;
    expect(flags & fsMock.constants.O_NOFOLLOW).not.toBe(0);
    expect(flags & fsMock.constants.O_CLOEXEC).not.toBe(0);
    expect(fsState.fstatFds).toEqual([fsState.fd]);
    expect(fsState.readFds).toEqual([fsState.fd, fsState.fd]);
    expect(fsState.closedFds).toEqual([fsState.fd]);
  });

  it.each([
    ["NUL", "secret\u0000value"],
    ["BOM", "\uFEFFsecret"],
    ["leading ASCII whitespace", " secret"],
    ["trailing ASCII whitespace", "secret "],
    ["leading Unicode whitespace", "\u00A0secret"],
    ["trailing Unicode whitespace", "secret\u00A0"],
    ["newline", "secret\nvalue"],
    ["carriage return", "secret\rvalue"],
    ["line separator", "secret\u2028value"],
    ["paragraph separator", "secret\u2029value"],
    ["C0 control", "secret\u0001value"],
    ["DEL", "secret\u007Fvalue"],
    ...Array.from({ length: 0x20 }, (_, index) => {
      const codePoint = 0x80 + index;
      return [`C1 U+${codePoint.toString(16).padStart(4, "0")}`, `secret${String.fromCodePoint(codePoint)}value`];
    }),
  ])("rejects %s content", (_label, value) => {
    resetFs();
    const bytes = Buffer.from(value);
    fsState.descriptorStat = stat("file", { size: bytes.length });
    fsState.readQueue = [{ count: bytes.length, bytes }, { count: 0 }];
    expectCode(() => readStrictSecretFile(input()), "SECRET_FILE_CONTENT_INVALID");
  });

  it("keeps failures non-disclosing", () => {
    resetFs();
    fsState.descriptorStat = stat("file", { uid: nonDisclosingUid, size: 99 });
    const error = expectCode(() => readStrictSecretFile(input()), "SECRET_FILE_OWNER_INVALID");
    const rendered = `${String(error)} ${JSON.stringify(error)} ${error.stack ?? ""}`;
    expect(rendered).not.toContain(secretPath);
    expect(rendered).not.toContain("super-secret-value");
    expect(rendered).not.toContain("99");
    expect(rendered).not.toContain(String(nonDisclosingUid));
    expect(rendered).not.toContain("0400");
    expect(error.logicalName).toBe("TEST_SECRET");
  });
});
