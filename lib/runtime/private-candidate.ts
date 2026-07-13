export type RuntimeEnvironment = Record<string, string | undefined>;

const requiredDisabledFlags = [
  "MUNJIB_DISABLE_EMAIL",
  "MUNJIB_DISABLE_OAUTH_CALLBACKS",
  "MUNJIB_DISABLE_BACKGROUND_JOBS",
  "MUNJIB_DISABLE_INDEXING",
  "MUNJIB_DISABLE_EXTERNAL_PROVIDERS",
] as const;

function isTrue(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

function isFalse(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "false";
}

export function isPrivateCandidateRuntime(env: RuntimeEnvironment = process.env): boolean {
  return isTrue(env.MUNJIB_CANDIDATE);
}

/** Validate the full candidate contract before any side-effect boundary runs. */
export function assertCandidateSideEffectsDisabled(env: RuntimeEnvironment = process.env): void {
  if (!isPrivateCandidateRuntime(env)) return;
  const missing = requiredDisabledFlags.filter((key) => !isTrue(env[key]));
  if (missing.length > 0 || !isFalse(env.MUNJIB_ATTACHMENTS_WRITABLE)) {
    throw new Error("PRIVATE_CANDIDATE_SIDE_EFFECTS_NOT_DISABLED");
  }
}

export function assertEmailSendingAllowed(env: RuntimeEnvironment = process.env): void {
  assertCandidateSideEffectsDisabled(env);
  if (isPrivateCandidateRuntime(env)) throw new Error("PRIVATE_CANDIDATE_EMAIL_DISABLED");
}

export function assertOAuthCallbacksAllowed(env: RuntimeEnvironment = process.env): void {
  assertCandidateSideEffectsDisabled(env);
  if (isPrivateCandidateRuntime(env)) throw new Error("PRIVATE_CANDIDATE_OAUTH_DISABLED");
}

export function assertBackgroundJobsAllowed(env: RuntimeEnvironment = process.env): void {
  assertCandidateSideEffectsDisabled(env);
  if (isPrivateCandidateRuntime(env)) throw new Error("PRIVATE_CANDIDATE_BACKGROUND_JOBS_DISABLED");
}

export function assertIndexingAllowed(env: RuntimeEnvironment = process.env): void {
  assertCandidateSideEffectsDisabled(env);
  if (isPrivateCandidateRuntime(env)) throw new Error("PRIVATE_CANDIDATE_INDEXING_DISABLED");
}

export function assertExternalProvidersAllowed(env: RuntimeEnvironment = process.env): void {
  assertCandidateSideEffectsDisabled(env);
  if (isPrivateCandidateRuntime(env)) throw new Error("PRIVATE_CANDIDATE_EXTERNAL_PROVIDERS_DISABLED");
}

export function assertAttachmentWritesAllowed(env: RuntimeEnvironment = process.env): void {
  assertCandidateSideEffectsDisabled(env);
  if (isPrivateCandidateRuntime(env)) throw new Error("PRIVATE_CANDIDATE_ATTACHMENT_WRITES_DISABLED");
}
