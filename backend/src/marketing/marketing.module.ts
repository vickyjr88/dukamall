import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PortalShareModule } from '../portal-share/portal-share.module';
import { MarketingSummaryService } from './marketing-summary.service';
import { PortalMarketingController } from './portal-marketing.controller';

@Module({ imports: [PrismaModule, PortalShareModule], controllers: [PortalMarketingController], providers: [MarketingSummaryService], exports: [MarketingSummaryService] })
export class MarketingModule {}
