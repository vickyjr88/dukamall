import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ShopId } from '../common/shop-context';
import { OUTREACH_KINDS, OutreachKind, isKind } from './whatsapp-kinds';
import { WhatsappContactsService } from './whatsapp-contacts.service';
import { WhatsappOutreachService } from './whatsapp-outreach.service';

class SendDto {
  @IsIn(OUTREACH_KINDS) kind!: OutreachKind;
  @IsArray() @ArrayMaxSize(25) @IsString({ each: true }) keys!: string[];
  @IsOptional() @IsBoolean() force?: boolean;
}

const num = (v?: string) => (v === undefined || v === '' ? undefined : Number(v));

/**
 * The owner's WhatsApp screen: send an approved template to customers, and see who has messaged the shop. Owner-only: it messages the
 * shop's customers. Everything is the shop's own: its number, its templates, its contacts.
 */
@ApiTags('portal-whatsapp')
@ApiBearerAuth()
@Controller('portal/whatsapp')
@Roles('OWNER')
export class WhatsappController {
  constructor(private readonly outreach: WhatsappOutreachService, private readonly contacts: WhatsappContactsService) {}

  @Get('status')
  status(@ShopId() shopId: string) {
    return this.outreach.availability(shopId);
  }

  @Get('recipients')
  recipients(@ShopId() shopId: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string, @Query('search') search?: string) {
    return this.outreach.recipients(shopId, { page: num(page), pageSize: num(pageSize), search });
  }

  /** Everyone who has not yet received `kind`, so "everyone who hasn't had it" can be picked in one go. */
  @Get('unsent')
  unsent(@ShopId() shopId: string, @Query('kind') kind: string, @Query('search') search?: string) {
    if (!isKind(kind)) throw new BadRequestException('Unknown message.');
    return this.outreach.unsentKeys(shopId, kind, search);
  }

  /** At most 25 people a request (the screen sends in batches), so no single request runs long. */
  @Post('send')
  send(@ShopId() shopId: string, @Body() dto: SendDto, @Req() request: any) {
    return this.outreach.send(shopId, { kind: dto.kind, keys: dto.keys, force: dto.force, triggeredBy: request?.user?.email ?? 'unknown' });
  }

  @Get('history')
  history(@ShopId() shopId: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.outreach.history(shopId, { page: num(page), pageSize: num(pageSize) });
  }

  @Get('contacts/stats')
  contactStats(@ShopId() shopId: string) {
    return this.contacts.stats(shopId);
  }

  @Get('contacts')
  contactList(@ShopId() shopId: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string, @Query('search') search?: string) {
    return this.contacts.list(shopId, { page: num(page), pageSize: num(pageSize), search });
  }

  @Post('contacts/:id/unsubscribe')
  unsubscribe(@ShopId() shopId: string, @Param('id') id: string) {
    return this.contacts.unsubscribe(shopId, id);
  }
}
