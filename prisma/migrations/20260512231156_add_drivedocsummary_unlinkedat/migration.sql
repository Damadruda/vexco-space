-- AlterTable
ALTER TABLE "DriveDocSummary" ADD COLUMN     "unlinkedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "DriveDocSummary_unlinkedAt_idx" ON "DriveDocSummary"("unlinkedAt");
