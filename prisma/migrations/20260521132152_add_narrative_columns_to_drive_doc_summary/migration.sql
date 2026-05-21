-- AlterTable
ALTER TABLE "DriveDocSummary" ADD COLUMN     "hasStructuredData" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "language" TEXT,
ADD COLUMN     "lastNarrativeProcessedAt" TIMESTAMP(3),
ADD COLUMN     "processingError" TEXT;

