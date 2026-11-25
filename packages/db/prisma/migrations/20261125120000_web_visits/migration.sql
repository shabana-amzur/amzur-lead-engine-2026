-- CreateTable
CREATE TABLE "WebVisit" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "title" TEXT,
    "referrer" TEXT,
    "source" TEXT,
    "medium" TEXT,
    "campaign" TEXT,
    "country" TEXT,
    "city" TEXT,
    "engagedSec" INTEGER,
    "scrollPct" INTEGER,
    "leadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebVisit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WebVisit_visitorId_idx" ON "WebVisit"("visitorId");

-- CreateIndex
CREATE INDEX "WebVisit_createdAt_idx" ON "WebVisit"("createdAt");

-- CreateIndex
CREATE INDEX "WebVisit_leadId_idx" ON "WebVisit"("leadId");
