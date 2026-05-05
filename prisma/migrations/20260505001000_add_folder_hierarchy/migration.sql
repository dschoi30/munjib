-- CreateTable
CREATE TABLE "Folder" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "parentFolderId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Folder_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Document" ADD COLUMN "folderId" TEXT;

-- AlterTable
ALTER TABLE "DocumentLink" ADD COLUMN "isAmbiguous" BOOLEAN NOT NULL DEFAULT false;

-- DropIndex
DROP INDEX "Document_workspaceId_slug_key";

-- CreateIndex
CREATE INDEX "Folder_workspaceId_status_idx" ON "Folder"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "Folder_parentFolderId_idx" ON "Folder"("parentFolderId");

-- CreateIndex
CREATE INDEX "Folder_workspaceId_parentFolderId_slug_idx" ON "Folder"("workspaceId", "parentFolderId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Folder_workspaceId_parentFolderId_slug_key" ON "Folder"("workspaceId", "parentFolderId", "slug") WHERE "parentFolderId" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Folder_workspaceId_root_slug_key" ON "Folder"("workspaceId", "slug") WHERE "parentFolderId" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Folder_workspaceId_path_key" ON "Folder"("workspaceId", "path");

-- CreateIndex
CREATE INDEX "Document_folderId_idx" ON "Document"("folderId");

-- CreateIndex
CREATE INDEX "Document_workspaceId_folderId_slug_idx" ON "Document"("workspaceId", "folderId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Document_workspaceId_folderId_slug_key" ON "Document"("workspaceId", "folderId", "slug") WHERE "folderId" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Document_workspaceId_root_slug_key" ON "Document"("workspaceId", "slug") WHERE "folderId" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Document_workspaceId_path_key" ON "Document"("workspaceId", "path");

-- AddForeignKey
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_parentFolderId_fkey" FOREIGN KEY ("parentFolderId") REFERENCES "Folder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
