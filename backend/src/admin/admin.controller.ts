import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { ShopStatus } from '@prisma/client';
import { AdminService } from './admin.service';
import { AdminJwtGuard } from '../admin-auth/admin-jwt.guard';
import { Public } from '../auth/decorators/public.decorator';
import { NoShopScope } from '../auth/decorators/no-shop-scope.decorator';

class SetShopStatusDto {
  @IsIn(['TRIAL', 'ACTIVE', 'SUSPENDED']) status!: ShopStatus;
}

/**
 * Platform-operator routes -- list every shop, suspend/reactivate one, see
 * cross-platform totals. Every handler is @Public() (so the staff-only
 * global JwtAuthGuard doesn't reject an admin token before this runs) AND
 * @NoShopScope() (an admin operates across every shop, so ShopScopeGuard's
 * usual "there must be a resolved shop" requirement doesn't apply here) AND
 * guarded by AdminJwtGuard, which is the thing that actually checks the
 * caller is a real, still-current super-admin. See that guard's own header
 * comment for why it re-checks isSuperAdmin on every request instead of
 * trusting the JWT payload.
 */
@ApiTags('admin')
@Controller('admin')
@Public()
@NoShopScope()
@UseGuards(AdminJwtGuard)
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get('shops')
  listShops() {
    return this.adminService.listShops();
  }

  @Get('shops/:id')
  getShop(@Param('id') id: string) {
    return this.adminService.getShop(id);
  }

  @Patch('shops/:id/status')
  setStatus(@Param('id') id: string, @Body() dto: SetShopStatusDto) {
    return this.adminService.setStatus(id, dto.status);
  }

  @Get('stats')
  stats() {
    return this.adminService.platformStats();
  }
}
