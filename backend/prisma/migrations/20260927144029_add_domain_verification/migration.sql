-- AlterTable
ALTER TABLE "Shop" ADD COLUMN     "domainVerificationToken" TEXT,
ADD COLUMN     "domainVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "pendingDomain" TEXT;
