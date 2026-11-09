import { Body, Controller, Get, Header, HttpCode, Logger, NotFoundException, Param, Post, Query, Req, UnauthorizedException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { timingSafeEqual } from 'crypto';
import { NoShopScope } from '../auth/decorators/no-shop-scope.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { IntegrationsService } from '../integrations/integrations.service';
import { WhatsappContactsService } from './whatsapp-contacts.service';
import { parseWebhook, verifySignature } from './whatsapp-subscription';

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Where Meta delivers WhatsApp events for ONE shop: messages people send its number, and delivery reports for messages it sent.
 *
 * Every shop has its own address, `/whatsapp/webhook/<secret>`, with a secret only that shop and Meta know (made in Portal > Connections;
 * only its hash is stored). The secret finds the shop, so nobody can post a forged "message from 0712..." that makes a shop message a stranger.
 * A wrong secret is a 404, as if there were no such endpoint. If the shop saved its Meta app secret, Meta's signature on each event is
 * checked too, and an event for a different number than the shop's own is ignored.
 */
@ApiExcludeController()
@Public()
@NoShopScope()
@Controller('whatsapp/webhook')
export class WhatsappWebhookController {
  private readonly logger = new Logger(WhatsappWebhookController.name);

  constructor(private readonly integrations: IntegrationsService, private readonly contacts: WhatsappContactsService) {}

  /** Meta's one-off check when the address is given to it: echo its challenge if the token is the one in the address. */
  @Get(':secret')
  @Header('Content-Type', 'text/plain')
  async verify(@Param('secret') secret: string, @Query('hub.mode') mode?: string, @Query('hub.verify_token') token?: string, @Query('hub.challenge') challenge?: string) {
    const shop = await this.integrations.findByWebhookSecret('WHATSAPP', secret);
    if (!shop) throw new NotFoundException();
    if (mode !== 'subscribe' || !token || !same(token, secret)) throw new UnauthorizedException();
    return challenge ?? '';
  }

  /** Always 200 once the event is authentic: Meta retries anything else for days, and one bad event must not block the rest. */
  @HttpCode(200)
  @Post(':secret')
  async receive(@Param('secret') secret: string, @Body() body: unknown, @Req() request: any) {
    const shop = await this.integrations.findByWebhookSecret('WHATSAPP', secret);
    if (!shop) throw new NotFoundException();
    const appSecret = await this.integrations.appSecretFor(shop.shopId, 'WHATSAPP');
    if (appSecret && !verifySignature(request.rawBody, request.headers?.['x-hub-signature-256'], appSecret)) throw new UnauthorizedException();

    const { messages, statuses } = parseWebhook(body);
    // An event for another number is not this shop's, whatever address it arrived at.
    const mine = <T extends { phoneNumberId: string | null }>(e: T) => !shop.externalId || !e.phoneNumberId || e.phoneNumberId === shop.externalId;
    for (const message of messages.filter(mine)) {
      try {
        await this.contacts.handleMessage(shop.shopId, message);
      } catch (error) {
        this.logger.error(`Could not handle a WhatsApp message from ${message.from}: ${(error as Error).message}`);
      }
    }
    for (const status of statuses.filter(mine)) {
      try {
        await this.contacts.recordStatus(shop.shopId, status);
      } catch (error) {
        this.logger.error(`Could not record a WhatsApp status for ${status.id}: ${(error as Error).message}`);
      }
    }
    return { received: true };
  }
}
