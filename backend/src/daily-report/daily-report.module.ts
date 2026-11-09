import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { DailyReportController } from './daily-report.controller';
import { DailyReportScheduler } from './daily-report.scheduler';
import { DailyReportService } from './daily-report.service';
import { WhatsAppService } from './whatsapp.service';

@Module({
  imports: [EmailModule, IntegrationsModule],
  controllers: [DailyReportController],
  providers: [DailyReportService, DailyReportScheduler, WhatsAppService],
})
export class DailyReportModule {}
