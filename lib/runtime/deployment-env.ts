export type DeploymentEnvironment = "development" | "staging" | "production";

export function parseDeploymentEnvironment(
  env: Record<string, string | undefined>,
): DeploymentEnvironment {
  const value = env.MUNJIB_DEPLOYMENT_ENV?.trim().toLowerCase();
  if (value === "development" || value === "staging" || value === "production") {
    return value;
  }
  throw new Error(value ? "DEPLOYMENT_ENV_INVALID" : "DEPLOYMENT_ENV_REQUIRED");
}
