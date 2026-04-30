-- =============================================================================
-- Sprint Convergencia v2 — NAICS sector classification
-- =============================================================================

-- Project: add NAICS columns
ALTER TABLE "Project"
  ADD COLUMN "naicsSector" TEXT,
  ADD COLUMN "naicsSectorConfidence" DOUBLE PRECISION,
  ADD COLUMN "naicsSectorReviewed" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Project_naicsSector_idx" ON "Project"("naicsSector");

-- FirmInsight: rename domain to functionalDomain (preserve data)
ALTER TABLE "FirmInsight" RENAME COLUMN "domain" TO "functionalDomain";

-- FirmInsight: drop old index, recreate with new name
DROP INDEX IF EXISTS "FirmInsight_domain_idx";
CREATE INDEX "FirmInsight_functionalDomain_idx" ON "FirmInsight"("functionalDomain");

-- FirmInsight: add NAICS columns
ALTER TABLE "FirmInsight"
  ADD COLUMN "naicsSector" TEXT,
  ADD COLUMN "naicsSectorConfidence" DOUBLE PRECISION,
  ADD COLUMN "naicsSectorReviewed" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "FirmInsight_naicsSector_idx" ON "FirmInsight"("naicsSector");
