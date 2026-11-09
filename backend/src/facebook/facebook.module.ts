import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../integrations/integrations.module';
import { PrismaModule } from '../prisma/prisma.module';
import { FacebookCommentsService } from './facebook-comments.service';
import { FacebookConnectionService } from './facebook-connection.service';
import { FacebookWebhookController } from './facebook-webhook.controller';
import { FacebookController } from './facebook.controller';

@Module({
  imports: [PrismaModule, IntegrationsModule],
  controllers: [FacebookController, FacebookWebhookController],
  providers: [FacebookConnectionService, FacebookCommentsService],
})
export class FacebookModule {}
