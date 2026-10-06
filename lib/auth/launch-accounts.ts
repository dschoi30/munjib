import type { WorkspaceRole } from "@prisma/client";

export const launchAccountSeeds = [
  {
    email: "legacy-account-1@example.invalid",
    name: "Munjib Admin",
    workspaceRole: "ADMIN",
  },
  {
    email: "legacy-account-2@example.invalid",
    name: "Munjib Trial",
    workspaceRole: "VIEWER",
  },
] as const satisfies ReadonlyArray<{
  email: string;
  name: string;
  workspaceRole: WorkspaceRole;
}>;
