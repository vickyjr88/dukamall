-- Additive: a record of taps on the portal's Share buttons.
CREATE TABLE "ShareEvent" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "productSlug" TEXT,
    "itemCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShareEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ShareEvent_shopId_createdAt_idx" ON "ShareEvent"("shopId", "createdAt");

ALTER TABLE "ShareEvent" ADD CONSTRAINT "ShareEvent_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
