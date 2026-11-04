import {
  BadRequestException, Body, Controller, Get, Headers, Param, Post, Query, Res, StreamableFile, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { NoShopScope } from '../auth/decorators/no-shop-scope.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ShopId } from '../common/shop-context';
import { CropImageDto, RestoreImageDto } from './dto/crop-image.dto';
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
  async upload(@ShopId() shopId: string, @CurrentUser() user: { email?: string }, @UploadedFile() file?: any) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.mediaService.upload(shopId, file, user?.email);
  }

  /**
   * Crops an image in place: the picture under the same address is replaced by the cropped one, so every product, logo
   * or hero using it shows the cropped version and nothing breaks. The previous version is kept and can be restored.
   */
  @ApiBearerAuth()
  @RateLimit(30, 60)
  @Post('crop')
  async crop(@ShopId() shopId: string, @CurrentUser() user: { email?: string }, @Body() dto: CropImageDto) {
    const selection = dto.square
      ? ({ square: true } as const)
      : { x: dto.x ?? NaN, y: dto.y ?? NaN, width: dto.width ?? NaN, height: dto.height ?? NaN };
    return this.mediaService.cropAsset(shopId, dto.assetId, selection, user?.email);
  }

  /** Undoes the most recent crop of an image. */
  @ApiBearerAuth()
  @RateLimit(30, 60)
  @Post('restore')
  async restore(@ShopId() shopId: string, @Body() dto: RestoreImageDto) {
    return this.mediaService.restoreAsset(shopId, dto.assetId);
  }

  /** This shop's images, for the media manager and the pickers. Declared before the public `:shopId/:objectKey` route. */
  @ApiBearerAuth()
  @Get('library')
  library(@ShopId() shopId: string, @Query('limit') limit?: string, @Query('cursor') cursor?: string, @Query('search') search?: string) {
    const parsed = Number(limit);
    return this.mediaService.listLibrary(shopId, {
      limit: Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 200) : 60,
      cursor: cursor || undefined,
      search: search || undefined,
    });
  }

  // Public: an <img> tag carries no Authorization header and no x-shop-id.
  // Safe anyway -- the object key is namespaced as "{shopId}/{uuid}", and
  // MediaService.getObject refuses to serve a key whose own embedded shopId
  // doesn't match, so this can only ever read back what upload() wrote for
  // that same shop, never used to enumerate.
  //
  // A crop keeps an image's address, so the file must be revalidated rather
  // than cached blind: `no-cache` + ETag means a browser (or CDN) asks each
  // time and gets a cheap 304 while the picture is unchanged, and the new
  // picture straight after a crop.
  @Public()
  @NoShopScope()
  @Get(':shopId/:objectKey')
  async getObject(
    @Param('shopId') shopId: string,
    @Param('objectKey') objectKey: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const asset = await this.mediaService.getObject(shopId, `${shopId}/${objectKey}`, ifNoneMatch);
    res.setHeader('Cache-Control', 'no-cache');
    if (asset.etag) res.setHeader('ETag', `"${asset.etag}"`);
    if (asset.lastModified) res.setHeader('Last-Modified', asset.lastModified.toUTCString());
    if (asset.notModified) {
      res.status(304);
      return;
    }
    return new StreamableFile(asset.stream, { type: asset.contentType, disposition: `inline; filename="${asset.fileName.split('/').pop()}"` });
  }
}
