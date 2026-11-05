import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional } from 'class-validator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ShopId } from '../common/shop-context';
import { PortalSectionsService } from './portal-sections.service';

class SetSectionDto {
  @ApiProperty() @IsBoolean() enabled!: boolean;
  @ApiPropertyOptional({ type: [String], description: 'Which starter categories to create when switching on; all when left out.' })
  @IsOptional() @IsArray() categories?: string[];
}

@ApiTags('portal-sections')
@ApiBearerAuth()
@Controller('portal/sections')
export class PortalSectionsController {
  constructor(private service: PortalSectionsService) {}

  /** Any staff member can read it: the product form needs a category's section. */
  @Get()
  overview(@ShopId() shopId: string) { return this.service.overview(shopId); }

  /** What the shop sells is the owner's decision. */
  @Roles('OWNER')
  @Put(':key')
  set(@ShopId() shopId: string, @Param('key') key: string, @Body() dto: SetSectionDto) {
    return this.service.setEnabled(shopId, key, dto.enabled, dto.categories);
  }
}
