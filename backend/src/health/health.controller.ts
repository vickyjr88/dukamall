import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { NoShopScope } from '../auth/decorators/no-shop-scope.decorator';

@Controller('health')
export class HealthController {
  @Public()
  @NoShopScope()
  @Get()
  check() {
    return { status: 'ok' };
  }
}
