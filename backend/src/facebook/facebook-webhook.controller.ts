import { Body, Controller, Get, Header, HttpCode, Logger, NotFoundException, Param, Post, Query, Req, UnauthorizedException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { timingSafeEqual } from 'crypto';
import { NoShopScope } from '../auth/decorators/no-shop-scope.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { verifySignature } from '../whatsapp/whatsapp-subscription';
import { IntegrationsService } from '../integrations/integrations.service';
import { FacebookCommentsService } from './facebook-comments.service';
import { parseFeedWebhook } from './facebook-comments';

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Where Facebook delivers ONE shop's Page comments (the Webhooks product of the shop's own Meta app, object "Page", field "feed").
 *
 * Every shop has its own address, `/facebook/webhook/<secret>`, made in Portal > Connections (only its hash is stored). The secret finds the
 * shop, so nobody can post a forged comment that makes a shop message a stranger. A wrong secret is a 404, as if there were no such
 * endpoint. If the shop saved its Meta app secret, Facebook's signature on each event is checked too, and a comment on a different Page
 * than the shop's own is ignored.
 */
@ApiExcludeController()
@Public()
@NoShopScope()
@Controller('facebook/webhook')
export class FacebookWebhookController {
  private readonly logger = new Logger(FacebookWebhookController.name);

  constructor(private readonly integrations: IntegrationsService, private readonly comments: FacebookCommentsService) {}

  /** Facebook's one-off check when the address is given to it: echo its challenge if the token is the one in the address. */
  @Get(':secret')
  @Header('Content-Type', 'text/plain')
  async verify(@Param('secret') secret: string, @Query('hub.mode') mode?: string, @Query('hub.verify_token') token?: string, @Query('hub.challenge') challenge?: string) {
    const shop = await this.integrations.findByWebhookSecret('FACEBOOK', secret);
    if (!shop) throw new NotFoundException();
    if (mode !== 'subscribe' || !token || !same(token, secret)) throw new UnauthorizedException();
    return challenge ?? '';
  }

  /** Always 200 once the event is authentic: Facebook retries anything else, and one bad comment must not block the rest. */
  @HttpCode(200)
  @Post(':secret')
  async receive(@Param('secret') secret: string, @Body() body: unknown, @Req() request: any) {
    const shop = await this.integrations.findByWebhookSecret('FACEBOOK', secret);
    if (!shop) throw new NotFoundException();
    const appSecret = await this.integrations.appSecretFor(shop.shopId, 'FACEBOOK');
    if (appSecret && !verifySignature(request.rawBody, request.headers?.['x-hub-signature-256'], appSecret)) throw new UnauthorizedException();

    for (const comment of parseFeedWebhook(body)) {
      // A comment on a different Page than this shop's is not this shop's, whatever address it arrived at.
      if (shop.externalId && comment.pageId && comment.pageId !== shop.externalId) continue;
      try {
        await this.comments.handleComment(shop.shopId, comment);
      } catch (error) {
        this.logger.error(`Could not handle comment ${comment.commentId}: ${(error as Error).message}`);
      }
    }
    return { received: true };
  }
}
