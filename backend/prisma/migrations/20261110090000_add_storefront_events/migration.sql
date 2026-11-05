-- Anonymous storefront events (visits, product views, add to cart, checkout, WhatsApp taps, searches) and the session id
-- that ties an order or WhatsApp lead back to the visit that produced it. Additive: no existing row changes.
ALTER TABLE "Order" ADD COLUMN "sessionId" TEXT;
ALTER TABLE "CartLead" ADD COLUMN "sessionId" TEXT;

CREATE TABLE "StorefrontEvent" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "productSlug" TEXT,
    "detail" TEXT,
    "source" TEXT,
    "medium" TEXT,
    "campaign" TEXT,
    "device" TEXT,
    "landingPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StorefrontEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StorefrontEvent_shopId_createdAt_idx" ON "StorefrontEvent"("shopId", "createdAt");
CREATE INDEX "StorefrontEvent_shopId_type_createdAt_idx" ON "StorefrontEvent"("shopId", "type", "createdAt");
CREATE INDEX "StorefrontEvent_shopId_sessionId_idx" ON "StorefrontEvent"("shopId", "sessionId");
CREATE INDEX "Order_shopId_sessionId_idx" ON "Order"("shopId", "sessionId");

ALTER TABLE "StorefrontEvent" ADD CONSTRAINT "StorefrontEvent_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
