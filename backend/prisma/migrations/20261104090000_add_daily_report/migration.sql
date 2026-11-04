-- CreateTable
CREATE TABLE "DailyReportSetting" (
    "shopId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "emailRecipients" TEXT[],
    "whatsappRecipients" TEXT[],
    "updatedBy" TEXT NOT NULL DEFAULT 'system',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyReportSetting_pkey" PRIMARY KEY ("shopId")
);

-- CreateTable
CREATE TABLE "DailyReportRun" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "reportDate" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyReportRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyReportRun_shopId_reportDate_idx" ON "DailyReportRun"("shopId", "reportDate");

-- CreateIndex
CREATE UNIQUE INDEX "DailyReportRun_shopId_reportDate_channel_recipient_key" ON "DailyReportRun"("shopId", "reportDate", "channel", "recipient");

-- AddForeignKey
ALTER TABLE "DailyReportSetting" ADD CONSTRAINT "DailyReportSetting_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyReportRun" ADD CONSTRAINT "DailyReportRun_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
