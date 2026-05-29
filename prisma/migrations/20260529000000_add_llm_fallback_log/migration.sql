-- LLMFallbackLog: persistent log of silent model fallback events (Pro -> Flash)
-- Each row represents one event where callGemini fell back from T2 to T1
-- after both retries failed. Used for diagnosing intermittent Gemini Pro failures.

CREATE TABLE "LLMFallbackLog" (
    "id" TEXT NOT NULL,
    "fromModel" TEXT NOT NULL,
    "toModel" TEXT NOT NULL,
    "errors" TEXT[],
    "context" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LLMFallbackLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LLMFallbackLog_createdAt_idx" ON "LLMFallbackLog"("createdAt");
CREATE INDEX "LLMFallbackLog_fromModel_idx" ON "LLMFallbackLog"("fromModel");
