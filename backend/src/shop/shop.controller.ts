import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';
import { ShopService } from './shop.service';
import { DomainVerificationService } from './domain-verification.service';
import { Public } from '../auth/decorators/public.decorator';
import { NoShopScope } from '../auth/decorators/no-shop-scope.decorator';
import { ShopId } from '../common/shop-context';
import { Roles } from '../auth/decorators/roles.decorator';
import { UpdateShopSettingsDto } from './shop-settings.dto';

class RequestDomainDto {
  @IsString() @IsNotEmpty() domain!: string;
}

@ApiTags('shop')
@Controller()
export class ShopController {
  constructor(private shopService: ShopService, private domainVerification: DomainVerificationService) {}

  // Called by web/middleware.ts on (effectively) every request, resolving the
  // incoming Host header to a shop. Public and unauthenticated on purpose --
  // it runs before any session exists, and it is the thing that PRODUCES a
  // shopId, so it cannot itself require one.
  @Public()
  @NoShopScope()
  @Get('resolve-shop/:host')
  resolveShop(@Param('host') host: string) {
    return this.shopService.resolveByHost(host);
  }

  @Public()
  @Get('shop/theme')
  getTheme(@ShopId() shopId: string) {
    return this.shopService.getTheme(shopId);
  }

  @Public()
  @Get('shop/info')
  getPublicInfo(@ShopId() shopId: string) {
    return this.shopService.getPublicInfo(shopId);
  }

  // Staff-only (behind the global JwtAuthGuard, not marked @Public()).
  // shopId comes from the caller's own JWT via ShopScopeGuard, so this is
  // always that staff member's own shop's theme -- same handler as the
  // public one above, reused because getTheme takes a shopId regardless of
  // where it came from.
  @Get('portal/theme')
  getPortalTheme(@ShopId() shopId: string) {
    return this.shopService.getTheme(shopId);
  }

  @Roles('OWNER')
  @Put('portal/theme')
  updateTheme(@ShopId() shopId: string, @Body() body: Record<string, string>) {
    return this.shopService.updateTheme(shopId, body);
  }

  // The curated list a shop picks from -- design doc S:1.4, "not open
  // typography." Served from the backend so the portal UI and the
  // storefront's ThemeInjector never drift into two different lists.
  @Public()
  @NoShopScope()
  @Get('portal/theme-options')
  themeOptions() {
    return this.shopService.themeOptions();
  }

  @Get('portal/settings')
  getSettings(@ShopId() shopId: string) {
    return this.shopService.getPortalSettings(shopId);
  }

  // Returns the same masked shape getSettings does, not the raw updated
  // row -- ShopService.updateSettings itself returns the full Shop
  // (Paystack keys included, since Prisma's update() always echoes the
  // written row), which must never reach the response body here.
  @Roles('OWNER')
  @Put('portal/settings')
  async updateSettings(@ShopId() shopId: string, @Body() dto: UpdateShopSettingsDto) {
    await this.shopService.updateSettings(shopId, dto);
    return this.shopService.getPortalSettings(shopId);
  }

  // Custom-domain connection -- design doc Phase 3. See
  // DomainVerificationService's own header comment for why a requested
  // domain never becomes routable (Shop.customDomain) without the TXT-record
  // proof-of-control step in between.
  @Get('portal/domain')
  getDomainStatus(@ShopId() shopId: string) {
    return this.domainVerification.getDomainStatus(shopId);
  }

  @Roles('OWNER')
  @Post('portal/domain')
  requestDomain(@ShopId() shopId: string, @Body() dto: RequestDomainDto) {
    return this.domainVerification.requestDomain(shopId, dto.domain);
  }

  @Roles('OWNER')
  @Post('portal/domain/verify')
  verifyDomain(@ShopId() shopId: string) {
    return this.domainVerification.verifyDomain(shopId);
  }

  @Roles('OWNER')
  @Delete('portal/domain')
  disconnectDomain(@ShopId() shopId: string) {
    return this.domainVerification.disconnectDomain(shopId);
  }
}
