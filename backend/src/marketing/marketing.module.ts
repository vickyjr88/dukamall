import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MarketingSummaryService } from './marketing-summary.service';

@Module({ imports: [PrismaModule], providers: [MarketingSummaryService], exports: [MarketingSummaryService] })
export class MarketingModule {}
