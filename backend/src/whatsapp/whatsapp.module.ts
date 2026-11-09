import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../integrations/integrations.module';
import { PortalCustomerModule } from '../portal-customer/portal-customer.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsappConnectionService } from './whatsapp-connection.service';
import { WhatsappContactsService } from './whatsapp-contacts.service';
import { WhatsappOutreachService } from './whatsapp-outreach.service';
import { WhatsappSequenceService } from './whatsapp-sequence.service';
import { WhatsappWebhookController } from './whatsapp-webhook.controller';
import { WhatsappController } from './whatsapp.controller';

@Module({
  imports: [PrismaModule, IntegrationsModule, PortalCustomerModule],
  controllers: [WhatsappController, WhatsappWebhookController],
  providers: [WhatsappConnectionService, WhatsappContactsService, WhatsappOutreachService, WhatsappSequenceService],
})
export class WhatsappModule {}
