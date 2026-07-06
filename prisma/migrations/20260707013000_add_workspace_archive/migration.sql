ALTER TABLE "Workspace" ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "Workspace_slug_archivedAt_idx" ON "Workspace"("slug", "archivedAt");
