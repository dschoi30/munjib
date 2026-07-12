import { constants, closeSync, fstatSync, lstatSync, openSync, readSync } from "node:fs";

export type StrictSecretFileErrorCode =
  | "SECRET_FILE_INPUT_INVALID"
  | "SECRET_FILE_PATH_INVALID"
  | "SECRET_FILE_UNAVAILABLE"
  | "SECRET_FILE_SYMLINK"
  | "SECRET_FILE_PARENT_INVALID"
  | "SECRET_FILE_NON_REGULAR"
  | "SECRET_FILE_LINK_COUNT_INVALID"
  | "SECRET_FILE_OWNER_INVALID"
  | "SECRET_FILE_MODE_INVALID"
  | "SECRET_FILE_SIZE_INVALID"
  | "SECRET_FILE_RACE"
  | "SECRET_FILE_SHORT_READ"
  | "SECRET_FILE_GROWTH_DETECTED"
  | "SECRET_FILE_CONTENT_INVALID";

export type StrictSecretFileInput = {
  /** A non-sensitive label used by callers when classifying this secret. */
  logicalName: string;
  /** The only accepted path shape is `/run/secrets/<single-component>`. */
  path: string;
  /** Effective uid of the process that is expected to own the secret. */
  expectedUid: number;
  /** Upper bound for the file size in bytes. */
  maximumBytes: number;
};

/** Stable, deliberately non-sensitive secret-file failure. */
export class StrictSecretFileError extends Error {
  readonly code: StrictSecretFileErrorCode;
  readonly logicalName: string;

  constructor(code: StrictSecretFileErrorCode, logicalName: string) {
    super(code);
    this.name = "StrictSecretFileError";
    this.code = code;
    this.logicalName = logicalName;
  }
}

function fail(code: StrictSecretFileErrorCode, logicalName: string): never {
  throw new StrictSecretFileError(code, logicalName);
}

function pathShapeIsAllowed(path: unknown): path is string {
  if (typeof path !== "string") return false;
  if (!path.startsWith("/run/secrets/")) return false;
  const basename = path.slice("/run/secrets/".length);
  return basename.length > 0 && basename !== "." && basename !== ".." && !basename.includes("/");
}

function mapStatFailure(error: unknown, logicalName: string, parent: boolean): never {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  if (code === "ELOOP") fail("SECRET_FILE_SYMLINK", logicalName);
  if (code === "ENOENT") {
    fail("SECRET_FILE_UNAVAILABLE", logicalName);
  }
  if (code === "ENOTDIR" || code === "EACCES" || code === "EPERM") {
    fail(parent ? "SECRET_FILE_PARENT_INVALID" : "SECRET_FILE_UNAVAILABLE", logicalName);
  }
  fail(parent ? "SECRET_FILE_PARENT_INVALID" : "SECRET_FILE_UNAVAILABLE", logicalName);
}

function validateParent(path: string, logicalName: string): void {
  let stats: ReturnType<typeof lstatSync>;
  try {
    stats = lstatSync(path);
  } catch (error) {
    mapStatFailure(error, logicalName, true);
  }
  if (stats!.isSymbolicLink() || (stats!.mode & constants.S_IFMT) === constants.S_IFLNK) {
    fail("SECRET_FILE_SYMLINK", logicalName);
  }
  if (!stats!.isDirectory() || (stats!.mode & 0o022) !== 0) {
    fail("SECRET_FILE_PARENT_INVALID", logicalName);
  }
}

function decodeAndValidate(buffer: Buffer, logicalName: string): string {
  let value: string;
  try {
    value = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    fail("SECRET_FILE_CONTENT_INVALID", logicalName);
  }
  if (
    value.includes("\u0000") ||
    value.includes("\uFEFF") ||
    /[\u0001-\u001F\u007F]/u.test(value) ||
    value !== value.trim() ||
    /[\n\r\u0085\u2028\u2029]/u.test(value)
  ) {
    fail("SECRET_FILE_CONTENT_INVALID", logicalName);
  }
  return value;
}

/**
 * Read a deployment secret from a single descriptor after checking the
 * path, parent directories, ownership, mode, link count, and bounded size.
 * No value is written to process.env and errors never include path/value data.
 */
