-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "syncSourceId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Product_shopId_syncSourceId_key" ON "Product"("shopId", "syncSourceId");
