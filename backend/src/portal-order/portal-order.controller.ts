import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString,
  MaxLength, Min, ValidateNested,
} from 'class-validator';
import { FulfilmentStatus, OrderSource, OrderStatus, PaymentMethod } from '@prisma/client';
import { PortalOrderService } from './portal-order.service';
import { ShopId } from '../common/shop-context';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

type StaffUser = { id: string; firstName: string; lastName: string; role: string };

const MANUAL_PAYMENT_METHODS = ['CASH', 'MPESA', 'BANK_TRANSFER', 'OTHER'] as const;

class UpdateOrderStatusDto {
  @IsIn(['PENDING', 'PAID', 'CANCELLED']) status!: OrderStatus;
  // Only meaningful when marking an order PAID by hand: how it was paid.
  @IsOptional() @IsIn(MANUAL_PAYMENT_METHODS) paymentMethod?: PaymentMethod;
  @IsOptional() @IsString() @MaxLength(120) paymentReference?: string;
}

class UpdateFulfilmentDto {
  @IsIn(['UNFULFILLED', 'SHIPPED', 'DELIVERED']) status!: FulfilmentStatus;
  @IsOptional() @IsString() @MaxLength(300) trackingNote?: string;
}

class AddNoteDto {
  @IsString() @IsNotEmpty() @MaxLength(2000) text!: string;
}

class OrderLineInputDto {
  @IsString() @IsNotEmpty() variantId!: string;
  @IsInt() @Min(1) quantity!: number;
}

export class CreateManualOrderDto {
  @IsString() @IsNotEmpty() @MaxLength(80) firstName!: string;
  @IsOptional() @IsString() @MaxLength(80) lastName?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(500) shippingAddress?: string;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => OrderLineInputDto)
  lines!: OrderLineInputDto[];

  @IsIn(['WHATSAPP', 'IN_PERSON', 'OTHER']) source!: OrderSource;

  // Delivery charge for this order, set by whoever is recording it.
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) shippingKes?: number;
  // A one-off discount in money. Owner-only (checked in the service): a cashier
  // can record a sale but not choose to undercut the price list.
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) discountKes?: number;

  @IsOptional() @IsBoolean() markPaid?: boolean;
  @IsOptional() @IsIn(MANUAL_PAYMENT_METHODS) paymentMethod?: PaymentMethod;
  @IsOptional() @IsString() @MaxLength(120) paymentReference?: string;

  @IsOptional() @IsString() @MaxLength(2000) note?: string;
  /** The lead this order is created from; it is marked converted. */
  @IsOptional() @IsString() leadId?: string;
}

@ApiTags('portal-order')
@ApiBearerAuth()
@Controller('portal/orders')
export class PortalOrderController {
  constructor(private portalOrderService: PortalOrderService) {}

  @Get()
  list(
    @ShopId() shopId: string,
    @Query('status') status?: OrderStatus,
    @Query('fulfilment') fulfilment?: FulfilmentStatus,
    @Query('source') source?: OrderSource,
    @Query('search') search?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.portalOrderService.list(shopId, {
      status,
      fulfilment,
      source,
      search,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  // A sale the merchant records by hand -- a WhatsApp order, a walk-in -- so it
  // counts toward stock, revenue and customers like any other. Open to staff
  // (a cashier records sales); a manual discount is owner-only, checked in the
  // service.
  @Post()
  create(@ShopId() shopId: string, @CurrentUser() user: StaffUser, @Body() dto: CreateManualOrderDto) {
    return this.portalOrderService.create(shopId, user, dto);
  }

  @Get(':id')
  get(@ShopId() shopId: string, @Param('id') id: string) {
    return this.portalOrderService.get(shopId, id);
  }

  @Patch(':id/status')
  setStatus(@ShopId() shopId: string, @Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.portalOrderService.setStatus(shopId, id, dto.status, { method: dto.paymentMethod, reference: dto.paymentReference });
  }

  @Patch(':id/fulfilment')
  setFulfilment(@ShopId() shopId: string, @Param('id') id: string, @Body() dto: UpdateFulfilmentDto) {
    return this.portalOrderService.setFulfilment(shopId, id, dto.status, dto.trackingNote);
  }

  @Post(':id/notes')
  addNote(@ShopId() shopId: string, @CurrentUser() user: StaffUser, @Param('id') id: string, @Body() dto: AddNoteDto) {
    return this.portalOrderService.addNote(shopId, id, user, dto.text);
  }
}
