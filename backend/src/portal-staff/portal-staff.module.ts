import { Module } from '@nestjs/common';
import { PortalStaffService } from './portal-staff.service';
import { PortalStaffController } from './portal-staff.controller';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [EmailModule],
  controllers: [PortalStaffController],
  providers: [PortalStaffService],
})
export class PortalStaffModule {}
