-- Profit and ad return: what a shop pays for a product, what it paid for ads. Additive: no existing row changes.
ALTER TABLE "Product" ADD COLUMN "costKes" DECIMAL(12,2);
ALTER TABLE "OrderLine" ADD COLUMN "unitCostKes" DECIMAL(12,2);

CREATE TABLE "AdSpend" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "source" TEXT NOT NULL,
    "campaign" TEXT,
    "amountKes" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdSpend_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdSpend_shopId_day_idx" ON "AdSpend"("shopId", "day");

ALTER TABLE "AdSpend" ADD CONSTRAINT "AdSpend_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
