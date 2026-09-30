import { Body, Controller, Get, Header, Param, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { PortalProductService } from './portal-product.service';
import { CreateProductDto, UpdateProductDto, UpdateVariantDto } from './portal-product.dto';
import { ShopId } from '../common/shop-context';
import { parseCsv, toCsv } from '../common/csv';

const CSV_COLUMNS = ['sku', 'productName', 'variantName', 'size', 'priceKes', 'wasPriceKes', 'stockOnHand', 'isActive'];

@ApiTags('portal-product')
@ApiBearerAuth()
@Controller('portal/products')
export class PortalProductController {
  constructor(private portalProductService: PortalProductService) {}

  @Get()
  list(
    @ShopId() shopId: string,
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('status') status?: 'active' | 'inactive',
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.portalProductService.list(shopId, {
      search,
      category,
      status,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  // The filter dropdown's own options -- separate from GET / (the paginated
  // list) since a page of 25 products would otherwise only ever offer the
  // categories present on that one page.
  @Get('categories')
  listCategories(@ShopId() shopId: string) {
    return this.portalProductService.listCategories(shopId);
  }

  // Every variant as one spreadsheet -- productName/variantName/size are
  // included for a human reading the file, but only sku is actually used
  // as the match key on re-import (see importCsv below); editing those
  // three columns has no effect.
  @Get('export-csv')
  @Header('Content-Type', 'text/csv')
  async exportCsv(@ShopId() shopId: string, @Res() res: Response) {
    const rows = await this.portalProductService.exportVariantsForCsv(shopId);
    const csv = toCsv(rows as any, CSV_COLUMNS);
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Disposition', `attachment; filename="products-${date}.csv"`);
    res.send(csv);
  }

  // Update-only bulk edit -- see PortalProductService.importVariantsFromCsv
  // for why this never creates a product. Every row not matching a known
  // SKU is reported back (not silently dropped) so a merchant can fix and
  // re-upload rather than wonder why half their edits didn't apply.
  @Post('import-csv')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  importCsv(@ShopId() shopId: string, @UploadedFile() file?: any) {
    const text = file?.buffer?.toString('utf-8') ?? '';
    const records = parseCsv(text);
    const rows = records.map((r) => ({
      sku: r.sku,
      priceKes: r.priceKes !== undefined && r.priceKes !== '' ? Number(r.priceKes) : undefined,
      wasPriceKes: r.wasPriceKes === '' ? null : r.wasPriceKes !== undefined ? Number(r.wasPriceKes) : undefined,
      stockOnHand: r.stockOnHand !== undefined && r.stockOnHand !== '' ? Number(r.stockOnHand) : undefined,
      isActive: r.isActive !== undefined && r.isActive !== '' ? /^(true|1|yes)$/i.test(r.isActive) : undefined,
    }));
    return this.portalProductService.importVariantsFromCsv(shopId, rows);
  }

  @Post()
  create(@ShopId() shopId: string, @Body() dto: CreateProductDto) {
    return this.portalProductService.create(shopId, dto);
  }

  @Patch(':id')
  update(@ShopId() shopId: string, @Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.portalProductService.update(shopId, id, dto);
  }

  @Patch(':id/active')
  setActive(@ShopId() shopId: string, @Param('id') id: string, @Body('isActive') isActive: boolean) {
    return this.portalProductService.setActive(shopId, id, isActive);
  }

  @Patch('variants/:variantId')
  updateVariant(@ShopId() shopId: string, @Param('variantId') variantId: string, @Body() dto: UpdateVariantDto) {
    return this.portalProductService.updateVariant(shopId, variantId, dto);
  }

  @Patch('variants/:variantId/stock')
  adjustStock(@ShopId() shopId: string, @Param('variantId') variantId: string, @Body('delta') delta: number) {
    return this.portalProductService.adjustStock(shopId, variantId, delta);
  }

  @Patch('variants/:variantId/stock/set')
  setStock(@ShopId() shopId: string, @Param('variantId') variantId: string, @Body('stockOnHand') stockOnHand: number) {
    return this.portalProductService.setStock(shopId, variantId, stockOnHand);
  }
}
