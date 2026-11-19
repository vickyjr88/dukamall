import { Module } from '@nestjs/common';
import { PortalShareController } from './portal-share.controller';
import { PortalShareService } from './portal-share.service';

@Module({ controllers: [PortalShareController], providers: [PortalShareService], exports: [PortalShareService] })
export class PortalShareModule {}
