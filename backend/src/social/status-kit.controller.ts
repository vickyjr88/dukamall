import { Body, Controller, Get, Header, Param, Post, Put, Req, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { ShopId } from '../common/shop-context';
import { UpdateStatusKitDto } from './dto';
import { StatusKitService } from './status-kit.service';

/**
 * The WhatsApp Status kit: today's pictures and their text, for whoever has the shop's WhatsApp on their phone. Staff can use it (it posts nothing and
 * sends nothing); only the owner chooses how many pictures a day.
 */
@ApiTags('portal-status-kit')
@ApiBearerAuth()
@Controller('portal/status-kit')
export class StatusKitController {
  constructor(private readonly service: StatusKitService) {}

  @Get()
  async today(@ShopId() shopId: string, @Req() request: any) {
    return { count: await this.service.size(shopId), items: await this.service.today(shopId, request?.user?.email ?? 'system') };
  }

  @Put('settings')
  @Roles('OWNER')
  settings(@ShopId() shopId: string, @Body() dto: UpdateStatusKitDto, @Req() request: any) {
    return this.service.setSize(shopId, dto.count, request?.user?.email ?? 'unknown');
  }

  @Get(':id/image')
  @Header('Content-Type', 'image/jpeg')
  @Header('Cache-Control', 'private, no-store')
  async image(@ShopId() shopId: string, @Param('id') id: string) {
    return new StreamableFile(await this.service.image(shopId, id));
  }

  @Post(':id/swap')
  async swap(@ShopId() shopId: string, @Param('id') id: string) {
    return { count: await this.service.size(shopId), items: await this.service.swap(shopId, id) };
  }

  @Post(':id/posted')
  async posted(@ShopId() shopId: string, @Param('id') id: string, @Req() request: any) {
    return { count: await this.service.size(shopId), items: await this.service.markPosted(shopId, id, request?.user?.email ?? 'unknown') };
  }
}
