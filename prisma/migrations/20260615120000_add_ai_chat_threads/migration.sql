CREATE TYPE "AiChatThreadStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "AiChatMessageRole" AS ENUM ('USER', 'ASSISTANT');

CREATE TABLE "AiChatThread" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT,
  "status" "AiChatThreadStatus" NOT NULL DEFAULT 'ACTIVE',
  "lastMessageAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AiChatThread_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiChatMessage" (
  "id" TEXT NOT NULL,
  "threadId" TEXT NOT NULL,
  "role" "AiChatMessageRole" NOT NULL,
  "content" TEXT NOT NULL,
  "citations" JSONB,
  "contextMeta" JSONB,
  "model" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AiChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiChatThread_workspaceId_userId_status_lastMessageAt_idx"
ON "AiChatThread"("workspaceId", "userId", "status", "lastMessageAt");

CREATE UNIQUE INDEX "AiChatThread_workspaceId_userId_active_key"
ON "AiChatThread"("workspaceId", "userId")
WHERE "status" = 'ACTIVE';

CREATE INDEX "AiChatMessage_threadId_createdAt_idx"
ON "AiChatMessage"("threadId", "createdAt");

ALTER TABLE "AiChatThread"
ADD CONSTRAINT "AiChatThread_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiChatThread"
ADD CONSTRAINT "AiChatThread_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiChatMessage"
ADD CONSTRAINT "AiChatMessage_threadId_fkey"
FOREIGN KEY ("threadId") REFERENCES "AiChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
