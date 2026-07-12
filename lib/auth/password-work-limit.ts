const MAX_ACTIVE_CALLS = 2;
const MAX_QUEUED_CALLS = 8;
const QUEUE_DEADLINE_MS = 2_000;

export class PasswordWorkLimitError extends Error {
  readonly code = "PASSWORD_WORK_SATURATED" as const;

  constructor() {
    super("PASSWORD_WORK_SATURATED");
    this.name = "PasswordWorkLimitError";
  }
}

type Work<T> = () => Promise<T> | T;
type QueueEntry = {
  work: Work<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
  settled: boolean;
};

let activeCalls = 0;
let queue: QueueEntry[] = [];

function drainQueue() {
  while (activeCalls < MAX_ACTIVE_CALLS && queue.length > 0) {
    const entry = queue.shift()!;
    if (entry.settled) continue;
    entry.settled = true;
    clearTimeout(entry.timer);
    start(entry.work, entry.resolve, entry.reject);
  }
}

function start<T>(work: Work<T>, resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: unknown) => void) {
  activeCalls += 1;
  Promise.resolve()
    .then(work)
    .then(resolve, reject)
    .finally(() => {
      activeCalls -= 1;
      drainQueue();
    });
}

/**
 * Bounds concurrent password KDF work. This is a resource guard, not a
 * request/user rate-limit authority.
 */
export function withPasswordWorkPermit<T>(work: Work<T>): Promise<T> {
  if (activeCalls < MAX_ACTIVE_CALLS) {
    return new Promise<T>((resolve, reject) => start(work, resolve, reject));
  }
  if (queue.length >= MAX_QUEUED_CALLS) {
    return Promise.reject(new PasswordWorkLimitError());
  }
  return new Promise<T>((resolve, reject) => {
    const entry: QueueEntry = {
      work: work as Work<unknown>,
      resolve: resolve as (value: unknown) => void,
      reject,
      settled: false,
      timer: setTimeout(() => {
        if (entry.settled) return;
        entry.settled = true;
        queue = queue.filter((candidate) => candidate !== entry);
        reject(new PasswordWorkLimitError());
      }, QUEUE_DEADLINE_MS),
    };
    entry.timer.unref?.();
    queue.push(entry);
  });
}

export const passwordWorkLimitConstants = Object.freeze({
  maxActiveCalls: MAX_ACTIVE_CALLS,
  maxQueuedCalls: MAX_QUEUED_CALLS,
  queueDeadlineMs: QUEUE_DEADLINE_MS,
});

/** Test-only cleanup; production code has no reset operation. */
export function resetPasswordWorkPermitForTests() {
  for (const entry of queue) {
    clearTimeout(entry.timer);
    if (!entry.settled) {
      entry.settled = true;
      entry.reject(new PasswordWorkLimitError());
    }
  }
  queue = [];
}
