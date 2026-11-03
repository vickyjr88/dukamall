import { BadRequestException, Controller, Headers, HttpCode, NotFoundException, Post, Req, UnauthorizedException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { NoShopScope } from '../auth/decorators/no-shop-scope.decorator';
import { DripSyncService } from './drip-sync.service';
import { verifySignature } from './drip-sync.signature';

/**
 * Drip Emporium calls this the moment something in its catalogue changes (a product created, a size added, ...).
 * The body carries nothing we trust: the call only means "look again", and the sync reads Drip's public catalogue
 * itself. What authenticates it is the signature, made with a secret only the two servers know.
 *
 * @NoShopScope() because the call comes from another server, not from a shop's storefront or staff.
 */
@ApiExcludeController()
@Controller('integrations/drip-emporium')
@Public()
@NoShopScope()
export class DripSyncController {
  constructor(private readonly sync: DripSyncService) {}

  @Post('catalogue-changed')
  @HttpCode(202)
  catalogueChanged(@Req() req: Request, @Headers('x-drip-signature') signature?: string) {
    const secret = process.env.DRIP_SYNC_SECRET ?? '';
    // Not configured: behave as if the route does not exist.
    if (!secret) throw new NotFoundException();

    const rawBody: Buffer | undefined = (req as any).rawBody;
    if (!rawBody) throw new BadRequestException('Missing raw request body');
    if (!verifySignature(secret, rawBody.toString('utf-8'), signature)) throw new UnauthorizedException('Bad signature');

    this.sync.trigger();
    return { accepted: true };
  }
}
