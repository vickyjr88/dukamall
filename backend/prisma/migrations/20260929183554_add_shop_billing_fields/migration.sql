-- CreateEnum
CREATE TYPE "BillingPlan" AS ENUM ('TRIAL', 'BASIC', 'PRO');

-- AlterTable
ALTER TABLE "Shop" ADD COLUMN     "billingNotes" TEXT,
ADD COLUMN     "billingPlan" "BillingPlan" NOT NULL DEFAULT 'TRIAL',
ADD COLUMN     "trialEndsAt" TIMESTAMP(3);
