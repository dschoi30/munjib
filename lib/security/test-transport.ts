export type TestTransportEnvironment = {
  MUNJIB_E2E_PROVIDER_TRANSPORT?: string;
  MUNJIB_DEPLOYMENT_ENV?: string;
  NODE_ENV?: string;
};

/**
 * Test-only network transports are opt-in and must be explicitly scoped to a
 * test/development deployment. An unset environment is deliberately denied;
 * this prevents an accidental `MUNJIB_E2E_PROVIDER_TRANSPORT=true` from
 * opening a harness in a normal/default runtime.
 */
export function isTestTransportEnabled(
  environment: TestTransportEnvironment = process.env,
) {
  if (environment.MUNJIB_E2E_PROVIDER_TRANSPORT?.trim().toLowerCase() !== "true") {
    return false;
  }

  const nodeEnvironment = environment.NODE_ENV?.trim().toLowerCase();
  const deploymentEnvironment = environment.MUNJIB_DEPLOYMENT_ENV?.trim().toLowerCase();
  return (
    nodeEnvironment === "test" ||
    nodeEnvironment === "development" ||
    deploymentEnvironment === "test" ||
    deploymentEnvironment === "development"
  );
}
