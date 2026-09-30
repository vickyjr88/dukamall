import { Module } from '@nestjs/common';
import { PortalStaffService } from './portal-staff.service';
import { PortalStaffController } from './portal-staff.controller';

@Module({
  controllers: [PortalStaffController],
  providers: [PortalStaffService],
})
export class PortalStaffModule {}
