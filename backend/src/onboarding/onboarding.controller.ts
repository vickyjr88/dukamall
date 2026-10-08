import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OnboardingService } from './onboarding.service';
import { CreateShopDto } from './onboarding.dto';
import { Public } from '../auth/decorators/public.decorator';
import { NoShopScope } from '../auth/decorators/no-shop-scope.decorator';
import { RateLimit } from '../common/rate-limit.decorator';

@ApiTags('onboarding')
@Controller('onboarding')
export class OnboardingController {
  constructor(private onboardingService: OnboardingService) {}

  // Genuinely platform-wide: there is no shop yet, this route creates one.
  @Public()
  @NoShopScope()
  @RateLimit(5, 3600)
  @Post('shops')
  createShop(@Body() dto: CreateShopDto) {
    return this.onboardingService.createShop(dto);
  }
}
