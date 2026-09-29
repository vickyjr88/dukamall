import { Body, Controller, Delete, Get, Header, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString } from 'class-validator';
import { BillingPlan, ShopRole, ShopStatus } from '@prisma/client';
import type { Response } from 'express';
import { AdminService } from './admin.service';
import { AdminJwtGuard } from '../admin-auth/admin-jwt.guard';
import { Public } from '../auth/decorators/public.decorator';
import { NoShopScope } from '../auth/decorators/no-shop-scope.decorator';

class SetShopStatusDto {
  @IsIn(['TRIAL', 'ACTIVE', 'SUSPENDED']) status!: ShopStatus;
  @IsOptional() @IsString() reason?: string;
}

class ForceVerifyDomainDto {
  @IsOptional() @IsString() reason?: string;
}

class InviteStaffDto {
  @IsEmail() email!: string;
  @IsString() firstName!: string;
  @IsString() lastName!: string;
  @IsIn(['OWNER', 'STAFF']) role!: ShopRole;
}

class UpdateBillingDto {
  @IsOptional() @IsIn(['TRIAL', 'BASIC', 'PRO']) billingPlan?: BillingPlan;
  // Accepts null explicitly (clearing the trial end date) as well as an
  // ISO date string -- IsDateString alone would reject null, so this is
  // validated loosely here and parsed in the controller method instead.
  @IsOptional() trialEndsAt?: string | null;
  @IsOptional() @IsString() billingNotes?: string;
}

class SetSuperAdminDto {
  @IsBoolean() isSuperAdmin!: boolean;
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
  listShops(
    @Query('search') search?: string,
    @Query('status') status?: ShopStatus,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.adminService.listShops({
      search,
      status,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get('shops/:id')
  getShop(@Param('id') id: string) {
    return this.adminService.getShop(id);
  }

  @Patch('shops/:id/billing')
  updateBilling(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateBillingDto) {
    return this.adminService.updateBilling(id, req.adminId, {
      billingPlan: dto.billingPlan,
      trialEndsAt: dto.trialEndsAt === undefined ? undefined : dto.trialEndsAt === null ? null : new Date(dto.trialEndsAt),
      billingNotes: dto.billingNotes,
    });
  }

  // A shop's full data as one JSON file -- an offboarding/backup artifact,
  // see AdminService.exportShop's own comment. Content-Disposition set
  // directly (not NestJS's default JSON response) so the browser downloads
  // it as a named file rather than rendering it inline.
  @Get('shops/:id/export')
  @Header('Content-Type', 'application/json')
  async exportShop(@Req() req: any, @Res() res: Response, @Param('id') id: string) {
    const data = await this.adminService.exportShop(id, req.adminId);
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Disposition', `attachment; filename="${data.shop.slug}-export-${date}.json"`);
    res.send(JSON.stringify(data, null, 2));
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

  // Bypasses the DNS TXT check -- see AdminService.forceVerifyDomain's own
  // comment for why this is a deliberate, always-logged escape hatch.
  @Post('shops/:id/domain/force-verify')
  forceVerifyDomain(@Req() req: any, @Param('id') id: string, @Body() dto: ForceVerifyDomainDto) {
    return this.adminService.forceVerifyDomain(id, req.adminId, dto.reason);
  }

  @Delete('shops/:id/domain')
  disconnectDomain(@Req() req: any, @Param('id') id: string) {
    return this.adminService.adminDisconnectDomain(id, req.adminId);
  }

  @Post('shops/:id/staff')
  inviteStaff(@Req() req: any, @Param('id') id: string, @Body() dto: InviteStaffDto) {
    return this.adminService.inviteStaff(id, req.adminId, dto);
  }

  @Delete('shops/:id/staff/:userId')
  removeStaff(@Req() req: any, @Param('id') id: string, @Param('userId') userId: string) {
    return this.adminService.removeStaff(id, req.adminId, userId);
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

  // Cross-shop -- finds which shop a product/SKU belongs to, for a support
  // ticket that names an item but not the shop it's on.
  @Get('products/search')
  searchProducts(@Query('q') q?: string) {
    return this.adminService.searchProducts(q || '');
  }

  // Every User, not just current admins -- see AdminService.listUsers's
  // own comment for why: finding someone who is currently shop staff and
  // promoting them is the common case.
  @Get('users')
  listUsers(@Query('search') search?: string) {
    return this.adminService.listUsers(search || '');
  }

  @Patch('users/:id/super-admin')
  setSuperAdmin(@Req() req: any, @Param('id') id: string, @Body() dto: SetSuperAdminDto) {
    return this.adminService.setSuperAdmin(req.adminId, id, dto.isSuperAdmin);
  }
}
