import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { ShopStatus } from '@prisma/client';
import { AdminService } from './admin.service';
import { AdminJwtGuard } from '../admin-auth/admin-jwt.guard';
import { Public } from '../auth/decorators/public.decorator';
import { NoShopScope } from '../auth/decorators/no-shop-scope.decorator';

class SetShopStatusDto {
  @IsIn(['TRIAL', 'ACTIVE', 'SUSPENDED']) status!: ShopStatus;
  @IsOptional() @IsString() reason?: string;
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
  setStatus(@Req() req: any, @Param('id') id: string, @Body() dto: SetShopStatusDto) {
    return this.adminService.setStatus(id, req.adminId, dto.status, dto.reason);
  }

  // Signs a normal staff session for that shop's owner (see
  // AdminService.impersonate's own comment) -- lets support see exactly
  // what a merchant sees without ever touching their password.
  @Post('shops/:id/impersonate')
  impersonate(@Req() req: any, @Param('id') id: string) {
    return this.adminService.impersonate(id, req.adminId);
  }

  @Get('stats')
  stats() {
    return this.adminService.platformStats();
  }

  @Get('stats/trend')
  trend(@Query('days') days?: string) {
    return this.adminService.revenueTrend(days ? Number(days) : 30);
  }

  @Get('cart-leads')
  cartLeads(@Query('limit') limit?: string) {
    return this.adminService.listCartLeads(limit ? Number(limit) : 50);
  }
}
