-- Lab proposal queue (source-agnostic). Subsume FrameworkUpdate (scaffolded, unused).

-- CreateEnum
CREATE TYPE "ProposalSourceType" AS ENUM ('INBOX_RESOURCE', 'FIRM_INSIGHT', 'PROJECT_DELIVERABLE', 'MARKET_BRIEF', 'PERPLEXITY_DISCOVERY', 'MANUAL');
CREATE TYPE "ProposalTargetType" AS ENUM ('AGENT_DNA', 'FRAMEWORK', 'CORPUS', 'PRODUCT_BACKLOG');
CREATE TYPE "ProposalStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'APPLIED');

-- CreateTable
CREATE TABLE "LabProposal" (
    "id" TEXT NOT NULL,
    "sourceType" "ProposalSourceType" NOT NULL,
    "sourceRef" TEXT,
    "targetType" "ProposalTargetType" NOT NULL,
    "targetRef" TEXT,
    "title" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "proposedChange" TEXT NOT NULL,
    "epistemicRegister" TEXT,
    "evidence" JSONB,
    "confidence" INTEGER NOT NULL DEFAULT 50,
    "outcomeWeight" DOUBLE PRECISION,
    "status" "ProposalStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LabProposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LabProposal_status_idx" ON "LabProposal"("status");
CREATE INDEX "LabProposal_sourceType_idx" ON "LabProposal"("sourceType");
CREATE INDEX "LabProposal_targetType_idx" ON "LabProposal"("targetType");
CREATE INDEX "LabProposal_targetType_targetRef_idx" ON "LabProposal"("targetType", "targetRef");
CREATE INDEX "LabProposal_ownerId_idx" ON "LabProposal"("ownerId");

-- AddForeignKey
ALTER TABLE "LabProposal" ADD CONSTRAINT "LabProposal_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Subsume FrameworkUpdate
DROP TABLE IF EXISTS "FrameworkUpdate";
DROP TYPE IF EXISTS "FrameworkUpdateStatus";
