-- CreateTable
CREATE TABLE "InboxCorrection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemTitle" TEXT NOT NULL,
    "itemSummary" TEXT NOT NULL,
    "itemTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "oldCategory" TEXT NOT NULL,
    "newCategory" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboxCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InboxCorrection_userId_createdAt_idx" ON "InboxCorrection"("userId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "InboxCorrection" ADD CONSTRAINT "InboxCorrection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
