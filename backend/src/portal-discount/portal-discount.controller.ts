import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsPositive, IsString, Max, Min } from 'class-validator';
import { DiscountType } from '@prisma/client';
import { PortalDiscountService } from './portal-discount.service';
import { ShopId } from '../common/shop-context';

class CreateDiscountDto {
  @IsString() code!: string;
  @IsIn(['PERCENT', 'FIXED_AMOUNT']) type!: DiscountType;
  @IsOptional() @IsInt() @Min(1) @Max(100) percentOff?: number;
  @IsOptional() @IsPositive() amountOffKes?: number;
  @IsOptional() @IsPositive() minOrderKes?: number;
  @IsOptional() @IsDateString() expiresAt?: string;
  @IsOptional() @IsInt() @Min(1) usageLimit?: number;
}

class SetActiveDto {
  @IsBoolean() isActive!: boolean;
}

@ApiTags('portal-discount')
@ApiBearerAuth()
@Controller('portal/discounts')
export class PortalDiscountController {
  constructor(private portalDiscountService: PortalDiscountService) {}

  @Get()
  list(@ShopId() shopId: string) {
    return this.portalDiscountService.list(shopId);
  }

  @Post()
  create(@ShopId() shopId: string, @Body() dto: CreateDiscountDto) {
    return this.portalDiscountService.create(shopId, {
      code: dto.code,
      type: dto.type,
      percentOff: dto.percentOff,
      amountOffKes: dto.amountOffKes,
      minOrderKes: dto.minOrderKes,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      usageLimit: dto.usageLimit ?? null,
    });
  }

  @Patch(':id/active')
  setActive(@ShopId() shopId: string, @Param('id') id: string, @Body() dto: SetActiveDto) {
    return this.portalDiscountService.setActive(shopId, id, dto.isActive);
  }

  @Delete(':id')
  remove(@ShopId() shopId: string, @Param('id') id: string) {
    return this.portalDiscountService.remove(shopId, id);
  }
}
