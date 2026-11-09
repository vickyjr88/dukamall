-- CreateTable
CREATE TABLE "SocialSetting" (
    "shopId" TEXT NOT NULL,
    "facebookEnabled" BOOLEAN NOT NULL DEFAULT false,
    "threadsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "times" TEXT[] DEFAULT ARRAY['09:00', '13:00', '19:00']::TEXT[],
    "cooldownDays" INTEGER NOT NULL DEFAULT 30,
    "updatedBy" TEXT NOT NULL DEFAULT 'system',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialSetting_pkey" PRIMARY KEY ("shopId")
);

-- CreateTable
CREATE TABLE "SocialPost" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "slotKey" TEXT NOT NULL,
    "productId" TEXT,
    "productName" TEXT,
    "productSlug" TEXT,
    "caption" TEXT,
    "imageUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "detail" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "externalId" TEXT,
    "permalink" TEXT,
    "scheduledFor" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3),
    "triggeredBy" TEXT NOT NULL DEFAULT 'schedule',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SocialPost_shopId_channel_status_postedAt_idx" ON "SocialPost"("shopId", "channel", "status", "postedAt");

-- CreateIndex
CREATE INDEX "SocialPost_shopId_productId_channel_status_idx" ON "SocialPost"("shopId", "productId", "channel", "status");

-- CreateIndex
CREATE INDEX "SocialPost_shopId_createdAt_idx" ON "SocialPost"("shopId", "createdAt");

-- CreateIndex
CREATE INDEX "SocialPost_status_updatedAt_idx" ON "SocialPost"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SocialPost_shopId_channel_slotKey_key" ON "SocialPost"("shopId", "channel", "slotKey");

-- AddForeignKey
ALTER TABLE "SocialSetting" ADD CONSTRAINT "SocialSetting_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
