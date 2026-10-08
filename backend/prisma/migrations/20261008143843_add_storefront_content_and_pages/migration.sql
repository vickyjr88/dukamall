-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "seoDescription" TEXT,
ADD COLUMN     "seoTitle" TEXT;

-- AlterTable
ALTER TABLE "Shop" ADD COLUMN     "address" TEXT,
ADD COLUMN     "announcement" TEXT,
ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "facebookUrl" TEXT,
ADD COLUMN     "instagramUrl" TEXT,
ADD COLUMN     "openingHours" TEXT,
ADD COLUMN     "seoDescription" TEXT,
ADD COLUMN     "tagline" TEXT,
ADD COLUMN     "tiktokUrl" TEXT;

-- AlterTable
ALTER TABLE "ShopTheme" ADD COLUMN     "heroButtonLabel" TEXT,
ADD COLUMN     "heroEyebrow" TEXT,
ADD COLUMN     "heroHeadline" TEXT,
ADD COLUMN     "heroSubtitle" TEXT;

-- CreateTable
CREATE TABLE "ShopPage" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "published" BOOLEAN NOT NULL DEFAULT true,
    "showInFooter" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopPage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopPage_shopId_slug_key" ON "ShopPage"("shopId", "slug");

-- AddForeignKey
ALTER TABLE "ShopPage" ADD CONSTRAINT "ShopPage_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
