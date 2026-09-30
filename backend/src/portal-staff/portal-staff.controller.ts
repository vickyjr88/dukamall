import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsIn, IsString } from 'class-validator';
import { ShopRole } from '@prisma/client';
import { PortalStaffService } from './portal-staff.service';
import { ShopId } from '../common/shop-context';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

class InviteStaffDto {
  @IsEmail() email!: string;
  @IsString() firstName!: string;
  @IsString() lastName!: string;
  @IsIn(['OWNER', 'STAFF']) role!: ShopRole;
}

@ApiTags('portal-staff')
@ApiBearerAuth()
@Controller('portal/staff')
export class PortalStaffController {
  constructor(private portalStaffService: PortalStaffService) {}

  @Get()
  list(@ShopId() shopId: string) {
    return this.portalStaffService.list(shopId);
  }

  @Post()
  invite(@ShopId() shopId: string, @CurrentUser() user: { role: string }, @Body() dto: InviteStaffDto) {
    return this.portalStaffService.invite(shopId, user.role, dto);
  }

  @Delete(':userId')
  remove(@ShopId() shopId: string, @CurrentUser() user: { id: string; role: string }, @Param('userId') userId: string) {
    return this.portalStaffService.remove(shopId, user.role, user.id, userId);
  }
}
