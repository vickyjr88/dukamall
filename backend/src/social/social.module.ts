import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../integrations/integrations.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PostableProductsService } from './postable-products.service';
import { SocialPostingController } from './social-posting.controller';
import { SocialPostingService } from './social-posting.service';
import { StatusKitController } from './status-kit.controller';
import { StatusKitService } from './status-kit.service';

@Module({
  imports: [PrismaModule, IntegrationsModule],
  controllers: [SocialPostingController, StatusKitController],
  providers: [PostableProductsService, SocialPostingService, StatusKitService],
})
export class SocialModule {}
