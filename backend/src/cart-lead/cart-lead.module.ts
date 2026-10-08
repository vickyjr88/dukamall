import { Module } from '@nestjs/common';
import { CartLeadService } from './cart-lead.service';
import { CartLeadController, PortalCartLeadController } from './cart-lead.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [CartLeadController, PortalCartLeadController],
  providers: [CartLeadService],
})
export class CartLeadModule {}
