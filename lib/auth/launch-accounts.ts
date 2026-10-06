import type { WorkspaceRole } from "@prisma/client";

export const launchAccountSeeds = [
  {
    email: "mjadmin@munjib.com",
    name: "Munjib Admin",
    workspaceRole: "ADMIN",
  },
  {
    email: "mjtrial@munjib.com",
    name: "Munjib Trial",
    workspaceRole: "VIEWER",
  },
] as const satisfies ReadonlyArray<{
  email: string;
  name: string;
  workspaceRole: WorkspaceRole;
}>;
