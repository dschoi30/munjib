"use server";

/** Trial forms never delegate to authenticated mutations, including in a browser with an owner session. */
export async function rejectTrialMutation(_formData: FormData): Promise<never> {
  throw new Error("TRIAL_READ_ONLY");
}
