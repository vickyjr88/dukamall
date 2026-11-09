import { BadRequestException, Body, Controller, Get, Param, Post, Put, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { ShopId } from '../common/shop-context';
import { SaveIntegrationDto } from './dto';
import { isProvider } from './integration-providers';
import { IntegrationsService } from './integrations.service';

const providerOf = (value: string) => {
  const upper = value.toUpperCase();
  if (!isProvider(upper)) throw new BadRequestException('Unknown connection.');
  return upper;
};
const actorOf = (request: any) => ({ id: request?.user?.id ?? null, email: request?.user?.email ?? 'unknown', impersonatedBy: request?.user?.impersonatedBy ?? null });

/**
 * The shop's own connections (WhatsApp, Facebook Page, Threads). Owner-only: they hold the shop's access tokens and decide who the shop
 * messages. Secrets are never returned, only whether they are set and their last four characters.
 */
@ApiTags('portal-integrations')
@ApiBearerAuth()
@Controller('portal/integrations')
@Roles('OWNER')
export class IntegrationsController {
  constructor(private readonly service: IntegrationsService) {}

  @Get()
  list(@ShopId() shopId: string) {
    return this.service.list(shopId);
  }

  @Put(':provider')
  save(@ShopId() shopId: string, @Param('provider') provider: string, @Body() dto: SaveIntegrationDto, @Req() request: any) {
    return this.service.save(shopId, providerOf(provider), dto, actorOf(request));
  }

  /** Read-only call to the provider with the saved token; says in words what worked or what Meta answered. */
  @Post(':provider/test')
  test(@ShopId() shopId: string, @Param('provider') provider: string, @Req() request: any) {
    return this.service.test(shopId, providerOf(provider), actorOf(request));
  }
}
