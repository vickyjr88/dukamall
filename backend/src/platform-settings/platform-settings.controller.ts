import { Body, Controller, Get, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { PlatformSettingsService } from './platform-settings.service';
import { TrialService } from '../trial/trial.service';
import { AdminJwtGuard } from '../admin-auth/admin-jwt.guard';
import { Public } from '../auth/decorators/public.decorator';
import { NoShopScope } from '../auth/decorators/no-shop-scope.decorator';
import { RateLimit } from '../common/rate-limit.decorator';

class UpdateSmtpSettingsDto {
  @IsOptional() @IsString() smtpHost?: string;
  @IsOptional() @IsInt() @Min(1) @Max(65535) smtpPort?: number;
  @IsOptional() @IsString() smtpUser?: string;
  @IsOptional() @IsString() smtpPassword?: string;
  @IsOptional() @IsString() smtpFrom?: string;
  @IsOptional() @IsBoolean() smtpSecure?: boolean;
}

class UpdateTrialPolicyDto {
  @IsOptional() @IsInt() @Min(1) @Max(90) trialDays?: number;
  @IsOptional() @IsBoolean() suspendExpiredTrials?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(60) trialGraceDays?: number;
}

class SendTestEmailDto {
  // Defaults to the operator's own address.
  @IsOptional() @IsEmail() to?: string;
}

// Same guard stack as AdminController -- see that controller's own header
// comment for why @Public + @NoShopScope + AdminJwtGuard are needed
// together. Kept as its own small controller/module (not folded into
// AdminController) since SMTP config is a platform-wide identity, not a
// per-shop operation like everything else there.
@ApiTags('platform-settings')
@Controller('admin/platform-settings')
@Public()
@NoShopScope()
@UseGuards(AdminJwtGuard)
export class PlatformSettingsController {
  constructor(private platformSettingsService: PlatformSettingsService, private trials: TrialService) {}

  @Get('smtp')
  getSmtp() {
    return this.platformSettingsService.getSmtpSettings();
  }

  @Put('smtp')
  updateSmtp(@Req() req: any, @Body() dto: UpdateSmtpSettingsDto) {
    return this.platformSettingsService.updateSmtpSettings(req.adminId, dto);
  }

  @Get('trial')
  getTrial() {
    return this.platformSettingsService.getTrialPolicy();
  }

  @Put('trial')
  updateTrial(@Req() req: any, @Body() dto: UpdateTrialPolicyDto) {
    return this.platformSettingsService.updateTrialPolicy(req.adminId, dto);
  }

  // Runs the hourly trial check now (reminders, and suspension if switched on)
  // and reports what it did -- for checking the policy does what you expect.
  @RateLimit(6, 60)
  @Post('trial/run')
  runTrialSweep() {
    return this.trials.sweep();
  }

  // Limited so the button can't be used to flood an inbox.
  @RateLimit(6, 60)
  @Post('smtp/test')
  async testSmtp(@Req() req: any, @Body() dto: SendTestEmailDto) {
    const to = dto.to ?? (await this.platformSettingsService.adminEmail(req.adminId));
    return { to, ...(await this.platformSettingsService.sendTestEmail(req.adminId, to)) };
  }
}
