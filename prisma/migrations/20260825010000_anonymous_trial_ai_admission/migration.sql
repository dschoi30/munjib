CREATE TABLE "TrialAiVisitorDailyUsage" (
  "id" TEXT NOT NULL,
  "visitorDigest" TEXT NOT NULL,
  "kstDate" TEXT NOT NULL,
  "admittedCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TrialAiVisitorDailyUsage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrialAiNetworkDailyUsage" (
  "id" TEXT NOT NULL,
  "networkDigest" TEXT NOT NULL,
  "kstDate" TEXT NOT NULL,
  "admittedCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TrialAiNetworkDailyUsage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrialAiGlobalDailyUsage" (
  "kstDate" TEXT NOT NULL,
  "admittedCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TrialAiGlobalDailyUsage_pkey" PRIMARY KEY ("kstDate")
);

CREATE TABLE "TrialAiAdmissionLease" (
  "id" TEXT NOT NULL,
  "visitorDigest" TEXT NOT NULL,
  "kstDate" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "releasedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TrialAiAdmissionLease_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TrialAiVisitorDailyUsage_visitorDigest_kstDate_key"
ON "TrialAiVisitorDailyUsage"("visitorDigest", "kstDate");

CREATE UNIQUE INDEX "TrialAiNetworkDailyUsage_networkDigest_kstDate_key"
ON "TrialAiNetworkDailyUsage"("networkDigest", "kstDate");

CREATE INDEX "TrialAiAdmissionLease_visitorDigest_kstDate_expiresAt_idx"
ON "TrialAiAdmissionLease"("visitorDigest", "kstDate", "expiresAt");

CREATE UNIQUE INDEX "TrialAiAdmissionLease_active_visitor_key"
ON "TrialAiAdmissionLease"("visitorDigest", "kstDate")
WHERE "releasedAt" IS NULL;