export function readStrictSecretFile(input: StrictSecretFileInput): string {
  if (!input || typeof input !== "object") {
    fail("SECRET_FILE_INPUT_INVALID", "UNKNOWN_SECRET");
  }
  const { logicalName, path, expectedUid, maximumBytes } = input as StrictSecretFileInput;
  if (
    typeof logicalName !== "string" ||
    !logicalName ||
    !Number.isSafeInteger(expectedUid) ||
    expectedUid < 0 ||
    !Number.isSafeInteger(maximumBytes) ||
    maximumBytes <= 0
  ) {
    fail("SECRET_FILE_INPUT_INVALID", logicalName || "UNKNOWN_SECRET");
  }
  if (!pathShapeIsAllowed(path)) fail("SECRET_FILE_PATH_INVALID", logicalName);

  // These are fixed, non-user-controlled parent components. lstat is used so
  // a symlink cannot silently redirect the trust boundary.
  validateParent("/run", logicalName);
  validateParent("/run/secrets", logicalName);

  let pathStats: ReturnType<typeof lstatSync>;
  try {
    pathStats = lstatSync(path);
  } catch (error) {
    mapStatFailure(error, logicalName, false);
  }
  if (
    pathStats!.isSymbolicLink() ||
    (pathStats!.mode & constants.S_IFMT) === constants.S_IFLNK
  ) {
    fail("SECRET_FILE_SYMLINK", logicalName);
  }
  if (!pathStats!.isFile()) fail("SECRET_FILE_NON_REGULAR", logicalName);

  const fsConstants = constants as typeof constants & { O_CLOEXEC?: number };
  // Node does not expose O_CLOEXEC on Darwin even though the kernel supports
  // it; use the platform constant there so the descriptor is non-inheritable.
  const closeOnExec =
    fsConstants.O_CLOEXEC ?? (process.platform === "darwin" ? 0x01000000 : 0);
  const flags = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | closeOnExec;
  let descriptor: number;
  try {
    descriptor = openSync(path, flags);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code === "ELOOP") fail("SECRET_FILE_SYMLINK", logicalName);
    fail("SECRET_FILE_UNAVAILABLE", logicalName);
  }

  try {
    let descriptorStats: ReturnType<typeof fstatSync>;
    try {
      descriptorStats = fstatSync(descriptor!);
    } catch {
      fail("SECRET_FILE_UNAVAILABLE", logicalName);
    }
    if (!descriptorStats!.isFile()) fail("SECRET_FILE_NON_REGULAR", logicalName);
    if (descriptorStats!.dev !== pathStats!.dev || descriptorStats!.ino !== pathStats!.ino) {
      fail("SECRET_FILE_RACE", logicalName);
    }
    if (descriptorStats!.nlink !== 1) fail("SECRET_FILE_LINK_COUNT_INVALID", logicalName);
    if (descriptorStats!.uid !== expectedUid) fail("SECRET_FILE_OWNER_INVALID", logicalName);
    if ((descriptorStats!.mode & 0o7777) !== 0o400) fail("SECRET_FILE_MODE_INVALID", logicalName);
    if (
      !Number.isSafeInteger(descriptorStats!.size) ||
      descriptorStats!.size <= 0 ||
      descriptorStats!.size > maximumBytes
    ) {
      fail("SECRET_FILE_SIZE_INVALID", logicalName);
    }

    const size = descriptorStats!.size;
    const bytes = Buffer.alloc(size);
    let offset = 0;
    while (offset < size) {
      let count: number;
      try {
        count = readSync(descriptor!, bytes, offset, size - offset, null);
      } catch {
        fail("SECRET_FILE_SHORT_READ", logicalName);
      }
      if (count <= 0) fail("SECRET_FILE_SHORT_READ", logicalName);
      offset += count;
    }

    const extra = Buffer.alloc(1);
    let extraCount: number;
    try {
      extraCount = readSync(descriptor!, extra, 0, 1, null);
    } catch {
      fail("SECRET_FILE_GROWTH_DETECTED", logicalName);
    }
    if (extraCount > 0) fail("SECRET_FILE_GROWTH_DETECTED", logicalName);
    return decodeAndValidate(bytes, logicalName);
  } finally {
    closeSync(descriptor!);
  }
}
