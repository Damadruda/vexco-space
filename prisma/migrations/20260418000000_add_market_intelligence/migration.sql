-- CreateEnum
CREATE TYPE "MarketBriefType" AS ENUM ('COMMERCIAL_RADAR', 'CONSULTING_MARKET', 'INTERNATIONALIZATION', 'PRICING_BENCHMARK', 'REGULATORY_ALERT');

-- CreateEnum
CREATE TYPE "ProjectQueryType" AS ENUM ('COMPETITIVE_LANDSCAPE', 'TAM_SAM_SOM', 'PRICING_REFERENCE', 'REGULATORY_CONTEXT', 'CUSTOM');

-- CreateTable
CREATE TABLE "MarketIntelligenceTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "briefType" "MarketBriefType" NOT NULL,
    "schedule" TEXT NOT NULL,
    "sectorTags" TEXT[],
    "geographyTags" TEXT[],
    "systemPrompt" TEXT NOT NULL,
    "userPrompt" TEXT NOT NULL,
    "responseSchema" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketIntelligenceTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketIntelligenceBrief" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "briefType" "MarketBriefType" NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "structuredData" JSONB NOT NULL,
    "rawNarrative" TEXT,
    "sectorTags" TEXT[],
    "geographyTags" TEXT[],
    "tokenCost" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketIntelligenceBrief_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketIntelligenceTemplate_isActive_idx" ON "MarketIntelligenceTemplate"("isActive");

-- CreateIndex
CREATE INDEX "MarketIntelligenceBrief_templateId_publishedAt_idx" ON "MarketIntelligenceBrief"("templateId", "publishedAt");

-- CreateIndex
CREATE INDEX "MarketIntelligenceBrief_briefType_publishedAt_idx" ON "MarketIntelligenceBrief"("briefType", "publishedAt");

-- AddForeignKey
ALTER TABLE "MarketIntelligenceBrief" ADD CONSTRAINT "MarketIntelligenceBrief_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MarketIntelligenceTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
