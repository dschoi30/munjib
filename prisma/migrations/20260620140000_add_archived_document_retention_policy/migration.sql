CREATE TYPE "ArchivedDocumentRetentionPolicy" AS ENUM ('NEVER', 'DAYS_7', 'DAYS_30', 'DAYS_90');

ALTER TABLE "Workspace"
ADD COLUMN "archivedDocumentRetentionPolicy" "ArchivedDocumentRetentionPolicy" NOT NULL DEFAULT 'DAYS_30';
