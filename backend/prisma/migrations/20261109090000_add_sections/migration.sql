-- AlterTable
ALTER TABLE "Shop" ADD COLUMN     "sections" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "ProductCategory" ADD COLUMN     "section" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "specs" JSONB NOT NULL DEFAULT '[]';

