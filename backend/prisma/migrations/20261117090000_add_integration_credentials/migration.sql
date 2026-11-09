-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('WHATSAPP', 'FACEBOOK', 'THREADS');

-- CreateTable
CREATE TABLE "ShopIntegration" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "externalId" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "secrets" TEXT,
    "webhookKey" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "updatedBy" TEXT NOT NULL DEFAULT 'system',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformIntegration" (
    "provider" "IntegrationProvider" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL DEFAULT '{}',
    "secrets" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "updatedBy" TEXT NOT NULL DEFAULT 'system',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformIntegration_pkey" PRIMARY KEY ("provider")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopIntegration_webhookKey_key" ON "ShopIntegration"("webhookKey");

-- CreateIndex
CREATE INDEX "ShopIntegration_shopId_idx" ON "ShopIntegration"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopIntegration_shopId_provider_key" ON "ShopIntegration"("shopId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "ShopIntegration_provider_externalId_key" ON "ShopIntegration"("provider", "externalId");

-- AddForeignKey
ALTER TABLE "ShopIntegration" ADD CONSTRAINT "ShopIntegration_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
