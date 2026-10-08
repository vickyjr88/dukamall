import { Body, Controller, Delete, Get, Header, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsIn, IsISO8601, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { BillingPlan, ShopRole, ShopStatus } from '@prisma/client';
import type { Response } from 'express';
import { AdminService, AdminShopListQuery, SHOP_SORTS } from './admin.service';
import { toCsv } from '../common/csv';
import { AdminJwtGuard } from '../admin-auth/admin-jwt.guard';
import { Public } from '../auth/decorators/public.decorator';
import { NoShopScope } from '../auth/decorators/no-shop-scope.decorator';

const toInt = (v?: string) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined);

function parseShopQuery(q: Record<string, string | undefined>): AdminShopListQuery {
  const pick = <T extends string>(v: string | undefined, allowed: readonly T[]) => (allowed as readonly string[]).includes(v ?? '') ? (v as T) : undefined;
  return {
    search: q.search || undefined,
    status: pick(q.status, ['TRIAL', 'ACTIVE', 'SUSPENDED'] as const),
    plan: pick(q.plan, ['TRIAL', 'BASIC', 'PRO'] as const),
    payments: pick(q.payments, ['ready', 'missing'] as const),
    trial: pick(q.trial, ['expiring', 'expired'] as const),
    inactiveDays: toInt(q.inactiveDays),
    sort: pick(q.sort, SHOP_SORTS),
    dir: pick(q.dir, ['asc', 'desc'] as const),
    page: toInt(q.page),
    pageSize: toInt(q.pageSize),
  };
}

class SetShopStatusDto {
  @IsIn(['TRIAL', 'ACTIVE', 'SUSPENDED']) status!: ShopStatus;
  @IsOptional() @IsString() reason?: string;
}

class ForceVerifyDomainDto {
  @IsOptional() @IsString() reason?: string;
}

class InviteStaffDto {
  @IsEmail() email!: string;
  @IsString() @IsNotEmpty() @MaxLength(80) firstName!: string;
  @IsString() @IsNotEmpty() @MaxLength(80) lastName!: string;
  @IsIn(['OWNER', 'STAFF']) role!: ShopRole;
}

class UpdateBillingDto {
  @IsOptional() @IsIn(['TRIAL', 'BASIC', 'PRO']) billingPlan?: BillingPlan;
  // An ISO date, or null to clear the trial end. A garbage string used to reach
  // the database as an Invalid Date and come back as a 500.
  @ValidateIf((_, v) => v !== null) @IsOptional() @IsISO8601() trialEndsAt?: string | null;
  @IsOptional() @IsString() @MaxLength(2000) billingNotes?: string;
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
  listShops(@Query() q: Record<string, string | undefined>) {
    return this.adminService.listShops(parseShopQuery(q));
  }

  // The same filters as the list, as a spreadsheet. Declared before ':id' so
  // "export-csv" isn't read as a shop id.
  @Get('shops/export-csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportShopsCsv(@Query() q: Record<string, string | undefined>) {
    const rows = await this.adminService.exportShopsRows(parseShopQuery(q));
    return toCsv(rows, [
      'name', 'slug', 'address', 'status', 'plan', 'trialEndsAt', 'currency', 'products', 'orders', 'customers',
      'paidRevenue', 'lastOrderAt', 'lastLoginAt', 'paymentsReady', 'createdAt',
    ]);
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
    return this.adminService.listCartLeads(toInt(limit) ?? 50);
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
  listUsers(
    @Query('search') search?: string,
    @Query('admin') admin?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.adminService.listUsers({
      search,
      admin: admin === 'true' ? true : admin === 'false' ? false : undefined,
      page: toInt(page),
      pageSize: toInt(pageSize),
    });
  }

  // Everything operators have done -- including actions with no shop attached.
  @Get('audit')
  audit(
    @Query('action') action?: string,
    @Query('shopId') shopId?: string,
    @Query('adminId') adminId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.adminService.listAudit({
      action, shopId, adminId,
      from: from ? new Date(from) : undefined,
      // A date-only "to" means the whole of that day.
      to: to ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(to) ? `${to}T23:59:59.999Z` : to) : undefined,
      page: toInt(page),
      pageSize: toInt(pageSize),
    });
  }

  @Get('email-log')
  emailLog(
    @Query('status') status?: string,
    @Query('kind') kind?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.adminService.listEmailLog({ status, kind, search, page: toInt(page), pageSize: toInt(pageSize) });
  }

  @Patch('users/:id/super-admin')
  setSuperAdmin(@Req() req: any, @Param('id') id: string, @Body() dto: SetSuperAdminDto) {
    return this.adminService.setSuperAdmin(req.adminId, id, dto.isSuperAdmin);
  }
}
