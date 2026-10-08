import {
  BadRequestException, Controller, Get, Param, Post, Query, StreamableFile, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Public } from '../auth/decorators/public.decorator';
import { NoShopScope } from '../auth/decorators/no-shop-scope.decorator';
import { ShopId } from '../common/shop-context';
import { MAX_UPLOAD_BYTES, MediaService } from './media.service';
import { RateLimit } from '../common/rate-limit.decorator';

@ApiTags('media')
@Controller('media')
export class MediaController {
  constructor(private mediaService: MediaService) {}

  @ApiBearerAuth()
  @RateLimit(30, 60)
  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  async upload(@ShopId() shopId: string, @UploadedFile() file?: any) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.mediaService.upload(shopId, file);
  }

  @ApiBearerAuth()
  @Get('library')
  library(@ShopId() shopId: string, @Query('limit') limit?: string) {
    const parsed = Number(limit);
    return this.mediaService.listImages(shopId, Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 200) : 60);
  }

  // Public: an <img> tag carries no Authorization header and no x-shop-id.
  // Safe anyway -- the object key is namespaced as "{shopId}/{uuid}", and
  // MediaService.getObject refuses to serve a key whose own embedded shopId
  // doesn't match, so this can only ever read back what upload() wrote for
  // that same shop, never used to enumerate.
  @Public()
  @NoShopScope()
  @Get(':shopId/:objectKey')
  async getObject(@Param('shopId') shopId: string, @Param('objectKey') objectKey: string) {
    const asset = await this.mediaService.getObject(shopId, `${shopId}/${objectKey}`);
    return new StreamableFile(asset.stream, { type: asset.contentType, disposition: `inline; filename="${asset.fileName}"` });
  }
}
